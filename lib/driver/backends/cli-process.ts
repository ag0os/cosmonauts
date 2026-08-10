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
 * Runs a CLI backend and does not return while anything it started is still
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

	const exitCode = await child.exited;
	await reapBackendGroup({ child, invocation, backendName });
	const [stdout] = await Promise.all([stdoutPromise, stderrPromise]);

	return { exitCode, stdout };
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

	await reportUnreapedTree({ invocation, backendName, reason: outcome.reason });
}

/**
 * INV-2: a tree that outlived escalation is surfaced rather than folded into a
 * clean task result. Reporting must not itself fail the task — the backend's
 * own exit code is still the authoritative result — so a sink failure degrades
 * to stderr.
 */
async function reportUnreapedTree({
	invocation,
	backendName,
	reason,
}: {
	invocation: BackendInvocation;
	backendName: string;
	reason: string;
}): Promise<void> {
	const message = `${backendName} backend left processes running after its task finished: ${reason}`;
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
	} catch {
		try {
			process.stderr.write(`[warning] ${message}\n`);
		} catch {
			// Reporting cannot replace the backend's authoritative result.
		}
	}
}
