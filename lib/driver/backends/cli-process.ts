import {
	type ReapProcessGroupOptions,
	reapProcessGroup,
} from "../../process/process-group.ts";
import type { BunRuntime } from "./bun-runtime.ts";
import type { BackendInvocation } from "./types.ts";

declare const Bun: BunRuntime;

/** Bounded so an escaped pipe holder cannot hold the backend open forever. */
const DRAIN_DEADLINE_MS = 2_000;
/** Bounded so a stalled event sink cannot hold the backend open forever. */
const DIAGNOSTIC_DEADLINE_MS = 2_000;

/**
 * Process-group reaping is a POSIX mechanism. On win32 the child is not
 * detached, so its pid names the group this process belongs to — negating it
 * would signal ourselves. Windows keeps direct-child-only behaviour (D-005).
 */
const CAN_REAP_PROCESS_GROUP = process.platform !== "win32";

export interface CliBackendProcessOptions {
	readonly argv: readonly string[];
	readonly invocation: BackendInvocation;
	readonly backendName: string;
}

export interface CliBackendProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
}

/**
 * Process groups this backend created and has not yet reaped, so a runner being
 * torn down can terminate them before it dies (see `reapActiveBackendGroups`).
 */
const activeBackendGroups = new Set<number>();

/** Set once shutdown begins; see `isTerminating` for the one-way caveat. */
let terminating = false;
/** Caps how long shutdown will keep re-draining the registry. */
const TEARDOWN_DEADLINE_MS = 2_000;

/**
 * Runs a CLI backend and does not return while any process still in its group is
 * alive.
 *
 * `child.exited` only covers the direct child; a descendant that outlives it is
 * orphaned and, on the run that motivated this, survived by 68 minutes while the
 * run reported success. The child therefore leads its own process group and the
 * group is reaped once the direct child exits.
 *
 * The reap deliberately precedes the stdout/stderr drain (D-004): a descendant
 * that inherited the pipes keeps them from reaching EOF, so draining first would
 * block until the task timeout. Killing the pipe holders is what lets the drain
 * finish.
 *
 * Limit (D-006): a descendant that calls `setsid()` leaves the group and is
 * beyond a group reap. The drain is therefore bounded rather than unbounded — an
 * escapee holding the pipes must not be able to hang the backend forever.
 */
export async function runCliBackendProcess({
	argv,
	invocation,
	backendName,
}: CliBackendProcessOptions): Promise<CliBackendProcessResult> {
	const [command, ...args] = argv;
	if (command === undefined) {
		throw new Error(`${backendName} backend received an empty argv`);
	}

	const child = Bun.spawn([command, ...args], {
		cwd: invocation.projectRoot,
		stdin: Bun.file(invocation.promptPath),
		stdout: "pipe",
		stderr: "pipe",
		...(CAN_REAP_PROCESS_GROUP ? { detached: true } : {}),
		...(invocation.signal ? { signal: invocation.signal } : {}),
	});

	// Start draining before awaiting exit so a chatty child cannot deadlock on a
	// full pipe buffer, but do not await the drain until the group is reaped.
	const stdoutDrain = drainStream(child.stdout);
	const stderrDrain = drainStream(child.stderr);

	const groupPid = CAN_REAP_PROCESS_GROUP ? child.pid : undefined;
	registerBackendGroup(groupPid);

	try {
		const exitCode = await child.exited;
		await reapBackendGroup({ groupPid, invocation, backendName });
		// Ownership ends with the reap, not with the drain. Holding a dead pid in
		// the registry across the drain would leave it signalable after the OS
		// could have recycled it.
		releaseBackendGroup(groupPid);

		const stdout = await drainWithinDeadline({
			stdoutDrain,
			stderrDrain,
			invocation,
			backendName,
		});

		return { exitCode, stdout };
	} finally {
		releaseBackendGroup(groupPid);
		// Abandoning a read leaves it an active event-loop resource, which would
		// hold this process open exactly as an uncleared timer did.
		stdoutDrain.cancel();
		stderrDrain.cancel();
	}
}

function registerBackendGroup(groupPid: number | undefined): void {
	if (groupPid !== undefined) activeBackendGroups.add(groupPid);
}

function releaseBackendGroup(groupPid: number | undefined): void {
	if (groupPid !== undefined) activeBackendGroups.delete(groupPid);
}

/**
 * Terminates every backend group this process still owns.
 *
 * The detached runner calls this when it is being torn down. Abort signals the
 * runner's own group, and the backend deliberately leads a *different* one, so
 * without this a killed runner would orphan exactly the process this plan exists
 * to stop leaking — the runner never reaches its own reap once it is signalled.
 *
 * It re-snapshots until the registry drains, because a backend can register
 * *after* the first snapshot: Bun still returns a subprocess when handed an
 * already-aborted signal. A single snapshot would return while that late backend
 * was still running, and the runner would then be killed on top of it. Bounded,
 * so a backend that keeps running cannot hold shutdown open — its group is
 * reaped on the next pass regardless of whether its task finished.
 */
export async function reapActiveBackendGroups(
	options: ReapProcessGroupOptions = {},
): Promise<void> {
	terminating = true;
	const deadline = Date.now() + TEARDOWN_DEADLINE_MS;
	while (activeBackendGroups.size > 0) {
		const groups = [...activeBackendGroups];
		await Promise.all(
			groups.map(async (pid) => {
				await reapProcessGroup(pid, options);
				activeBackendGroups.delete(pid);
			}),
		);
		if (Date.now() >= deadline) return;
	}
}

/**
 * True once shutdown has begun. One-way and process-global by design: the only
 * caller is the detached runner's signal handler, in a process that is exiting.
 * Do not call `reapActiveBackendGroups` from a long-lived host without giving
 * this a reset — every later backend would be treated as shutting down.
 */
export function isTerminating(): boolean {
	return terminating;
}

/**
 * A stream read that can be given up on without leaking the read itself.
 *
 * `new Response(stream).text()` cannot be cancelled once it locks the stream, so
 * a timeout could only abandon the promise — leaving the read an active
 * event-loop resource that holds the process open. Reading through an explicit
 * reader keeps cancellation available, and keeps whatever arrived before the
 * deadline instead of discarding it.
 */
interface StreamDrain {
	readonly text: Promise<string>;
	/** Partial text captured so far; meaningful after `cancel()`. */
	partial(): string;
	cancel(): void;
}

function drainStream(source: unknown): StreamDrain {
	if (!(source instanceof ReadableStream)) {
		// Test stubs hand back plain strings rather than a live pipe.
		const text = new Response(
			source as ConstructorParameters<typeof Response>[0],
		).text();
		return { text, partial: () => "", cancel: () => undefined };
	}

	const reader = (source as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	let captured = "";
	let cancelled = false;

	const text = (async () => {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) captured += decoder.decode(value, { stream: true });
		}
		captured += decoder.decode();
		return captured;
	})();

	return {
		text,
		partial: () => captured,
		cancel: () => {
			if (cancelled) return;
			cancelled = true;
			void reader.cancel().catch(() => undefined);
		},
	};
}

/**
 * INV-3: the drain must not outlive the reap indefinitely. Once the group is
 * gone, anything still holding a pipe has escaped the group (`setsid()`), and no
 * amount of waiting is guaranteed to end.
 *
 * The two streams are bounded and reported independently. A stuck or failed
 * *stderr* must not discard an already-complete stdout — that would turn a
 * successful task into an unparseable report and a spurious failure — and a
 * stuck stderr is still a leaked pipe holder, so it is reported rather than
 * passed over in silence.
 */
async function drainWithinDeadline({
	stdoutDrain,
	stderrDrain,
	invocation,
	backendName,
}: {
	stdoutDrain: StreamDrain;
	stderrDrain: StreamDrain;
	invocation: BackendInvocation;
	backendName: string;
}): Promise<string> {
	const [stdout, stderr] = await Promise.all([
		settleWithin(stdoutDrain.text, DRAIN_DEADLINE_MS),
		settleWithin(stderrDrain.text, DRAIN_DEADLINE_MS),
	]);

	const stuck: string[] = [];
	if (stdout.state !== "settled") stuck.push(`stdout (${stdout.state})`);
	if (stderr.state !== "settled") stuck.push(`stderr (${stderr.state})`);

	if (stuck.length > 0) {
		await reportDiagnostic({
			invocation,
			code: "BACKEND_OUTPUT_DRAIN_TIMED_OUT",
			message: `${backendName} backend output was not fully drained ${DRAIN_DEADLINE_MS}ms after its process group was reaped (${stuck.join(", ")}); a descendant may have left the group`,
		});
	}

	// Whatever arrived before the deadline is still the child's own output, and
	// is far more useful to the report parser than an empty string.
	return stdout.state === "settled" ? stdout.value : stdoutDrain.partial();
}

type Settled<T> =
	| { readonly state: "settled"; readonly value: T }
	| { readonly state: "timed-out" }
	| { readonly state: "failed" };

/**
 * Resolves how the promise ended rather than throwing, so one stream's failure
 * cannot discard the other's result.
 *
 * The timer is always cleared. An uncleared `setTimeout` stays referenced and
 * keeps the event loop alive, which would hold the detached runner open past the
 * driver's SIGKILL deadline and get its cleanup cut off mid-write.
 */
async function settleWithin<T>(
	value: Promise<T>,
	timeoutMs: number,
): Promise<Settled<T>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			value.then(
				(resolved): Settled<T> => ({ state: "settled", value: resolved }),
				(): Settled<T> => ({ state: "failed" }),
			),
			new Promise<Settled<T>>((settle) => {
				timer = setTimeout(() => settle({ state: "timed-out" }), timeoutMs);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function reapBackendGroup({
	groupPid,
	invocation,
	backendName,
}: {
	groupPid: number | undefined;
	invocation: BackendInvocation;
	backendName: string;
}): Promise<void> {
	if (groupPid === undefined) return;

	const outcome = await reapProcessGroup(groupPid);
	if (outcome.kind !== "survived") return;

	await reportDiagnostic({
		invocation,
		code: "BACKEND_PROCESS_TREE_SURVIVED",
		message: `${backendName} backend left processes running after its task finished: ${outcome.reason}`,
	});
}

/**
 * INV-2: a leak is surfaced rather than folded into a clean task result.
 *
 * Reporting must not itself fail or stall the task — the backend's exit code is
 * the authoritative result — so a sink that rejects *or never settles* degrades
 * to stderr on a deadline.
 */
async function reportDiagnostic({
	invocation,
	code,
	message,
}: {
	invocation: BackendInvocation;
	code: string;
	message: string;
}): Promise<void> {
	const delivered = await settleWithin(
		invocation.eventSink({
			type: "driver_diagnostic",
			level: "warning",
			code,
			message,
			phase: "spawn",
			taskId: invocation.taskId,
			runId: invocation.runId,
			parentSessionId: invocation.parentSessionId,
			timestamp: new Date().toISOString(),
		}),
		DIAGNOSTIC_DEADLINE_MS,
	);
	if (delivered.state === "settled") return;

	try {
		process.stderr.write(`[warning] ${message}\n`);
	} catch {
		// Reporting cannot replace the backend's authoritative result.
	}
}
