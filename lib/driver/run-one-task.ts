import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { Backend, BackendRunResult } from "./backends/types.ts";
import { acquireRepoCommitLock } from "./lock.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { parseReport } from "./report-parser.ts";
import type {
	ContradictedBlockAnnotation,
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

interface PostVerifyResult {
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

	let appendedNote: string | undefined;
	let retried = false;

	while (true) {
		const attempt = await runTaskAttempt(spec, ctx, taskId, appendedNote);
		if (attempt.kind === "outcome") {
			return attempt.outcome;
		}

		const contradicted =
			!retried && retryOnContradictedBlockEnabled(spec)
				? findContradictedPath(attempt.reason, spec.projectRoot)
				: undefined;
		if (!contradicted) {
			return attempt.finalize(undefined);
		}

		retried = true;
		await attempt.finalize(contradicted.annotation, { skipTaskUpdate: true });
		appendedNote = buildContradictionNote(contradicted);
	}
}

interface TaskAttemptOutcome {
	kind: "outcome";
	outcome: TaskOutcome;
}

interface TaskAttemptBlockCandidate {
	kind: "block-candidate";
	reason: string;
	/**
	 * Commits the block: updates the task (unless `skipTaskUpdate`) and emits the
	 * terminal event, optionally annotated with the contradiction. Returns the
	 * resulting `TaskOutcome`.
	 */
	finalize(
		contradicted: ContradictedBlockAnnotation | undefined,
		options?: { skipTaskUpdate?: boolean },
	): Promise<TaskOutcome>;
}

type TaskAttemptResult = TaskAttemptOutcome | TaskAttemptBlockCandidate;

async function runTaskAttempt(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	appendedNote: string | undefined,
): Promise<TaskAttemptResult> {
	const promptLayers: PromptLayersWithWorkdir = {
		...spec.promptTemplate,
		workdir: spec.workdir,
	};
	const promptPath = await renderPromptForTask(
		taskId,
		promptLayers,
		ctx.taskManager,
		{ appendedNote },
	);

	await emit(ctx, spec, {
		type: "spawn_started",
		taskId,
		backend: ctx.backend.name,
	});

	const spawnResult = await runBackend(spec, ctx, taskId, promptPath);
	if (spawnResult.status === "failure") {
		return spawnFailureCandidate(
			ctx,
			spec,
			taskId,
			spawnResult.error,
			spawnResult.exitCode,
		);
	}

	if (spawnResult.result.exitCode !== 0) {
		const reason = `spawn failed with exit code ${spawnResult.result.exitCode}`;
		return spawnFailureCandidate(
			ctx,
			spec,
			taskId,
			reason,
			spawnResult.result.exitCode,
		);
	}

	const parsedReport = parseReport(spawnResult.result.stdout);
	await emit(ctx, spec, {
		type: "spawn_completed",
		taskId,
		report: parsedReport,
	});

	const postVerifyResults = await runPostVerify(spec, ctx, taskId);
	const allowUnknownSuccess = await canInferUnknownSuccess(
		spec,
		ctx,
		parsedReport,
		postVerifyResults,
	);
	const outcome = deriveOutcome(parsedReport, postVerifyResults, {
		allowUnknownSuccess,
	});
	const effectiveReport =
		parsedReport.outcome === "unknown" && outcome === "success"
			? inferredSuccessReport(parsedReport, postVerifyResults)
			: parsedReport;
	const failureReason = deriveFailureReason(effectiveReport, postVerifyResults);
	let commitSha: string | undefined;
	try {
		commitSha = await maybeCommit(spec, ctx, taskId, outcome, effectiveReport);
	} catch (error) {
		if (error instanceof CommitFailedError) {
			return {
				kind: "outcome",
				outcome: { status: "blocked", reason: error.message },
			};
		}
		throw error;
	}

	if (outcome === "success") {
		return {
			kind: "outcome",
			outcome: await transitionTaskStatus({
				spec,
				ctx,
				taskId,
				outcome,
				parsedReport: effectiveReport,
				failureReason,
				commitSha,
			}),
		};
	}

	const reason =
		outcome === "partial" ? partialReason(effectiveReport) : failureReason;
	return {
		kind: "block-candidate",
		reason,
		finalize: (contradicted, options) =>
			transitionTaskStatus({
				spec,
				ctx,
				taskId,
				outcome,
				parsedReport: effectiveReport,
				failureReason,
				commitSha,
				contradicted,
				skipTaskUpdate: options?.skipTaskUpdate,
			}),
	};
}

function spawnFailureCandidate(
	ctx: RunOneTaskCtx,
	spec: DriverRunSpec,
	taskId: string,
	error: string,
	exitCode: number | undefined,
): TaskAttemptBlockCandidate {
	return {
		kind: "block-candidate",
		reason: error,
		finalize: async (contradicted, options) => {
			await emit(ctx, spec, {
				type: "spawn_failed",
				taskId,
				error,
				exitCode,
				...(contradicted ? { contradicted } : {}),
			});
			if (options?.skipTaskUpdate) {
				return { status: "blocked", reason: error };
			}
			return blockTask(ctx, spec, taskId, error);
		},
	};
}

function retryOnContradictedBlockEnabled(spec: DriverRunSpec): boolean {
	return spec.retryOnContradictedBlock ?? true;
}

interface ContradictedPath {
	token: string;
	absolutePath: string;
	isDirectory: boolean;
	lineCount?: number;
	annotation: ContradictedBlockAnnotation;
}

function findContradictedPath(
	reason: string,
	projectRoot: string,
): ContradictedPath | undefined {
	for (const token of extractPathTokens(reason)) {
		if (isAbsolute(token)) {
			continue;
		}
		const absolutePath = resolve(projectRoot, token);
		if (!isWithin(projectRoot, absolutePath) || !existsSync(absolutePath)) {
			continue;
		}
		const stats = statSync(absolutePath);
		const isDirectory = stats.isDirectory();
		return {
			token,
			absolutePath,
			isDirectory,
			lineCount: isDirectory ? undefined : countLines(absolutePath),
			annotation: { path: token, existsOnDisk: true },
		};
	}
	return undefined;
}

const FILE_EXTENSION_PATTERN =
	/\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|toml|txt|sh|css|scss|html|py|go|rs|java|rb|sql|lock|env|config)$/i;

function extractPathTokens(reason: string): string[] {
	const tokens: string[] = [];
	const seen = new Set<string>();
	for (const raw of reason.split(/\s+/)) {
		const token = stripWrappers(raw);
		if (!token || seen.has(token)) {
			continue;
		}
		if (token.includes("/") || FILE_EXTENSION_PATTERN.test(token)) {
			seen.add(token);
			tokens.push(token);
		}
	}
	return tokens;
}

function stripWrappers(raw: string): string {
	let token = raw.trim();
	// Drop trailing sentence punctuation.
	token = token.replace(/[.,;:!?]+$/, "");
	// Strip matched surrounding quotes/backticks/brackets.
	const pairs: Array<[string, string]> = [
		["`", "`"],
		['"', '"'],
		["'", "'"],
		["(", ")"],
		["[", "]"],
		["{", "}"],
		["<", ">"],
	];
	let changed = true;
	while (changed) {
		changed = false;
		for (const [open, close] of pairs) {
			if (
				token.length >= 2 &&
				token.startsWith(open) &&
				token.endsWith(close)
			) {
				token = token.slice(1, -1);
				changed = true;
			}
		}
		const trimmed = token
			.replace(/^[`"'([{<]+/, "")
			.replace(/[`"')\]}>]+$/, "");
		if (trimmed !== token) {
			token = trimmed;
			changed = true;
		}
	}
	return token;
}

function isWithin(root: string, candidate: string): boolean {
	const normalizedRoot = resolve(root);
	return (
		candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}/`)
	);
}

function countLines(absolutePath: string): number | undefined {
	try {
		const text = readFileSync(absolutePath, "utf-8");
		if (text.length === 0) {
			return 0;
		}
		return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
	} catch {
		return undefined;
	}
}

function buildContradictionNote(contradicted: ContradictedPath): string {
	const kind = contradicted.isDirectory
		? "a directory"
		: contradicted.lineCount === undefined
			? "a file"
			: `a file of ${contradicted.lineCount} line${contradicted.lineCount === 1 ? "" : "s"}`;
	return [
		"---",
		`Note from the driver: \`${contradicted.token}\` exists at \`${contradicted.absolutePath}\` (${kind}). Read it directly from the filesystem (\`cat\`, \`ls\`, \`test -f\`); do not infer its absence from \`git ls-files\` (which only lists tracked files and is scoped to the current directory).`,
	].join("\n");
}

export function deriveOutcome(
	report: ParsedReport,
	postVerifyResults: readonly PostVerifyResult[],
	options: { allowUnknownSuccess?: boolean } = {},
): ReportOutcome {
	if (postVerifyResults.some((result) => result.status === "fail")) {
		return "failure";
	}

	if (report.outcome === "unknown") {
		return options.allowUnknownSuccess && postVerifyPassed(postVerifyResults)
			? "success"
			: "failure";
	}

	return report.outcome;
}

async function canInferUnknownSuccess(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	report: ParsedReport,
	postVerifyResults: readonly PostVerifyResult[],
): Promise<boolean> {
	if (report.outcome !== "unknown" || !postVerifyPassed(postVerifyResults)) {
		return false;
	}

	if (spec.commitPolicy !== "driver-commits") {
		return true;
	}

	try {
		return await hasCommittableChanges(spec.projectRoot, ctx.abortSignal);
	} catch {
		return false;
	}
}

function postVerifyPassed(
	postVerifyResults: readonly PostVerifyResult[],
): boolean {
	return (
		postVerifyResults.length > 0 &&
		postVerifyResults.every((result) => result.status === "pass")
	);
}

function inferredSuccessReport(
	report: Extract<ParsedReport, { outcome: "unknown" }>,
	postVerifyResults: readonly PostVerifyResult[],
): Report {
	const summary = reportSummary(report) ?? "unstructured worker report";
	return {
		outcome: "success",
		files: [],
		verification: postVerifyResults.map((result) => ({
			command: result.command,
			status: result.status,
		})),
		notes: `${summary}\n\nOutcome inferred from passing postflight because the worker emitted an unstructured report.`,
	};
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
			projectRoot: spec.projectRoot,
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
	report: ParsedReport,
): Promise<string | undefined> {
	if (spec.commitPolicy !== "driver-commits" || outcome === "failure") {
		return undefined;
	}

	if (!(await hasCommittableChanges(spec.projectRoot, ctx.abortSignal))) {
		return undefined;
	}

	const subject = commitSubject(taskId, report);
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

function commitSubject(taskId: string, report: ParsedReport): string {
	const summary = reportSummary(report);
	return summary ? `${taskId}: ${summary}` : `${taskId}: driver task update`;
}

function reportSummary(report: ParsedReport): string | undefined {
	const text = report.outcome === "unknown" ? report.raw : report.notes;
	if (!text) {
		return undefined;
	}

	const line = text
		.split(/\r?\n/)
		.map((item) => item.trim())
		.find((item) => item.length > 0);
	if (!line) {
		return undefined;
	}

	const withoutPrefix = line.replace(/^(implemented|status|summary):\s*/i, "");
	return withoutPrefix.slice(0, 80).trim() || undefined;
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
	contradicted?: ContradictedBlockAnnotation;
	/** When set, emit the terminal event but skip the TaskManager status write (a retry follows). */
	skipTaskUpdate?: boolean;
}

async function transitionTaskStatus({
	spec,
	ctx,
	taskId,
	outcome,
	parsedReport,
	failureReason,
	commitSha,
	contradicted,
	skipTaskUpdate,
}: TransitionOptions): Promise<TaskOutcome> {
	try {
		if (outcome === "success") {
			await ctx.taskManager.updateTask(taskId, { status: "Done" });
			await emit(ctx, spec, { type: "task_done", taskId });
			return { status: "done", commitSha };
		}

		if (outcome === "partial") {
			const reason = partialReason(parsedReport);
			if (!skipTaskUpdate) {
				await ctx.taskManager.updateTask(taskId, {
					status: "In Progress",
					implementationNotes: reason,
				});
			}
			await emit(ctx, spec, {
				type: "task_blocked",
				taskId,
				reason,
				progress: reportProgress(parsedReport),
				...(contradicted ? { contradicted } : {}),
			});
			return { status: "partial", reason, commitSha };
		}

		if (!skipTaskUpdate) {
			await ctx.taskManager.updateTask(taskId, {
				status: "Blocked",
				implementationNotes: failureReason,
			});
		}
		await emit(ctx, spec, {
			type: "task_blocked",
			taskId,
			reason: failureReason,
			...(contradicted ? { contradicted } : {}),
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
