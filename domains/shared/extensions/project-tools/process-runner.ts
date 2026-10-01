import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ChildRunOutcome,
	runChild,
} from "../../../../lib/process/run-child.ts";

export { classifyTaskkillExitCode } from "../../../../lib/process/run-child.ts";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
export const DEFAULT_TERMINATION_GRACE_MS = 250;
const DEFAULT_FORCE_KILL_WAIT_MS = 1_000;
const PROVIDER_STDOUT_SPOOL = "provider-stdout.log";
const PROVIDER_STDERR_SPOOL = "provider-stderr.log";
const OUTPUT_CAPTURE_FAILED_CODE = "OUTPUT_CAPTURE_FAILED";

export interface ProviderProcessInvocation {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

interface ProviderProcessRunOptions {
	readonly timeoutMs?: number;
	readonly terminationGraceMs?: number;
	/**
	 * Final synchronous authorization, executable-identity, and provider-config
	 * validation.
	 * Runner preparation is complete before this runs, and spawn follows without
	 * an intervening await.
	 */
	readonly beforeSpawn?: () => void;
	/** Test-only lifecycle observer; cannot change output capture behavior. */
	readonly onOutputSpoolReady?: (outputSpoolRoot: string) => void;
}

interface ProviderProcessOutput {
	readonly stdout: string;
	readonly stderr: string;
}

export type ProviderProcessOutcome =
	| (ProviderProcessOutput & {
			readonly kind: "code-exit";
			readonly code: number;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "signal-exit";
			readonly signal: NodeJS.Signals;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "spawn-error";
			readonly error: Error & { readonly code?: string };
	  })
	| (ProviderProcessOutput & {
			readonly kind: "aborted";
			readonly reason: unknown;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "timeout";
			readonly reason: string;
			readonly timeoutMs: number;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "termination-error";
			readonly initiated: InitiatedTermination;
			readonly error: Error & { readonly code: string };
	  });

export type ProviderProcessExecutor = (
	invocation: ProviderProcessInvocation,
	signal?: AbortSignal,
	options?: ProviderProcessRunOptions,
) => Promise<ProviderProcessOutcome>;

type InitiatedTermination =
	| { readonly kind: "aborted"; readonly reason: unknown }
	| {
			readonly kind: "timeout";
			readonly reason: string;
			readonly timeoutMs: number;
	  };

const PROCESS_TREE_CLEANUP_FAILED_CODE = "PROCESS_TREE_CLEANUP_FAILED";

function finiteTimeout(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_PROVIDER_TIMEOUT_MS;
}

function finiteGracePeriod(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_TERMINATION_GRACE_MS;
}

function errorWithOptionalCode(
	error: unknown,
): Error & { readonly code?: string } {
	if (!(error instanceof Error)) return new Error(String(error));
	if ("code" in error && typeof error.code === "string") {
		return Object.assign(error, { code: error.code });
	}
	return error;
}

function appendRunnerStderr(stderr: string, runnerStderr: string): string {
	if (runnerStderr.length === 0) return stderr;
	return `${stderr}${stderr.length === 0 ? "" : "\n"}${runnerStderr}`;
}

function emptyOutcome(
	outcome:
		| { readonly kind: "aborted"; readonly reason: unknown }
		| {
				readonly kind: "spawn-error";
				readonly error: Error & { readonly code?: string };
		  },
): ProviderProcessOutcome {
	return { ...outcome, stdout: "", stderr: "" };
}

/**
 * Runs a provider through the shared child runner (`lib/process/run-child.ts`):
 * its own process group, output spooled to private temp files that are read
 * back losslessly and removed, and the process tree it can find reaped after
 * any exit (`run-child.ts` names what it cannot find).
 */
export const runProviderProcess: ProviderProcessExecutor = async (
	invocation,
	signal,
	options,
) => {
	if (signal?.aborted)
		return emptyOutcome({ kind: "aborted", reason: signal.reason });
	let outputSpoolRoot: string;
	try {
		outputSpoolRoot = await mkdtemp(
			join(tmpdir(), "cosmonauts-provider-output-"),
		);
	} catch (error) {
		return emptyOutcome({
			kind: "spawn-error",
			error: errorWithOptionalCode(error),
		});
	}
	try {
		if (signal?.aborted)
			return emptyOutcome({ kind: "aborted", reason: signal.reason });
		const output = {
			stdout: join(outputSpoolRoot, PROVIDER_STDOUT_SPOOL),
			stderr: join(outputSpoolRoot, PROVIDER_STDERR_SPOOL),
		};
		options?.onOutputSpoolReady?.(outputSpoolRoot);
		const timeoutMs = finiteTimeout(options?.timeoutMs);
		const outcome = await runChild({
			command: invocation.executablePath,
			args: invocation.args,
			cwd: invocation.cwd,
			output,
			outputCapBytes: Number.POSITIVE_INFINITY,
			timeoutMs,
			graceMs: finiteGracePeriod(options?.terminationGraceMs),
			killWaitMs: DEFAULT_FORCE_KILL_WAIT_MS,
			...(signal ? { signal } : {}),
			...(options?.beforeSpawn ? { beforeSpawn: options.beforeSpawn } : {}),
		});
		return await providerOutcome(outcome);
	} finally {
		await rm(outputSpoolRoot, { recursive: true, force: true });
	}
};

async function providerOutcome(
	outcome: ChildRunOutcome,
): Promise<ProviderProcessOutcome> {
	let stdout: string;
	let stderr: string;
	try {
		[stdout, stderr] = await Promise.all([
			readFile(outcome.stdout.path, "utf8"),
			readFile(outcome.stderr.path, "utf8"),
		]);
	} catch (error) {
		return {
			kind: "spawn-error",
			error: Object.assign(
				new Error(
					`Provider output capture failed: ${errorWithOptionalCode(error).message}`,
				),
				{ code: OUTPUT_CAPTURE_FAILED_CODE },
			),
			stdout: "",
			stderr: "",
		};
	}
	const output = {
		stdout,
		stderr: appendRunnerStderr(stderr, outcome.notes.join("\n")),
	};
	const initiated = initiatedTermination(outcome);
	const survived =
		outcome.tree.kind === "survived" ? outcome.tree.reason : undefined;
	if (initiated !== undefined) {
		if (survived === undefined) return { ...initiated, ...output };
		return {
			kind: "termination-error",
			initiated,
			error: cleanupError(survived),
			...output,
		};
	}
	if (survived !== undefined)
		return { kind: "spawn-error", error: cleanupError(survived), ...output };
	return { ...naturalExit(outcome), ...output };
}

function initiatedTermination(
	outcome: ChildRunOutcome,
): InitiatedTermination | undefined {
	const { stopped } = outcome;
	if (stopped === undefined) return undefined;
	if (stopped.kind === "aborted")
		return { kind: "aborted", reason: stopped.reason };
	return {
		kind: "timeout",
		reason: `Timed out after ${stopped.timeoutMs}ms`,
		timeoutMs: stopped.timeoutMs,
	};
}

function cleanupError(reason: string): Error & { readonly code: string } {
	return Object.assign(
		new Error(`Provider process tree did not terminate: ${reason}`),
		{ code: PROCESS_TREE_CLEANUP_FAILED_CODE },
	);
}

type NaturalExit =
	| { readonly kind: "code-exit"; readonly code: number }
	| { readonly kind: "signal-exit"; readonly signal: NodeJS.Signals }
	| {
			readonly kind: "spawn-error";
			readonly error: Error & { readonly code?: string };
	  };

function naturalExit(outcome: ChildRunOutcome): NaturalExit {
	const { exit } = outcome;
	switch (exit.kind) {
		case "code":
			return { kind: "code-exit", code: exit.code };
		case "signal":
			return { kind: "signal-exit", signal: exit.signal };
		case "spawn-error":
			return { kind: "spawn-error", error: errorWithOptionalCode(exit.error) };
		default:
			return {
				kind: "spawn-error",
				error: new Error(
					"Provider process closed without an exit code or signal",
				),
			};
	}
}
