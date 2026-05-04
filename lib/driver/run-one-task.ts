import { spawn } from "node:child_process";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { Backend, BackendRunResult } from "./backends/types.ts";
import { acquireRepoCommitLock } from "./lock.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { parseReport } from "./report-parser.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	ParsedReport,
	PromptLayers,
	Report,
	ReportOutcome,
	TaskOutcome,
} from "./types.ts";

export interface RunOneTaskCtx {
	taskManager: TaskManager;
	backend: Backend;
	eventSink: EventSink;
	parentSessionId: string;
	runId: string;
	abortSignal: AbortSignal;
	cosmonautsRoot: string;
}

export interface PostVerifyResult {
	command: string;
	status: "pass" | "fail";
	stderr?: string;
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface SpawnSuccess {
	status: "success";
	result: BackendRunResult;
}

interface SpawnFailure {
	status: "failure";
	error: string;
	exitCode?: number;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir: string;
}

const DEFAULT_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const EXCLUDED_COMMIT_PATHS = [
	":(exclude)missions",
	":(exclude)missions/**",
	":(exclude)memory",
	":(exclude)memory/**",
	":(exclude).cosmonauts/driver-commit.lock",
];

export async function runOneTask(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
): Promise<TaskOutcome> {
	await emit(ctx, spec, { type: "task_started", taskId });

	const preflight = await runPreflight(spec, ctx, taskId);
	if (!preflight.passed) {
		return { status: "blocked", reason: preflight.reason };
	}

	await ctx.taskManager.updateTask(taskId, { status: "In Progress" });

	const promptLayers: PromptLayersWithWorkdir = {
		...spec.promptTemplate,
		workdir: spec.workdir,
	};
	const promptPath = await renderPromptForTask(
		taskId,
		promptLayers,
		ctx.taskManager,
	);

	await emit(ctx, spec, {
		type: "spawn_started",
		taskId,
		backend: ctx.backend.name,
	});

	const spawnResult = await runBackend(spec, ctx, taskId, promptPath);
	if (spawnResult.status === "failure") {
		await emit(ctx, spec, {
			type: "spawn_failed",
			taskId,
			error: spawnResult.error,
			exitCode: spawnResult.exitCode,
		});
		return blockTask(ctx, spec, taskId, spawnResult.error);
	}

	if (spawnResult.result.exitCode !== 0) {
		const reason = `spawn failed with exit code ${spawnResult.result.exitCode}`;
		await emit(ctx, spec, {
			type: "spawn_failed",
			taskId,
			error: reason,
			exitCode: spawnResult.result.exitCode,
		});
		return blockTask(ctx, spec, taskId, reason);
	}

	const parsedReport = parseReport(spawnResult.result.stdout);
	await emit(ctx, spec, {
		type: "spawn_completed",
		taskId,
		report: parsedReport,
	});

	const postVerifyResults = await runPostVerify(spec, ctx, taskId);
	const outcome = deriveOutcome(parsedReport, postVerifyResults);
	const failureReason = deriveFailureReason(parsedReport, postVerifyResults);
	let commitSha: string | undefined;
	try {
		commitSha = await maybeCommit(spec, ctx, taskId, outcome);
	} catch (error) {
		if (error instanceof CommitFailedError) {
			return { status: "blocked", reason: error.message };
		}
		throw error;
	}

	return transitionTaskStatus({
		spec,
		ctx,
		taskId,
		outcome,
		parsedReport,
		failureReason,
		commitSha,
	});
}

export function deriveOutcome(
	report: ParsedReport,
	postVerifyResults: readonly PostVerifyResult[],
): ReportOutcome {
	if (report.outcome !== "unknown") {
		return report.outcome;
	}

	return postVerifyResults.some((result) => result.status === "fail")
		? "failure"
		: "success";
}

async function runPreflight(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
): Promise<{ passed: true } | { passed: false; reason: string }> {
	await emit(ctx, spec, { type: "preflight", taskId, status: "started" });

	if (spec.branch) {
		const branch = await currentBranch(spec.projectRoot, ctx.abortSignal);
		if (branch.exitCode !== 0) {
			const reason = branch.stderr || "failed to determine git branch";
			await emit(ctx, spec, {
				type: "preflight",
				taskId,
				status: "failed",
				details: { command: "git rev-parse --abbrev-ref HEAD", stderr: reason },
			});
			return { passed: false, reason };
		}

		const actualBranch = branch.stdout.trim();
		if (actualBranch !== spec.branch) {
			const reason = `branch mismatch: expected ${spec.branch}, got ${actualBranch}`;
			await emit(ctx, spec, {
				type: "preflight",
				taskId,
				status: "failed",
				details: { branch: actualBranch, stderr: reason },
			});
			return { passed: false, reason };
		}
	}

	for (const command of spec.preflightCommands) {
		const result = await runShellCommand(
			command,
			spec.projectRoot,
			ctx.abortSignal,
		);
		if (result.exitCode !== 0) {
			const reason = result.stderr || `preflight failed: ${command}`;
			await emit(ctx, spec, {
				type: "preflight",
				taskId,
				status: "failed",
				details: { command, stderr: reason },
			});
			return { passed: false, reason };
		}
	}

	await emit(ctx, spec, { type: "preflight", taskId, status: "passed" });
	return { passed: true };
}

async function currentBranch(
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd, signal);
}

async function runBackend(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	promptPath: string,
): Promise<SpawnSuccess | SpawnFailure> {
	const timeoutMs = spec.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
	const controller = new AbortController();
	let timedOut = false;
	let timeout: NodeJS.Timeout | undefined;

	const abortFromParent = () => controller.abort(ctx.abortSignal.reason);
	if (ctx.abortSignal.aborted) {
		abortFromParent();
	} else {
		ctx.abortSignal.addEventListener("abort", abortFromParent, { once: true });
	}

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

	const runPromise: Promise<SpawnSuccess | SpawnFailure> = ctx.backend
		.run({
			runId: spec.runId,
			promptPath,
			workdir: spec.workdir,
			taskId,
			parentSessionId: spec.parentSessionId,
			planSlug: spec.planSlug,
			eventSink: ctx.eventSink,
			signal: controller.signal,
		})
		.then(
			(result): SpawnSuccess => ({ status: "success", result }),
			(error: unknown): SpawnFailure => ({
				status: "failure",
				error: formatError(error),
				exitCode: timedOut ? 124 : undefined,
			}),
		);

	try {
		return await Promise.race([runPromise, timeoutPromise]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
		ctx.abortSignal.removeEventListener("abort", abortFromParent);
	}
}

async function runPostVerify(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
): Promise<PostVerifyResult[]> {
	const results: PostVerifyResult[] = [];

	for (const command of spec.postflightCommands) {
		await emit(ctx, spec, {
			type: "verify",
			taskId,
			phase: "post",
			status: "started",
			details: { command },
		});

		const result = await runShellCommand(
			command,
			spec.projectRoot,
			ctx.abortSignal,
		);
		if (result.exitCode === 0) {
			results.push({ command, status: "pass" });
			await emit(ctx, spec, {
				type: "verify",
				taskId,
				phase: "post",
				status: "passed",
				details: { command },
			});
			continue;
		}

		const stderr = result.stderr || `post-verify failed: ${command}`;
		results.push({ command, status: "fail", stderr });
		await emit(ctx, spec, {
			type: "verify",
			taskId,
			phase: "post",
			status: "failed",
			details: { command, stderr },
		});
	}

	return results;
}

async function maybeCommit(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	outcome: ReportOutcome,
): Promise<string | undefined> {
	if (spec.commitPolicy !== "driver-commits" || outcome === "failure") {
		return undefined;
	}

	if (!(await hasCommittableChanges(spec.projectRoot, ctx.abortSignal))) {
		return undefined;
	}

	const subject = `${taskId}: driver task update`;
	const lock = await acquireRepoCommitLock(ctx.cosmonautsRoot);
	let committed = false;
	let commitError: unknown;
	try {
		await gitAddCommittableFiles(spec.projectRoot, ctx.abortSignal);
		if (await hasStagedChanges(spec.projectRoot, ctx.abortSignal)) {
			await gitCommit(spec.projectRoot, subject, ctx.abortSignal);
			committed = true;
		}
	} catch (error) {
		commitError = error;
	} finally {
		await lock.release();
	}

	if (commitError) {
		const reason = `commit failed: ${formatError(commitError)}`;
		await blockTask(ctx, spec, taskId, reason);
		throw new CommitFailedError(reason);
	}

	if (!committed) {
		return undefined;
	}

	const commitSha = await gitRevParseHead(spec.projectRoot, ctx.abortSignal);
	await emit(ctx, spec, {
		type: "commit_made",
		taskId,
		sha: commitSha,
		subject,
	});
	return commitSha;
}

async function hasCommittableChanges(
	cwd: string,
	signal: AbortSignal,
): Promise<boolean> {
	const result = await runCommand(
		"git",
		[
			"status",
			"--porcelain",
			"--untracked-files=all",
			"--",
			".",
			...EXCLUDED_COMMIT_PATHS,
		],
		cwd,
		signal,
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || "git status failed");
	}
	return result.stdout.trim().length > 0;
}

async function gitAddCommittableFiles(
	cwd: string,
	signal: AbortSignal,
): Promise<void> {
	const result = await runCommand(
		"git",
		["add", "--all", "--", ".", ...EXCLUDED_COMMIT_PATHS],
		cwd,
		signal,
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || "git add failed");
	}
}

async function hasStagedChanges(
	cwd: string,
	signal: AbortSignal,
): Promise<boolean> {
	const result = await runCommand(
		"git",
		["diff", "--cached", "--quiet", "--", ".", ...EXCLUDED_COMMIT_PATHS],
		cwd,
		signal,
	);
	if (result.exitCode === 0) {
		return false;
	}
	if (result.exitCode === 1) {
		return true;
	}
	throw new Error(result.stderr || "git diff --cached failed");
}

async function gitCommit(
	cwd: string,
	subject: string,
	signal: AbortSignal,
): Promise<void> {
	const result = await runCommand(
		"git",
		["commit", "-m", subject],
		cwd,
		signal,
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || "git commit failed");
	}
}

async function gitRevParseHead(
	cwd: string,
	signal: AbortSignal,
): Promise<string> {
	const result = await runCommand("git", ["rev-parse", "HEAD"], cwd, signal);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || "git rev-parse HEAD failed");
	}
	return result.stdout.trim();
}

interface TransitionOptions {
	spec: DriverRunSpec;
	ctx: RunOneTaskCtx;
	taskId: string;
	outcome: ReportOutcome;
	parsedReport: ParsedReport;
	failureReason: string;
	commitSha?: string;
}

async function transitionTaskStatus({
	spec,
	ctx,
	taskId,
	outcome,
	parsedReport,
	failureReason,
	commitSha,
}: TransitionOptions): Promise<TaskOutcome> {
	try {
		if (outcome === "success") {
			await ctx.taskManager.updateTask(taskId, { status: "Done" });
			await emit(ctx, spec, { type: "task_done", taskId });
			return { status: "done", commitSha };
		}

		if (outcome === "partial") {
			const reason = partialReason(parsedReport);
			await ctx.taskManager.updateTask(taskId, {
				status: "In Progress",
				implementationNotes: reason,
			});
			await emit(ctx, spec, {
				type: "task_blocked",
				taskId,
				reason,
				progress: reportProgress(parsedReport),
			});
			return { status: "partial", reason, commitSha };
		}

		await ctx.taskManager.updateTask(taskId, {
			status: "Blocked",
			implementationNotes: failureReason,
		});
		await emit(ctx, spec, {
			type: "task_blocked",
			taskId,
			reason: failureReason,
		});
		return { status: "blocked", reason: failureReason, commitSha };
	} catch (error) {
		if (commitSha) {
			const reason = "status update failed after commit";
			await emit(ctx, spec, { type: "run_aborted", reason });
			return {
				status: "blocked",
				reason: `${reason}: ${formatError(error)}`,
				commitSha,
			};
		}
		throw error;
	}
}

async function blockTask(
	ctx: RunOneTaskCtx,
	spec: DriverRunSpec,
	taskId: string,
	reason: string,
): Promise<TaskOutcome> {
	await ctx.taskManager.updateTask(taskId, {
		status: "Blocked",
		implementationNotes: reason,
	});
	await emit(ctx, spec, { type: "task_blocked", taskId, reason });
	return { status: "blocked", reason };
}

function deriveFailureReason(
	report: ParsedReport,
	postVerifyResults: readonly PostVerifyResult[],
): string {
	const failedVerify = postVerifyResults.find(
		(result) => result.status === "fail",
	);
	if (failedVerify) {
		return failedVerify.stderr
			? `post-verify failed: ${failedVerify.command}: ${failedVerify.stderr}`
			: `post-verify failed: ${failedVerify.command}`;
	}

	if (report.outcome !== "unknown" && report.notes) {
		return report.notes;
	}

	return report.outcome === "unknown"
		? "report outcome unknown"
		: "task failed";
}

function partialReason(report: ParsedReport): string {
	if (report.outcome === "partial") {
		const progress = progressText(report);
		const notes = report.notes ? `: ${report.notes}` : "";
		return `partial${progress}${notes}`;
	}
	return "partial";
}

function progressText(report: Report): string {
	if (!report.progress) {
		return "";
	}

	const remaining = report.progress.remaining
		? `; remaining: ${report.progress.remaining}`
		: "";
	return `: phase ${report.progress.phase}/${report.progress.of}${remaining}`;
}

function reportProgress(report: ParsedReport): Report["progress"] | undefined {
	return report.outcome === "partial" ? report.progress : undefined;
}

async function runShellCommand(
	command: string,
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return runCommand(command, [], cwd, signal, true);
}

function runCommand(
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

async function emit(
	ctx: RunOneTaskCtx,
	spec: DriverRunSpec,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class CommitFailedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CommitFailedError";
	}
}
