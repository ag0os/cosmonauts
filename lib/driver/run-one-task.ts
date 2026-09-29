import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { probeJournalBlockReason } from "../agents/drive-worker-tool-guard.ts";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { Backend } from "./backends/types.ts";
import {
	finalizeDriveSourceCommit,
	transitionDriveTaskStatus,
} from "./drive-finalization.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { formatPartialReport } from "./report-format.ts";
import { parseReport } from "./report-parser.ts";
import {
	appendDriveAttemptRecord,
	blockedReportEvidence,
	blockedReportReason,
	checkDrivePreflight,
	driveRunExpectations,
	uncheckedAcceptanceCriteriaReason as findUncheckedAcceptanceCriteriaReason,
	headBeforeSpawn,
	type RetriableTaskAttempt,
	recordWorktreeSnapshot,
	reportSummary,
	runBackendWithTimeout,
	runCommand,
	runContradictedAttempts,
	runShellCommand,
	type SpawnFailure,
	type SpawnSuccess,
	snapshotWorktree,
} from "./runtime-helpers.ts";
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

export interface PostVerifyResult {
	command: string;
	status: "pass" | "fail";
	stderr?: string;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir: string;
}

export const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const EXCLUDED_COMMIT_PATHS = [
	":(exclude)missions",
	":(exclude)missions/**",
	":(exclude)memory",
	":(exclude)memory/**",
	":(exclude).cosmonauts/*.lock",
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

	return runContradictedAttempts({
		spec,
		attempt: (appendedNote, attemptNumber) =>
			runTaskAttempt(spec, ctx, taskId, appendedNote, attemptNumber),
		find: findContradictedPath,
		buildNote: buildContradictionNote,
		onRetry: (contradicted, attemptNumber) =>
			emit(ctx, spec, {
				type: "task_retry",
				taskId,
				trigger: "contradicted-path",
				attemptNumber,
				contradicted,
			}),
	});
}

type TaskAttemptResult = RetriableTaskAttempt<TaskOutcome>;
type TaskAttemptBlockCandidate = Extract<
	TaskAttemptResult,
	{ kind: "block-candidate" }
>;

async function runTaskAttempt(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	appendedNote: string | undefined,
	attemptNumber: number,
): Promise<TaskAttemptResult> {
	const promptLayers: PromptLayersWithWorkdir = {
		...spec.promptTemplate,
		workdir: spec.workdir,
	};
	const promptPath = await renderPromptForTask(
		taskId,
		promptLayers,
		ctx.taskManager,
		{
			appendedNote,
			runExpectations: driveRunExpectations(spec),
		},
	);

	const headBefore = await headBeforeSpawn(spec.projectRoot, ctx.abortSignal);
	const worktreeSnapshot = await snapshotWorktree({
		projectRoot: spec.projectRoot,
		runId: spec.runId,
		taskId,
		attemptNumber,
		taskManager: ctx.taskManager,
	});
	await emit(ctx, spec, {
		type: "spawn_started",
		taskId,
		backend: ctx.backend.name,
		...(worktreeSnapshot ? { worktreeSnapshot } : {}),
	});

	const spawnResult = await runTaskBackend(spec, ctx, taskId, promptPath);
	await recordWorktreeSnapshot(
		ctx.taskManager,
		taskId,
		attemptNumber,
		worktreeSnapshot,
	);
	if (spawnResult.status === "failure") {
		return spawnFailureCandidate(
			ctx,
			spec,
			taskId,
			spawnResult.error,
			spawnResult.exitCode,
			attemptNumber,
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
			attemptNumber,
		);
	}

	const parsedReport = parseReport(spawnResult.result.stdout);
	await emit(ctx, spec, {
		type: "spawn_completed",
		taskId,
		report: parsedReport,
	});

	if (parsedReport.outcome === "blocked") {
		const reason = blockedReportReason(parsedReport);
		const evidence = await blockedReportEvidence({
			projectRoot: spec.projectRoot,
			signal: ctx.abortSignal,
			commitPolicy: spec.commitPolicy,
			headBefore,
		});
		await appendDriveAttemptRecord({
			taskManager: ctx.taskManager,
			taskId,
			runId: spec.runId,
			outcome: "blocked",
			attemptNumber,
			body: evidence.note ? `${reason}\n\n${evidence.note}` : reason,
		});
		await ctx.taskManager.updateTask(taskId, { status: "Blocked" });
		await emit(ctx, spec, {
			type: "task_blocked",
			taskId,
			reason,
			...(evidence.unverifiedCommits
				? { unverifiedCommits: evidence.unverifiedCommits }
				: {}),
		});
		return { kind: "outcome", outcome: { status: "blocked", reason } };
	}

	if (parsedReport.outcome === "unknown") {
		await appendDriveAttemptRecord({
			taskManager: ctx.taskManager,
			taskId,
			runId: spec.runId,
			outcome: "unknown",
			attemptNumber,
			body: parsedReport.raw,
		});
	}
	const beforePostflight = await blockForProbeJournal(
		spec,
		ctx,
		taskId,
		attemptNumber,
	);
	if (beforePostflight) return beforePostflight;
	const postVerifyResults = await runPostVerify(spec, ctx, taskId);
	const beforeCommit = await blockForProbeJournal(
		spec,
		ctx,
		taskId,
		attemptNumber,
	);
	if (beforeCommit) return beforeCommit;
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
	const uncheckedAcceptanceCriteriaReason =
		outcome === "success"
			? await findUncheckedAcceptanceCriteriaReason(ctx.taskManager, taskId)
			: undefined;
	const effectiveOutcome = uncheckedAcceptanceCriteriaReason
		? "failure"
		: outcome;
	const failureReason =
		uncheckedAcceptanceCriteriaReason ??
		deriveFailureReason(effectiveReport, postVerifyResults);
	const reason =
		effectiveOutcome === "partial"
			? formatPartialReport(effectiveReport)
			: failureReason;
	if (effectiveOutcome !== "success" && parsedReport.outcome !== "unknown") {
		await appendDriveAttemptRecord({
			taskManager: ctx.taskManager,
			taskId,
			runId: spec.runId,
			outcome: effectiveOutcome,
			attemptNumber,
			body: reason,
		});
	}
	let commitSha: string | undefined;
	try {
		commitSha = await maybeCommit(
			spec,
			ctx,
			taskId,
			effectiveOutcome,
			effectiveReport,
		);
	} catch (error) {
		if (error instanceof CommitFailedError) {
			return {
				kind: "outcome",
				outcome: error.outcome,
			};
		}
		throw error;
	}

	if (effectiveOutcome === "success") {
		return {
			kind: "outcome",
			outcome: await transitionTaskStatus({
				spec,
				ctx,
				taskId,
				outcome: effectiveOutcome,
				parsedReport: effectiveReport,
				failureReason,
				commitSha,
			}),
		};
	}

	return {
		kind: "block-candidate",
		reason,
		finalize: async (contradicted, options) => {
			return transitionTaskStatus({
				spec,
				ctx,
				taskId,
				outcome: effectiveOutcome,
				parsedReport: effectiveReport,
				failureReason,
				commitSha,
				contradicted,
				skipStatusTransition: options?.skipStatusTransition,
			});
		},
	};
}

async function blockForProbeJournal(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	attemptNumber: number,
): Promise<TaskAttemptResult | undefined> {
	const reason = probeJournalBlockReason(spec.projectRoot);
	if (!reason) return undefined;
	await appendDriveAttemptRecord({
		taskManager: ctx.taskManager,
		taskId,
		runId: spec.runId,
		outcome: "blocked",
		attemptNumber,
		body: reason,
	});
	await ctx.taskManager.updateTask(taskId, { status: "Blocked" });
	await emit(ctx, spec, { type: "task_blocked", taskId, reason });
	return { kind: "outcome", outcome: { status: "blocked", reason } };
}

function spawnFailureCandidate(
	ctx: RunOneTaskCtx,
	spec: DriverRunSpec,
	taskId: string,
	error: string,
	exitCode: number | undefined,
	attemptNumber: number,
): TaskAttemptBlockCandidate {
	return {
		kind: "block-candidate",
		reason: error,
		finalize: async (contradicted, options) => {
			await appendDriveAttemptRecord({
				taskManager: ctx.taskManager,
				taskId,
				runId: spec.runId,
				outcome: "failure",
				attemptNumber,
				body: error,
			});
			await emit(ctx, spec, {
				type: "spawn_failed",
				taskId,
				error,
				exitCode,
				...(contradicted ? { contradicted } : {}),
			});
			if (options?.skipStatusTransition) {
				return { status: "blocked", reason: error };
			}
			return blockTask(ctx, spec, taskId, error);
		},
	};
}

interface ContradictedPath {
	token: string;
	absolutePath: string;
	isDirectory: boolean;
	lineCount?: number;
	annotation: ContradictedBlockAnnotation;
}

export function findContradictedPath(
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

export function buildContradictionNote(contradicted: ContradictedPath): string {
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

	if (report.outcome === "blocked") {
		return "failure";
	}
	if (report.outcome === "unknown") {
		return options.allowUnknownSuccess && postVerifyPassed(postVerifyResults)
			? "success"
			: "failure";
	}

	return report.outcome;
}

export async function canInferUnknownSuccess(
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
	const probeReason = probeJournalBlockReason(spec.projectRoot);
	const result = probeReason
		? {
				passed: false as const,
				reason: probeReason,
				details: { stderr: probeReason },
			}
		: await checkDrivePreflight(spec, ctx.abortSignal);
	if (!result.passed) {
		await emit(ctx, spec, {
			type: "preflight",
			taskId,
			status: "failed",
			details: result.details,
		});
		if (probeReason) {
			await appendDriveAttemptRecord({
				taskManager: ctx.taskManager,
				taskId,
				runId: spec.runId,
				outcome: "blocked",
				attemptNumber: 1,
				body: probeReason,
			});
			await ctx.taskManager.updateTask(taskId, { status: "Blocked" });
			await emit(ctx, spec, {
				type: "task_blocked",
				taskId,
				reason: probeReason,
			});
		}
		return result;
	}
	await emit(ctx, spec, { type: "preflight", taskId, status: "passed" });
	return result;
}

function runTaskBackend(
	spec: DriverRunSpec,
	ctx: RunOneTaskCtx,
	taskId: string,
	promptPath: string,
): Promise<SpawnSuccess | SpawnFailure> {
	return runBackendWithTimeout(
		(signal) =>
			ctx.backend.run({
				runId: spec.runId,
				promptPath,
				workdir: spec.workdir,
				projectRoot: spec.projectRoot,
				taskId,
				parentSessionId: spec.parentSessionId,
				planSlug: spec.planSlug,
				eventSink: ctx.eventSink,
				signal,
			}),
		spec.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
		ctx.abortSignal,
	);
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
	const result = await finalizeDriveSourceCommit({
		spec,
		ctx,
		taskId,
		outcome,
		report,
	});
	if (result.status === "committed") {
		return result.sha;
	}
	if (result.status === "finalization_failed") {
		throw new CommitFailedError(result.outcome);
	}
	if (result.status === "blocked") {
		throw new CommitFailedError({
			status: "blocked",
			reason: result.reason,
		});
	}
	return undefined;
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

interface TransitionOptions {
	spec: DriverRunSpec;
	ctx: RunOneTaskCtx;
	taskId: string;
	outcome: ReportOutcome;
	parsedReport: ParsedReport;
	failureReason: string;
	commitSha?: string;
	contradicted?: ContradictedBlockAnnotation;
	/** A retry follows; retain the current In Progress status. */
	skipStatusTransition?: boolean;
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
	skipStatusTransition,
}: TransitionOptions): Promise<TaskOutcome> {
	return transitionDriveTaskStatus({
		spec,
		ctx,
		taskId,
		outcome,
		parsedReport,
		failureReason,
		commitSha,
		contradicted,
		skipStatusTransition,
	});
}

async function blockTask(
	ctx: RunOneTaskCtx,
	spec: DriverRunSpec,
	taskId: string,
	reason: string,
): Promise<TaskOutcome> {
	await ctx.taskManager.updateTask(taskId, {
		status: "Blocked",
	});
	await emit(ctx, spec, { type: "task_blocked", taskId, reason });
	return { status: "blocked", reason };
}

export function deriveFailureReason(
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

class CommitFailedError extends Error {
	constructor(readonly outcome: TaskOutcome) {
		super(
			outcome.status === "finalization_failed"
				? outcome.finalizationReason
				: (outcome.reason ?? "commit failed"),
		);
		this.name = "CommitFailedError";
	}
}
