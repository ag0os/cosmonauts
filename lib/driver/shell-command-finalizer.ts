import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	BackendCapabilities,
	BackendContext,
	BackendHandle,
	BackendSpec,
	PreparedStep,
	RunGraphSchedulerBackend,
	SchedulerStepInput,
	StepRecord,
	StepResult,
} from "../durable-runtime/index.ts";
import type { TaskManager } from "../tasks/task-manager.ts";
import {
	commitArtifact,
	commitDriveFinalState,
	finalizeDriveSourceCommit,
	isDoneTaskStatusStep,
	PENDING_FINALIZATION_ARTIFACT,
	parsedReportFromStepResult,
	partialTaskStatusArtifact,
	reportOutcomeFromStepResult,
	skipDriveStateCommit,
	stepResultWithCommit,
	transitionDriveTaskStatus,
	uniqueArtifacts,
} from "./drive-finalization.ts";
import { writePendingFinalization } from "./run-state.ts";
import type { DriverRunSpec, EventSink } from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";

export const DRIVE_SHELL_COMMAND_CAPABILITIES: BackendCapabilities = {
	canResume: false,
	canCancel: false,
	canCommit: true,
	isolatedFromHostSource: false,
	emitsMachineReport: true,
};

const SHELL_COMMAND_BACKEND_SPEC: BackendSpec = { name: "shell-command" };

export interface DriveShellCommandBackendContext {
	spec: DriverRunSpec;
	taskManager: TaskManager;
	eventSink: EventSink;
}

interface DriveShellPreparedStep extends PreparedStep<SchedulerStepInput> {
	run: BackendContext<SchedulerStepInput>["run"];
	abortSignal: AbortSignal;
}

type DriveFinalizerPhase = "commit" | "task_status" | "state_commit";

export function createDriveShellCommandBackend(
	context: DriveShellCommandBackendContext,
): RunGraphSchedulerBackend {
	return {
		name: "shell-command",
		capabilities: { ...DRIVE_SHELL_COMMAND_CAPABILITIES },
		async prepare(step, backendContext) {
			validateShellFinalizerStep(step, backendContext);
			return {
				step,
				attemptId: backendContext.attemptId,
				backend: SHELL_COMMAND_BACKEND_SPEC,
				input: backendContext.input,
				preparedAt: backendContext.now?.() ?? new Date().toISOString(),
				run: backendContext.run,
				abortSignal: backendContext.signal ?? new AbortController().signal,
			} satisfies DriveShellPreparedStep;
		},
		async start(prepared) {
			const drivePrepared = toDriveShellPreparedStep(prepared);
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: new Date().toISOString(),
				result: runShellFinalizerStep(context, drivePrepared),
			} satisfies BackendHandle<StepResult>;
		},
	};
}

async function runShellFinalizerStep(
	context: DriveShellCommandBackendContext,
	prepared: DriveShellPreparedStep,
): Promise<StepResult> {
	const phase = drivePhase(prepared.step);
	if (phase === "commit") {
		return runSourceCommitFinalizer(context, prepared);
	}
	if (phase === "task_status") {
		return runTaskStatusFinalizer(context, prepared);
	}
	return runStateCommitFinalizer(context, prepared);
}

async function runSourceCommitFinalizer(
	context: DriveShellCommandBackendContext,
	prepared: DriveShellPreparedStep,
): Promise<StepResult> {
	const taskId = taskIdFromFinalizer(prepared.step, "finalizer-source-commit-");
	const taskStep = await readStepRecord(prepared.run.stepsDir, taskId);
	const taskResult = requireStepResult(taskStep, taskId);
	const report = parsedReportFromStepResult(taskResult);
	const outcome = reportOutcomeFromStepResult(taskResult);
	const commit = await finalizeDriveSourceCommit({
		spec: context.spec,
		ctx: {
			taskManager: context.taskManager,
			eventSink: context.eventSink,
			abortSignal: prepared.abortSignal,
		},
		taskId,
		outcome,
		report,
	});

	if (commit.status === "committed") {
		return stepResultWithCommit(
			{
				outcome: "success",
				summary: `Drive source commit finalization passed: ${commit.sha}`,
				artifacts: [commitArtifact(commit.sha, commit.subject)],
				nextAction: "continue",
			},
			commit.sha,
			commit.subject,
		);
	}
	if (commit.status === "skipped" || commit.status === "not_applicable") {
		return {
			outcome: "success",
			summary:
				commit.status === "skipped"
					? "Drive source commit finalization skipped: no_changes."
					: "Drive source commit finalization not applicable.",
			artifacts: [],
			nextAction: "continue",
		};
	}
	if (commit.status === "finalization_failed") {
		return retryableFailureResult(commit.reason);
	}
	return {
		outcome: "blocked",
		summary: commit.reason,
		artifacts: [],
		nextAction: "wait_for_human",
	};
}

async function runTaskStatusFinalizer(
	context: DriveShellCommandBackendContext,
	prepared: DriveShellPreparedStep,
): Promise<StepResult> {
	const taskId = taskIdFromFinalizer(prepared.step, "finalizer-task-status-");
	const taskStep = await readStepRecord(prepared.run.stepsDir, taskId);
	const taskResult = requireStepResult(taskStep, taskId);
	const parsedReport = parsedReportFromStepResult(taskResult);
	const outcome = reportOutcomeFromStepResult(taskResult);
	const commit = await commitFromDependency(prepared);
	const taskOutcome = await transitionDriveTaskStatus({
		spec: context.spec,
		ctx: {
			taskManager: context.taskManager,
			eventSink: context.eventSink,
			abortSignal: prepared.abortSignal,
		},
		taskId,
		outcome,
		parsedReport,
		failureReason: taskResult.summary,
		commitSha: commit?.sha,
		commitSubject: commit?.subject,
	});

	if (taskOutcome.status === "finalization_failed") {
		return stepResultWithOptionalCommit(
			retryableFailureResult(taskOutcome.finalizationReason),
			commit,
		);
	}
	const result: StepResult =
		taskOutcome.status === "partial" && context.spec.partialMode === "continue"
			? {
					outcome: "success",
					summary: taskOutcome.reason ?? taskResult.summary,
					artifacts: [partialTaskStatusArtifact(taskId)],
					nextAction: "continue",
				}
			: {
					outcome:
						taskOutcome.status === "done" ? "success" : taskOutcome.status,
					summary:
						taskOutcome.status === "done"
							? "Drive task status finalization passed."
							: (taskOutcome.reason ?? taskResult.summary),
					artifacts: commit ? [commitArtifact(commit.sha, commit.subject)] : [],
					nextAction:
						taskOutcome.status === "done" ? "continue" : "wait_for_human",
				};
	return stepResultWithOptionalCommit(result, commit);
}

async function runStateCommitFinalizer(
	context: DriveShellCommandBackendContext,
	prepared: DriveShellPreparedStep,
): Promise<StepResult> {
	const taskIds = authoritativeDriveTaskIds(
		prepared.run.metadata,
		context.spec,
	);
	if (!(await allTaskStatusFinalizersDone(prepared.run.stepsDir, taskIds))) {
		await skipDriveStateCommit(
			context.spec,
			{
				eventSink: context.eventSink,
				abortSignal: prepared.abortSignal,
			},
			"not_all_tasks_done",
		);
		return {
			outcome: "success",
			summary: "Drive state commit finalization skipped: not_all_tasks_done.",
			artifacts: [],
			nextAction: "continue",
		};
	}
	const result = await commitDriveFinalState(
		context.spec,
		{
			eventSink: context.eventSink,
			abortSignal: prepared.abortSignal,
		},
		taskIds,
	);
	if (result.status === "committed") {
		return stepResultWithCommit(
			{
				outcome: "success",
				summary: `Drive state commit finalization passed: ${result.sha}`,
				artifacts: [commitArtifact(result.sha)],
				nextAction: "continue",
			},
			result.sha,
		);
	}
	if (result.status === "skipped") {
		return {
			outcome: "success",
			summary: `Drive state commit finalization skipped: ${result.reason}.`,
			artifacts: [],
			nextAction: "continue",
		};
	}

	await writePendingFinalization(context.spec.workdir, {
		runId: context.spec.runId,
		planSlug: context.spec.planSlug,
		createdAt: new Date().toISOString(),
		commitPolicy: context.spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(context.spec),
		reason: result.reason,
		phase: "state_commit",
		taskIds: [
			...authoritativeDriveTaskIds(prepared.run.metadata, context.spec),
		],
		headBeforeFinalization: result.headBeforeFinalization,
	});
	return retryableFailureResult(result.reason);
}

function validateShellFinalizerStep(
	step: StepRecord,
	context: BackendContext<SchedulerStepInput>,
): void {
	if (step.kind !== "finalizer") {
		throw new Error(
			`shell-command backend cannot prepare ${step.kind} step ${step.id}.`,
		);
	}
	if (context.input.stepId !== step.id) {
		throw new Error(
			`Scheduler step input ${context.input.stepId} does not match step ${step.id}.`,
		);
	}
	drivePhase(step);
}

function drivePhase(step: StepRecord): DriveFinalizerPhase {
	const phase = step.backend.options?.drivePhase;
	if (
		phase === "commit" ||
		phase === "task_status" ||
		phase === "state_commit"
	) {
		return phase;
	}
	throw new Error(`shell-command finalizer ${step.id} is missing drivePhase.`);
}

function toDriveShellPreparedStep(
	prepared: PreparedStep<SchedulerStepInput>,
): DriveShellPreparedStep {
	if (!("run" in prepared)) {
		throw new Error("Drive shell prepared step is missing run context.");
	}
	return prepared as DriveShellPreparedStep;
}

function taskIdFromFinalizer(step: StepRecord, prefix: string): string {
	if (!step.id.startsWith(prefix)) {
		throw new Error(`Unexpected Drive finalizer step id: ${step.id}`);
	}
	const taskId = step.id.slice(prefix.length);
	if (!taskId) {
		throw new Error(`Drive finalizer step ${step.id} is missing task id.`);
	}
	return taskId;
}

async function readStepRecord(
	stepsDir: string,
	stepId: string,
): Promise<StepRecord> {
	const raw = await readFile(join(stepsDir, stepId, "step.json"), "utf-8");
	return JSON.parse(raw) as StepRecord;
}

async function allTaskStatusFinalizersDone(
	stepsDir: string,
	taskIds: readonly string[],
): Promise<boolean> {
	for (const taskId of taskIds) {
		const step = await readStepRecord(
			stepsDir,
			`finalizer-task-status-${taskId}`,
		);
		if (!isDoneTaskStatusStep(step)) {
			return false;
		}
	}
	return true;
}

function requireStepResult(step: StepRecord, stepId: string): StepResult {
	if (!step.result) {
		throw new Error(`Drive step ${stepId} has no persisted result evidence.`);
	}
	return step.result;
}

async function commitFromDependency(
	prepared: DriveShellPreparedStep,
): Promise<{ sha: string; subject?: string } | undefined> {
	for (const dependency of prepared.step.dependsOn) {
		if (!dependency.startsWith("finalizer-source-commit-")) {
			continue;
		}
		const step = await readStepRecord(prepared.run.stepsDir, dependency);
		const commit = step.result?.commits?.at(-1);
		if (commit) {
			return commit;
		}
	}
	return undefined;
}

function retryableFailureResult(reason: string): StepResult {
	return {
		outcome: "failed",
		summary: reason,
		artifacts: [PENDING_FINALIZATION_ARTIFACT],
		nextAction: "retry",
	};
}

function stepResultWithOptionalCommit(
	result: StepResult,
	commit: { sha: string; subject?: string } | undefined,
): StepResult {
	if (!commit) {
		return result;
	}
	return stepResultWithCommit(
		{
			...result,
			artifacts: uniqueArtifacts([
				...result.artifacts,
				commitArtifact(commit.sha, commit.subject),
			]),
		},
		commit.sha,
		commit.subject,
	);
}

function authoritativeDriveTaskIds(
	metadata: Record<string, unknown> | undefined,
	spec: DriverRunSpec,
): readonly string[] {
	const value = metadata?.driveTaskIds;
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return value;
	}
	return spec.taskIds;
}
