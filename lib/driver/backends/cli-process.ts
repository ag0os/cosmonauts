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
	if (groupPid !== undefined) activeBackendGroups.add(groupPid);

	try {
		const exitCode = await child.exited;
		await reapBackendGroup({ child, invocation, backendName });
		const stdout = await drainWithinDeadline({
			output: stdoutPromise,
			otherOutput: stderrPromise,
			invocation,
			backendName,
		});

		return { exitCode, stdout };
	} finally {
		if (groupPid !== undefined) activeBackendGroups.delete(groupPid);
	}
}

/**
 * Terminates every backend group this process still owns.
 *
 * The detached runner calls this when it is being torn down. Abort signals the
 * runner's own group, and the backend deliberately leads a *different* one, so
 * without this a killed runner would orphan exactly the process this plan exists
 * to stop leaking — the runner never reaches its own reap once it is signalled.
 */
export async function reapActiveBackendGroups(
	options: ReapProcessGroupOptions = {},
): Promise<void> {
	const groups = [...activeBackendGroups];
	await Promise.all(groups.map((pid) => reapProcessGroup(pid, options)));
}

/**
 * INV-3: the drain must not outlive the reap indefinitely. Once the group is
 * gone, anything still holding a pipe has escaped the group (`setsid()`), and no
 * amount of waiting is guaranteed to end. Losing tail output is strictly better
 * than never settling; the loss is reported rather than silent.
 */
async function drainWithinDeadline({
	output,
	otherOutput,
	invocation,
	backendName,
}: {
	output: Promise<string>;
	otherOutput: Promise<string>;
	invocation: BackendInvocation;
	backendName: string;
}): Promise<string> {
	// Both pipes are drained, but only stdout is returned; a stderr reader that
	// never finishes must not hold the call open either.
	const drained = await Promise.race([
		Promise.all([output, otherOutput]).then(([stdout]) => stdout),
		delay(DRAIN_DEADLINE_MS).then(() => undefined),
	]);
	if (drained !== undefined) return drained;

	await reportDiagnostic({
		invocation,
		code: "BACKEND_OUTPUT_DRAIN_TIMED_OUT",
		message: `${backendName} backend output was still held open ${DRAIN_DEADLINE_MS}ms after its process group was reaped; a descendant has left the group and its output is lost`,
	});
	return "";
}

function delay(ms: number): Promise<void> {
	return new Promise((settle) => setTimeout(settle, ms));
}

async function reapBackendGroup({
	child,
	invocation,
	backendName,
}: {
	child: { readonly pid?: number };
	invocation: BackendInvocation;
	backendName: string;
}): Promise<void> {
	const pid = child.pid;
	if (!CAN_REAP_PROCESS_GROUP || pid === undefined) return;

	const outcome = await reapProcessGroup(pid);
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
 * to stderr on a deadline. An unbounded await here would reintroduce the hang
 * this plan exists to remove.
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
		const delivered = await Promise.race([
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
			delay(DIAGNOSTIC_DEADLINE_MS).then(() => false),
		]);
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
