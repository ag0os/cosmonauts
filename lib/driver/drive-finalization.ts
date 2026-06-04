import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
	ArtifactRef,
	RunRef,
	RunStore,
	StepRecord,
	StepResult,
} from "../durable-runtime/index.ts";
import type { TaskManager } from "../tasks/task-manager.ts";
import { acquireRepoCommitLock } from "./lock.ts";
import {
	type PendingFinalizationState,
	pendingFinalizationPath,
	readPendingFinalization,
	writePendingFinalization,
} from "./run-state.ts";
import type {
	ContradictedBlockAnnotation,
	DriverEvent,
	DriverRunSpec,
	EventSink,
	ParsedReport,
	Report,
	ReportOutcome,
	TaskOutcome,
} from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";

const execFileAsync = promisify(execFile);

export const PENDING_FINALIZATION_ARTIFACT: ArtifactRef = {
	id: "pending-finalization",
	path: "pending-finalization.json",
	kind: "pending-finalization",
};

export interface DriveFinalizationCtx {
	taskManager: TaskManager;
	eventSink: EventSink;
	abortSignal: AbortSignal;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

export type DriveSourceCommitResult =
	| { status: "not_applicable" }
	| { status: "skipped"; reason: "no_changes"; subject: string }
	| { status: "committed"; sha: string; subject: string }
	| { status: "blocked"; reason: string }
	| { status: "finalization_failed"; outcome: TaskOutcome; reason: string };

export interface DriveSourceCommitOptions {
	spec: DriverRunSpec;
	ctx: DriveFinalizationCtx;
	taskId: string;
	outcome: ReportOutcome;
	report: ParsedReport;
}

export async function finalizeDriveSourceCommit({
	spec,
	ctx,
	taskId,
	outcome,
	report,
}: DriveSourceCommitOptions): Promise<DriveSourceCommitResult> {
	if (spec.commitPolicy !== "driver-commits" || outcome === "failure") {
		return { status: "not_applicable" };
	}

	const subject = await commitSubject(taskId, report, ctx.taskManager);
	const headBeforeFinalization = await gitRevParseHead(
		spec.projectRoot,
		ctx.abortSignal,
	);
	await emit(spec, ctx, {
		type: "finalize",
		taskId,
		phase: "commit",
		status: "started",
		details: { subject },
	});
	const lock = await acquireRepoCommitLock(spec.projectRoot);
	let committed = false;
	let commitError: unknown;
	try {
		if (await hasCommittableChanges(spec.projectRoot, ctx.abortSignal)) {
			await gitAddCommittableFiles(spec.projectRoot, ctx.abortSignal);
			if (await hasStagedChanges(spec.projectRoot, ctx.abortSignal)) {
				await gitCommit(spec.projectRoot, subject, ctx.abortSignal);
				committed = true;
			}
		}
	} catch (error) {
		commitError = error;
	} finally {
		await lock.release();
	}

	if (commitError) {
		const reason = `commit failed: ${formatError(commitError)}`;
		if (outcome === "success") {
			return {
				status: "finalization_failed",
				reason,
				outcome: await recordCommitFinalizationFailure({
					spec,
					ctx,
					taskId,
					reason,
					subject,
					headBeforeFinalization,
				}),
			};
		}
		await blockTask(ctx, spec, taskId, reason);
		return { status: "blocked", reason };
	}

	if (!committed) {
		await emit(spec, ctx, {
			type: "finalize",
			taskId,
			phase: "commit",
			status: "skipped",
			details: { reason: "no_changes" },
		});
		return { status: "skipped", reason: "no_changes", subject };
	}

	const commitSha = await gitRevParseHead(spec.projectRoot, ctx.abortSignal);
	await emit(spec, ctx, {
		type: "commit_made",
		taskId,
		sha: commitSha,
		subject,
	});
	await emit(spec, ctx, {
		type: "finalize",
		taskId,
		phase: "commit",
		status: "passed",
		details: { sha: commitSha, subject },
	});
	return { status: "committed", sha: commitSha, subject };
}

export interface TransitionDriveTaskStatusOptions {
	spec: DriverRunSpec;
	ctx: DriveFinalizationCtx;
	taskId: string;
	outcome: ReportOutcome;
	parsedReport: ParsedReport;
	failureReason: string;
	commitSha?: string;
	commitSubject?: string;
	contradicted?: ContradictedBlockAnnotation;
	skipTaskUpdate?: boolean;
}

export async function transitionDriveTaskStatus({
	spec,
	ctx,
	taskId,
	outcome,
	parsedReport,
	failureReason,
	commitSha,
	commitSubject,
	contradicted,
	skipTaskUpdate,
}: TransitionDriveTaskStatusOptions): Promise<TaskOutcome> {
	try {
		if (outcome === "success") {
			if (spec.commitPolicy === "driver-commits") {
				await emit(spec, ctx, {
					type: "finalize",
					taskId,
					phase: "task_status",
					status: "started",
					...(commitSha ? { details: { sha: commitSha } } : {}),
				});
			}
			await ctx.taskManager.updateTask(taskId, { status: "Done" });
			if (spec.commitPolicy === "driver-commits") {
				await emit(spec, ctx, {
					type: "finalize",
					taskId,
					phase: "task_status",
					status: "passed",
					...(commitSha ? { details: { sha: commitSha } } : {}),
				});
			}
			await emit(spec, ctx, { type: "task_done", taskId });
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
			await emit(spec, ctx, {
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
		await emit(spec, ctx, {
			type: "task_blocked",
			taskId,
			reason: failureReason,
			...(contradicted ? { contradicted } : {}),
		});
		return { status: "blocked", reason: failureReason, commitSha };
	} catch (error) {
		if (commitSha) {
			return recordTaskStatusFinalizationFailure({
				spec,
				ctx,
				taskId,
				commitSha,
				commitSubject,
				reason: `status update failed after commit: ${formatError(error)}`,
			});
		}
		throw error;
	}
}

export async function recordCommitFinalizationFailure({
	spec,
	ctx,
	taskId,
	reason,
	subject,
	headBeforeFinalization,
}: {
	spec: DriverRunSpec;
	ctx: DriveFinalizationCtx;
	taskId: string;
	reason: string;
	subject: string;
	headBeforeFinalization: string;
}): Promise<TaskOutcome> {
	await writePendingFinalization(spec.workdir, {
		runId: spec.runId,
		planSlug: spec.planSlug,
		createdAt: new Date().toISOString(),
		commitPolicy: spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(spec),
		reason,
		phase: "commit",
		taskId,
		headBeforeFinalization,
		commitSubject: subject,
		verifiedAt: new Date().toISOString(),
	});
	await ctx.taskManager.updateTask(taskId, {
		status: "In Progress",
		implementationNotes: `backend and postflight succeeded, but commit finalization failed: ${reason}`,
	});
	await emit(spec, ctx, {
		type: "finalize",
		taskId,
		phase: "commit",
		status: "failed",
		details: { error: reason },
	});
	await emit(spec, ctx, {
		type: "task_finalization_failed",
		taskId,
		phase: "commit",
		reason,
		retryable: true,
	});
	return {
		status: "finalization_failed",
		finalizationPhase: "commit",
		finalizationReason: reason,
		finalizationTaskId: taskId,
		pendingFinalizationPath: pendingFinalizationPath(spec.workdir),
	};
}

export async function recordTaskStatusFinalizationFailure({
	spec,
	ctx,
	taskId,
	commitSha,
	commitSubject,
	reason,
}: {
	spec: DriverRunSpec;
	ctx: DriveFinalizationCtx;
	taskId: string;
	commitSha: string;
	commitSubject?: string;
	reason: string;
}): Promise<TaskOutcome> {
	await writePendingFinalization(spec.workdir, {
		runId: spec.runId,
		planSlug: spec.planSlug,
		createdAt: new Date().toISOString(),
		commitPolicy: spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(spec),
		reason,
		phase: "task_status",
		taskId,
		commitSha,
		...(commitSubject ? { commitSubject } : {}),
	});
	await emit(spec, ctx, {
		type: "finalize",
		taskId,
		phase: "task_status",
		status: "failed",
		details: { sha: commitSha, error: reason },
	});
	await emit(spec, ctx, {
		type: "task_finalization_failed",
		taskId,
		phase: "task_status",
		reason,
		commitSha,
		retryable: true,
	});
	return {
		status: "finalization_failed",
		finalizationPhase: "task_status",
		finalizationReason: reason,
		finalizationTaskId: taskId,
		finalizationCommitSha: commitSha,
		pendingFinalizationPath: pendingFinalizationPath(spec.workdir),
	};
}

export type StateCommitResult =
	| { status: "committed"; sha: string }
	| {
			status: "skipped";
			reason: "policy_none" | "not_all_tasks_done" | "no_changes";
	  }
	| { status: "failed"; reason: string; headBeforeFinalization: string };

export interface StateCommitCtx {
	eventSink: (event: DriverEvent) => Promise<void>;
	abortSignal: AbortSignal;
}

export async function skipDriveStateCommit(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	reason: "policy_none" | "not_all_tasks_done",
): Promise<StateCommitResult> {
	await emitStateCommitEvent(spec, ctx, {
		type: "finalize",
		phase: "state_commit",
		status: "skipped",
		details: { reason },
	});
	return { status: "skipped", reason };
}

export async function commitDriveFinalState(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	taskIds: readonly string[],
): Promise<StateCommitResult> {
	if (resolveStateCommitPolicy(spec) === "none") {
		return skipDriveStateCommit(spec, ctx, "policy_none");
	}

	const taskPaths = await findTaskMarkdownPaths(spec.projectRoot, taskIds);
	const headBeforeFinalization = await gitStdout(
		spec.projectRoot,
		["rev-parse", "HEAD"],
		ctx.abortSignal,
	);
	await emitStateCommitEvent(spec, ctx, {
		type: "finalize",
		phase: "state_commit",
		status: "started",
	});

	if (taskPaths.length === 0) {
		await emitStateCommitEvent(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "skipped",
			details: { reason: "no_changes" },
		});
		return { status: "skipped", reason: "no_changes" };
	}

	const lock = await acquireRepoCommitLock(spec.projectRoot);
	try {
		if (!(await hasPathChanges(spec.projectRoot, taskPaths, ctx.abortSignal))) {
			await emitStateCommitEvent(spec, ctx, {
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "no_changes" },
			});
			return { status: "skipped", reason: "no_changes" };
		}

		await gitExec(
			spec.projectRoot,
			["add", "--all", "--", ...taskPaths],
			ctx.abortSignal,
		);
		if (
			!(await hasStagedPathChanges(
				spec.projectRoot,
				taskPaths,
				ctx.abortSignal,
			))
		) {
			await emitStateCommitEvent(spec, ctx, {
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "no_changes" },
			});
			return { status: "skipped", reason: "no_changes" };
		}

		const subject = `Drive state: mark ${spec.planSlug} tasks done`;
		await gitExec(
			spec.projectRoot,
			["commit", "-m", subject, "--", ...taskPaths],
			ctx.abortSignal,
		);
		const sha = await gitStdout(
			spec.projectRoot,
			["rev-parse", "HEAD"],
			ctx.abortSignal,
		);
		await emitStateCommitEvent(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "passed",
			details: { sha, subject },
		});
		return { status: "committed", sha };
	} catch (error) {
		const reason = `state commit failed: ${formatError(error)}`;
		await emitStateCommitEvent(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "failed",
			details: { error: reason },
		});
		return { status: "failed", reason, headBeforeFinalization };
	} finally {
		await lock.release();
	}
}

export interface RetryableDriveFinalizerFailureMapping {
	outcome: "finalization_failed";
	finalizationPhase: "commit" | "task_status" | "state_commit";
	finalizationReason: string;
	finalizationTaskId?: string;
	finalizationCommitSha?: string;
	pendingFinalizationPath: string;
	stepId: string;
	attemptId: string;
	stepResult: StepResult;
	attemptResult: StepResult;
}

export async function readRetryableDriveFinalizerFailure(options: {
	store: Pick<
		RunStore,
		"listStepRecords" | "readStepAttemptRecord" | "readStepRecord"
	>;
	ref: RunRef;
	workdir: string;
}): Promise<RetryableDriveFinalizerFailureMapping | undefined> {
	const pending = await readPendingFinalization(options.workdir);
	if (!pending) {
		return undefined;
	}

	const finalizer = await findRetryableFinalizerStep(options, pending);
	if (!finalizer?.latestAttemptId || !finalizer.result) {
		return undefined;
	}
	const latestAttempt = await options.store.readStepAttemptRecord({
		...options.ref,
		stepId: finalizer.id,
		attemptId: finalizer.latestAttemptId,
	});
	if (!isRetryableFailedResult(latestAttempt?.result)) {
		return undefined;
	}

	return {
		outcome: "finalization_failed",
		finalizationPhase: pending.phase,
		finalizationReason: pending.reason,
		...("taskId" in pending ? { finalizationTaskId: pending.taskId } : {}),
		...("commitSha" in pending
			? { finalizationCommitSha: pending.commitSha }
			: {}),
		pendingFinalizationPath: pendingFinalizationPath(options.workdir),
		stepId: finalizer.id,
		attemptId: latestAttempt.attemptId,
		stepResult: finalizer.result,
		attemptResult: latestAttempt.result,
	};
}

async function findRetryableFinalizerStep(
	options: {
		store: Pick<RunStore, "listStepRecords" | "readStepRecord">;
		ref: RunRef;
	},
	pending: PendingFinalizationState,
): Promise<StepRecord | undefined> {
	const expectedStepId = finalizerStepIdForPending(pending);
	const expected = await options.store.readStepRecord({
		...options.ref,
		stepId: expectedStepId,
	});
	if (isRetryableFinalizerStep(expected, pending)) {
		return expected;
	}

	const steps = await options.store.listStepRecords(options.ref);
	return steps.find((step) => isRetryableFinalizerStep(step, pending));
}

function isRetryableFinalizerStep(
	step: StepRecord | undefined,
	pending: PendingFinalizationState,
): step is StepRecord & { result: StepResult } {
	return (
		step?.kind === "finalizer" &&
		step.backend.name === "shell-command" &&
		step.backend.options?.drivePhase === pending.phase &&
		isRetryableFailedResult(step.result)
	);
}

function isRetryableFailedResult(
	result: StepResult | undefined,
): result is StepResult {
	return result?.outcome === "failed" && result.nextAction === "retry";
}

function finalizerStepIdForPending(pending: PendingFinalizationState): string {
	if (pending.phase === "commit") {
		return `finalizer-source-commit-${pending.taskId}`;
	}
	if (pending.phase === "task_status") {
		return `finalizer-task-status-${pending.taskId}`;
	}
	return "finalizer-state-commit";
}

export function commitArtifact(sha: string, subject?: string): ArtifactRef {
	return {
		id: `commit:${sha}`,
		path: sha,
		kind: "commit",
		metadata: { sha, ...(subject ? { subject } : {}) },
	};
}

export function stepResultWithCommit(
	result: StepResult,
	sha: string,
	subject?: string,
): StepResult {
	return {
		...result,
		commits: [
			...(result.commits ?? []),
			{ sha, ...(subject ? { subject } : {}) },
		],
	};
}

export function uniqueArtifacts(
	artifacts: readonly ArtifactRef[],
): ArtifactRef[] {
	const seen = new Set<string>();
	const unique: ArtifactRef[] = [];
	for (const artifact of artifacts) {
		const key = `${artifact.id}\0${artifact.path}\0${artifact.kind ?? ""}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		unique.push(artifact);
	}
	return unique;
}

export function parsedReportFromStepResult(result: StepResult): ParsedReport {
	const outcome = reportOutcomeFromStepResult(result);
	return {
		outcome,
		files: (result.files ?? []).map((file) => ({
			path: file.path,
			change:
				file.status === "added"
					? "created"
					: file.status === "renamed"
						? "modified"
						: file.status,
		})),
		verification: (result.verification ?? []).map((item) => ({
			command: item.command,
			status: item.status === "skipped" ? "not_run" : item.status,
		})),
		notes: result.summary,
	};
}

export function reportOutcomeFromStepResult(result: StepResult): ReportOutcome {
	if (result.outcome === "partial") {
		return "partial";
	}
	if (result.outcome === "success") {
		return "success";
	}
	return "failure";
}

export function partialReason(report: ParsedReport): string {
	if (report.outcome === "partial") {
		const progress = progressText(report);
		const notes = report.notes ? `: ${report.notes}` : "";
		return `partial${progress}${notes}`;
	}
	return "partial";
}

async function blockTask(
	ctx: DriveFinalizationCtx,
	spec: DriverRunSpec,
	taskId: string,
	reason: string,
): Promise<TaskOutcome> {
	await ctx.taskManager.updateTask(taskId, {
		status: "Blocked",
		implementationNotes: reason,
	});
	await emit(spec, ctx, { type: "task_blocked", taskId, reason });
	return { status: "blocked", reason };
}

async function emit(
	spec: DriverRunSpec,
	ctx: DriveFinalizationCtx,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

async function emitStateCommitEvent(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

async function commitSubject(
	taskId: string,
	report: ParsedReport,
	taskManager: TaskManager,
): Promise<string> {
	const summary = reportSummary(report);
	if (summary && !isGenericCommitSummary(summary, taskId)) {
		return `${taskId}: ${summary}`;
	}

	const task = await taskManager.getTask(taskId);
	return `${taskId}: ${task?.title?.trim() || "driver task update"}`;
}

function isGenericCommitSummary(summary: string, taskId: string): boolean {
	const normalized = summary.trim().toLowerCase();
	return (
		normalized === "driver task update" ||
		normalized === "drive task completed." ||
		normalized === `${taskId.toLowerCase()}: driver task update`
	);
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
			":(exclude)missions",
			":(exclude)missions/**",
			":(exclude)memory",
			":(exclude)memory/**",
			":(exclude).cosmonauts/*.lock",
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
		[
			"add",
			"--all",
			"--",
			".",
			":(exclude)missions",
			":(exclude)missions/**",
			":(exclude)memory",
			":(exclude)memory/**",
			":(exclude).cosmonauts/*.lock",
		],
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
		[
			"diff",
			"--cached",
			"--quiet",
			"--",
			".",
			":(exclude)missions",
			":(exclude)missions/**",
			":(exclude)memory",
			":(exclude)memory/**",
			":(exclude).cosmonauts/*.lock",
		],
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

async function findTaskMarkdownPaths(
	projectRoot: string,
	taskIds: readonly string[],
): Promise<string[]> {
	const taskDir = join(projectRoot, "missions", "tasks");
	const entries = await readdir(taskDir, { withFileTypes: true }).catch(
		(error: unknown) => {
			if (isErrnoError(error) && error.code === "ENOENT") {
				return [];
			}
			throw error;
		},
	);
	const ids = new Set(taskIds);
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => name.endsWith(".md"))
		.filter((name) => ids.has(name.split(" ")[0] ?? name.replace(/\.md$/, "")))
		.map((name) => `missions/tasks/${name}`)
		.sort();
}

async function hasPathChanges(
	cwd: string,
	paths: readonly string[],
	signal: AbortSignal,
): Promise<boolean> {
	const stdout = await gitStdout(
		cwd,
		["status", "--porcelain", "--untracked-files=all", "--", ...paths],
		signal,
	);
	return stdout.trim().length > 0;
}

async function hasStagedPathChanges(
	cwd: string,
	paths: readonly string[],
	signal: AbortSignal,
): Promise<boolean> {
	try {
		await gitExec(cwd, ["diff", "--cached", "--quiet", "--", ...paths], signal);
		return false;
	} catch (error) {
		if (isExecError(error) && error.code === 1) {
			return true;
		}
		throw error;
	}
}

async function gitStdout(
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
): Promise<string> {
	const { stdout } = await gitExec(cwd, args, signal);
	return stdout.toString().trim();
}

async function gitExec(
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
) {
	return execFileAsync("git", [...args], {
		cwd,
		encoding: "utf-8",
		signal,
	});
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function runCommand(
	command: string,
	args: string[],
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = execFile(
			command,
			args,
			{ cwd, signal },
			(error, stdout, stderr) => {
				if (error) {
					if ((error as NodeJS.ErrnoException).name === "AbortError") {
						resolve({
							exitCode: 124,
							stdout: stdout.toString(),
							stderr: stderr.toString() || formatError(error),
						});
						return;
					}
					if (typeof (error as { code?: unknown }).code === "number") {
						resolve({
							exitCode: (error as { code: number }).code,
							stdout: stdout.toString(),
							stderr: stderr.toString(),
						});
						return;
					}
					reject(error);
					return;
				}
				resolve({
					exitCode: 0,
					stdout: stdout.toString(),
					stderr: stderr.toString(),
				});
			},
		);
		child.stdin?.end();
	});
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

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function isExecError(error: unknown): error is Error & { code: number } {
	return error instanceof Error && "code" in error;
}
