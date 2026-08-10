import { reapProcessGroup } from "../../process/process-group.ts";
import type { BunRuntime } from "./bun-runtime.ts";
import type { BackendInvocation } from "./types.ts";

declare const Bun: BunRuntime;

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
 * The reap deliberately precedes the stdout/stderr drain (D-004). A descendant
 * that inherited the pipes keeps them from reaching EOF, so draining first would
 * block until the task timeout; killing the pipe holders is what lets the drain
 * finish. That ordering is the whole mechanism — no drain deadline is involved.
 *
 * Known gap (D-010): a descendant that calls `setsid()` leaves the group and is
 * beyond any group reap. If it also holds a pipe, this drain waits for it, as it
 * does on `main` today. Bounding that was tried and repeatedly cost more than it
 * bought; it is recorded rather than guessed at.
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
	// Handlers attach now, not at the await below: the gap spans the whole task
	// and Bun treats an unhandled rejection as fatal.
	stdoutPromise.catch(() => undefined);
	stderrPromise.catch(() => undefined);

	const groupPid = CAN_REAP_PROCESS_GROUP ? child.pid : undefined;
	if (groupPid !== undefined) activeBackendGroups.add(groupPid);

	try {
		const exitCode = await child.exited;
		await reapBackendGroup({ groupPid, invocation, backendName });
		const [stdout] = await Promise.all([stdoutPromise, stderrPromise]);
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
	options: { termGraceMs?: number; killGraceMs?: number } = {},
): Promise<void> {
	const groups = [...activeBackendGroups];
	await Promise.all(
		groups.map(async (pid) => {
			await reapProcessGroup(pid, options);
			activeBackendGroups.delete(pid);
		}),
	);
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

	await reportUnreapedTree({
		invocation,
		message: `${backendName} backend left processes running after its task finished: ${outcome.reason}`,
	});
}

/**
 * INV-2: a leak is surfaced rather than folded into a clean task result.
 *
 * Reporting must not itself fail the task — the backend's exit code is the
 * authoritative result — so a sink that throws, synchronously or otherwise,
 * degrades to stderr.
 */
async function reportUnreapedTree({
	invocation,
	message,
}: {
	invocation: BackendInvocation;
	message: string;
}): Promise<void> {
	try {
		await invocation.eventSink({
			type: "driver_diagnostic",
			level: "warning",
			code: "BACKEND_PROCESS_TREE_SURVIVED",
			message,
			phase: "spawn",
			taskId: invocation.taskId,
			runId: invocation.runId,
			parentSessionId: invocation.parentSessionId,
			timestamp: new Date().toISOString(),
		});
		return;
	} catch {
		// Falls through to stderr below.
	}
	try {
		process.stderr.write(`[warning] ${message}\n`);
	} catch {
		// Reporting cannot replace the backend's authoritative result.
	}
}
