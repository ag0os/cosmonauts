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

/**
 * Once teardown starts the registry is closed: a backend that registers after
 * the teardown snapshot is reaped immediately rather than outliving it. Bun
 * still returns a subprocess when handed an already-aborted signal, so this race
 * is reachable rather than theoretical.
 */
let terminating: ReapProcessGroupOptions | undefined;

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
	const stdoutPromise = new Response(child.stdout).text();
	const stderrPromise = new Response(child.stderr).text();

	const groupPid = CAN_REAP_PROCESS_GROUP ? child.pid : undefined;
	const teardown = registerBackendGroup(groupPid);

	try {
		const exitCode = await child.exited;
		if (teardown) {
			// Teardown already began; reap now rather than finishing the task.
			await reapProcessGroup(groupPid as number, teardown);
		} else {
			await reapBackendGroup({ groupPid, invocation, backendName });
		}
		// Ownership ends with the reap, not with the drain. Holding a dead pid in
		// the registry across the drain would leave it signalable after the OS
		// could have recycled it.
		releaseBackendGroup(groupPid);

		const stdout = await drainWithinDeadline({
			stdoutPromise,
			stderrPromise,
			invocation,
			backendName,
		});

		return { exitCode, stdout };
	} finally {
		releaseBackendGroup(groupPid);
	}
}

/** Returns teardown options when termination already began, else undefined. */
function registerBackendGroup(
	groupPid: number | undefined,
): ReapProcessGroupOptions | undefined {
	if (groupPid === undefined) return undefined;
	activeBackendGroups.add(groupPid);
	return terminating;
}

function releaseBackendGroup(groupPid: number | undefined): void {
	if (groupPid !== undefined) activeBackendGroups.delete(groupPid);
}

/**
 * Terminates every backend group this process still owns, and closes the
 * registry so a backend spawned mid-teardown is reaped rather than stranded.
 *
 * The detached runner calls this when it is being torn down. Abort signals the
 * runner's own group, and the backend deliberately leads a *different* one, so
 * without this a killed runner would orphan exactly the process this plan exists
 * to stop leaking — the runner never reaches its own reap once it is signalled.
 */
export async function reapActiveBackendGroups(
	options: ReapProcessGroupOptions = {},
): Promise<void> {
	terminating = options;
	const groups = [...activeBackendGroups];
	await Promise.all(
		groups.map(async (pid) => {
			await reapProcessGroup(pid, options);
			activeBackendGroups.delete(pid);
		}),
	);
}

/**
 * INV-3: the drain must not outlive the reap indefinitely. Once the group is
 * gone, anything still holding a pipe has escaped the group (`setsid()`), and no
 * amount of waiting is guaranteed to end.
 *
 * The two streams are bounded independently. Only stdout is returned, so a stuck
 * *stderr* must not discard an already-complete stdout — that would turn a
 * successful task into an unparseable report and a spurious failure.
 */
async function drainWithinDeadline({
	stdoutPromise,
	stderrPromise,
	invocation,
	backendName,
}: {
	stdoutPromise: Promise<string>;
	stderrPromise: Promise<string>;
	invocation: BackendInvocation;
	backendName: string;
}): Promise<string> {
	const [stdout] = await Promise.all([
		settleWithin(stdoutPromise, DRAIN_DEADLINE_MS),
		settleWithin(stderrPromise, DRAIN_DEADLINE_MS),
	]);
	if (stdout !== undefined) return stdout;

	await reportDiagnostic({
		invocation,
		code: "BACKEND_OUTPUT_DRAIN_TIMED_OUT",
		message: `${backendName} backend stdout was still held open ${DRAIN_DEADLINE_MS}ms after its process group was reaped; a descendant has left the group and the output is lost`,
	});
	return "";
}

/**
 * Resolves the value, or `undefined` once the deadline passes.
 *
 * The timer is always cleared. An uncleared `setTimeout` stays referenced and
 * keeps the event loop alive, which would hold the detached runner open past the
 * driver's SIGKILL deadline and get its cleanup cut off mid-write.
 */
async function settleWithin<T>(
	value: Promise<T>,
	timeoutMs: number,
): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			value,
			new Promise<undefined>((settle) => {
				timer = setTimeout(() => settle(undefined), timeoutMs);
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
	try {
		const delivered = await settleWithin(
			invocation
				.eventSink({
					type: "driver_diagnostic",
					level: "warning",
					code,
					message,
					phase: "spawn",
					taskId: invocation.taskId,
					runId: invocation.runId,
					parentSessionId: invocation.parentSessionId,
					timestamp: new Date().toISOString(),
				})
				.then(() => true),
			DIAGNOSTIC_DEADLINE_MS,
		);
		if (delivered) return;
	} catch {
		// Falls through to stderr below.
	}
	try {
		process.stderr.write(`[warning] ${message}\n`);
	} catch {
		// Reporting cannot replace the backend's authoritative result.
	}
}
