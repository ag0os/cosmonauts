import { spawn } from "node:child_process";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { BackendRunResult } from "./backends/types.ts";
import {
	type DriverRunSpec,
	type ParsedReport,
	resolveStateCommitPolicy,
} from "./types.ts";

interface CommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface SpawnSuccess {
	readonly status: "success";
	readonly result: BackendRunResult;
}

export interface SpawnFailure {
	readonly status: "failure";
	readonly error: string;
	readonly exitCode?: number;
}

type TimedBackendResult = SpawnSuccess | SpawnFailure;

export function driveRunExpectations(spec: DriverRunSpec) {
	return {
		backendName: spec.backendName,
		commitPolicy: spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(spec),
		preflightCommands: spec.preflightCommands,
		postflightCommands: spec.postflightCommands,
		projectRoot: spec.projectRoot,
		workdir: spec.workdir,
		branch: spec.branch,
	};
}

export function reportSummary(report: ParsedReport): string | undefined {
	const text = report.outcome === "unknown" ? report.raw : report.notes;
	if (!text) return undefined;
	const line = text
		.split(/\r?\n/)
		.map((item) => item.trim())
		.find((item) => item.length > 0);
	if (!line) return undefined;
	return (
		line
			.replace(/^(implemented|status|summary):\s*/i, "")
			.slice(0, 80)
			.trim() || undefined
	);
}

export async function uncheckedAcceptanceCriteriaReason(
	taskManager: TaskManager,
	taskId: string,
): Promise<string | undefined> {
	const task = await taskManager.getTask(taskId);
	if (!task) {
		return `task not found during acceptance-criteria verification: ${taskId}`;
	}
	const unchecked = task.acceptanceCriteria.filter(
		(criterion) => !criterion.checked,
	);
	if (unchecked.length === 0) return undefined;
	const ids = unchecked.map((criterion) => `#${criterion.index}`).join(", ");
	return `acceptance criteria still unchecked: ${ids}`;
}

export function authoritativeDriveTaskIds(
	metadata: Record<string, unknown> | undefined,
	spec: DriverRunSpec,
): readonly string[] {
	const value = metadata?.driveTaskIds;
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? value
		: spec.taskIds;
}

type PreflightCheck =
	| { readonly passed: true }
	| {
			readonly passed: false;
			readonly reason: string;
			readonly details: Record<string, string>;
	  };

export async function checkDrivePreflight(
	spec: DriverRunSpec,
	signal: AbortSignal,
): Promise<PreflightCheck> {
	if (spec.branch) {
		const branch = await runCommand(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			spec.projectRoot,
			signal,
		);
		if (branch.exitCode !== 0) {
			const reason = branch.stderr || "failed to determine git branch";
			return {
				passed: false,
				reason,
				details: {
					command: "git rev-parse --abbrev-ref HEAD",
					stderr: reason,
				},
			};
		}
		const actualBranch = branch.stdout.trim();
		if (actualBranch !== spec.branch) {
			const reason = `branch mismatch: expected ${spec.branch}, got ${actualBranch}`;
			return {
				passed: false,
				reason,
				details: { branch: actualBranch, stderr: reason },
			};
		}
	}
	for (const command of spec.preflightCommands) {
		const result = await runShellCommand(command, spec.projectRoot, signal);
		if (result.exitCode !== 0) {
			const reason = result.stderr || `preflight failed: ${command}`;
			return {
				passed: false,
				reason,
				details: { command, stderr: reason },
			};
		}
	}
	return { passed: true };
}

export function runShellCommand(
	command: string,
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return runCommand(command, [], cwd, signal, true);
}

export function runCommand(
	command: string,
	args: string[],
	cwd: string,
	signal: AbortSignal,
	shell = false,
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell,
			signal,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", (error) => {
			if ((error as NodeJS.ErrnoException).name === "AbortError") {
				resolve({
					exitCode: 124,
					stdout: Buffer.concat(stdout).toString(),
					stderr: Buffer.concat(stderr).toString() || formatError(error),
				});
				return;
			}
			reject(error);
		});
		child.on("close", (code) => {
			resolve({
				exitCode: code ?? 1,
				stdout: Buffer.concat(stdout).toString(),
				stderr: Buffer.concat(stderr).toString(),
			});
		});
	});
}

export function runBackendWithTimeout(
	run: (signal: AbortSignal) => Promise<BackendRunResult>,
	timeoutMs: number,
	parentSignal: AbortSignal,
): Promise<TimedBackendResult> {
	const controller = new AbortController();
	let timedOut = false;
	let timeout: NodeJS.Timeout | undefined;
	const abortFromParent = () => controller.abort(parentSignal.reason);
	if (parentSignal.aborted) abortFromParent();
	else parentSignal.addEventListener("abort", abortFromParent, { once: true });

	const timeoutPromise = new Promise<SpawnFailure>((resolve) => {
		timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
			resolve({
				status: "failure",
				error: `task timed out after ${timeoutMs}ms`,
				exitCode: 124,
			});
		}, timeoutMs);
	});
	const runPromise: Promise<TimedBackendResult> = run(controller.signal).then(
		(result) => ({ status: "success", result }),
		(error: unknown) => ({
			status: "failure",
			error: formatError(error),
			exitCode: timedOut ? 124 : undefined,
		}),
	);
	return Promise.race([runPromise, timeoutPromise]).finally(() => {
		if (timeout) clearTimeout(timeout);
		parentSignal.removeEventListener("abort", abortFromParent);
	});
}

export type RetriableTaskAttempt<T> =
	| { readonly kind: "outcome"; readonly outcome: T }
	| {
			readonly kind: "block-candidate";
			readonly reason: string;
			readonly finalize: (
				contradicted:
					| { readonly path: string; readonly existsOnDisk: true }
					| undefined,
				options?: { readonly skipTaskUpdate?: boolean },
			) => Promise<T>;
	  };

export async function runContradictedAttempts<
	T,
	Contradicted extends {
		readonly annotation: { readonly path: string; readonly existsOnDisk: true };
	},
>(options: {
	readonly spec: DriverRunSpec;
	readonly attempt: (
		appendedNote: string | undefined,
	) => Promise<RetriableTaskAttempt<T>>;
	readonly find: (
		reason: string,
		projectRoot: string,
	) => Contradicted | undefined;
	readonly buildNote: (contradicted: Contradicted) => string;
	readonly onRetry?: () => Promise<void>;
}): Promise<T> {
	let appendedNote: string | undefined;
	let retried = false;
	while (true) {
		const attempt = await options.attempt(appendedNote);
		if (attempt.kind === "outcome") return attempt.outcome;
		const contradicted =
			!retried && (options.spec.retryOnContradictedBlock ?? true)
				? options.find(attempt.reason, options.spec.projectRoot)
				: undefined;
		if (!contradicted) return attempt.finalize(undefined);
		retried = true;
		await attempt.finalize(contradicted.annotation, {
			skipTaskUpdate: true,
		});
		appendedNote = options.buildNote(contradicted);
		await options.onRetry?.();
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
