import type {
	ArtifactRef,
	BackendContext,
	BackendHandle,
	BackendSpec,
	KnownBackendName,
	PreparedStep,
	RunGraphSchedulerBackend,
	SchedulerStepInput,
	StepRecord,
	StepResult,
	VerificationResult,
} from "../durable-runtime/index.ts";
import type { TaskManager } from "../tasks/task-manager.ts";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "./backends/orchestration-adapter.ts";
import type { Backend, BackendInvocation } from "./backends/types.ts";
import { DRIVE_PARTIAL_CONTINUE_ARTIFACT_KIND } from "./drive-finalization.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { formatPartialReport } from "./report-format.ts";
import { parseReport } from "./report-parser.ts";
import {
	buildContradictionNote,
	canInferUnknownSuccess,
	DEFAULT_TASK_TIMEOUT_MS,
	deriveFailureReason,
	deriveOutcome,
	findContradictedPath,
	type PostVerifyResult,
	type RunOneTaskCtx,
} from "./run-one-task.ts";
import {
	authoritativeDriveTaskIds,
	checkDrivePreflight,
	driveRunExpectations,
	uncheckedAcceptanceCriteriaReason as findUncheckedAcceptanceCriteriaReason,
	type RetriableTaskAttempt,
	runContradictedAttempts,
	runShellCommand,
	runBackendWithTimeout as runWithTimeout,
} from "./runtime-helpers.ts";
import { createDriveShellCommandBackend } from "./shell-command-finalizer.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	ParsedReport,
	PromptLayers,
	Report,
} from "./types.ts";

interface DriveSchedulerBackendContext {
	spec: DriverRunSpec;
	taskManager: TaskManager;
	backend: Backend;
	eventSink: EventSink;
}

interface DrivePreparedStep extends PreparedStep<SchedulerStepInput> {
	invocation: BackendInvocation;
	taskId: string;
	abortSignal: AbortSignal;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

type DriveTaskAttemptResult = RetriableTaskAttempt<StepResult>;
type DriveTaskBlockCandidate = Extract<
	DriveTaskAttemptResult,
	{ kind: "block-candidate" }
>;

const DRIVE_TASK_OUTPUT_ARTIFACT_KIND = "drive-task-output";

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir: string;
}

export function createDriveSchedulerBackend(
	context: DriveSchedulerBackendContext,
): RunGraphSchedulerBackend {
	const name = context.spec.backendName;
	const backendSpec: BackendSpec = { name };

	return {
		name,
		capabilities: {
			...DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name],
		},
		async prepare(step, backendContext) {
			validateDriveTaskStep(step, context.spec, backendContext);
			const taskId = step.id;
			const promptLayers: PromptLayersWithWorkdir = {
				...context.spec.promptTemplate,
				workdir: context.spec.workdir,
			};
			const promptPath = await renderPromptForTask(
				taskId,
				promptLayers,
				context.taskManager,
				{
					runExpectations: driveRunExpectations(context.spec),
				},
			);

			return {
				step,
				attemptId: backendContext.attemptId,
				backend: backendSpec,
				input: backendContext.input,
				preparedAt: backendContext.now?.() ?? new Date().toISOString(),
				taskId,
				abortSignal: backendContext.signal ?? new AbortController().signal,
				invocation: {
					runId: backendContext.input.runId,
					promptPath,
					workdir: context.spec.workdir,
					projectRoot: context.spec.projectRoot,
					taskId,
					parentSessionId: context.spec.parentSessionId,
					planSlug: context.spec.planSlug,
					eventSink: context.eventSink,
					signal: backendContext.signal,
				},
			} satisfies DrivePreparedStep;
		},
		async start(prepared) {
			const drivePrepared = toDrivePreparedStep(prepared);
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: new Date().toISOString(),
				result: runDriveTaskStep(context, drivePrepared),
			} satisfies BackendHandle<StepResult>;
		},
	};
}

export function createDriveSchedulerBackendMap(
	context: DriveSchedulerBackendContext,
): ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend> {
	return new Map<KnownBackendName, RunGraphSchedulerBackend>([
		[context.spec.backendName, createDriveSchedulerBackend(context)],
		["shell-command", createDriveShellCommandBackend(context)],
	]);
}

async function runDriveTaskStep(
	context: DriveSchedulerBackendContext,
	prepared: DrivePreparedStep,
): Promise<StepResult> {
	const { spec, taskManager } = context;
	const taskId = prepared.taskId;
	await emit(context, { type: "task_started", taskId });

	const cancelledReason = await cancelledDependencyReason(taskManager, taskId);
	if (cancelledReason) {
		await emit(context, {
			type: "task_blocked",
			taskId,
			reason: cancelledReason,
		});
		return blockedStepResult(cancelledReason);
	}

	const preflight = await runPreflight(context, taskId, prepared.abortSignal);
	if (!preflight.passed) {
		return blockedStepResult(preflight.reason);
	}

	await taskManager.updateTask(taskId, { status: "In Progress" });
	await emit(context, {
		type: "spawn_started",
		taskId,
		backend: context.backend.name,
	});

	return runContradictedAttempts({
		spec,
		attempt: (appendedNote) =>
			runDriveTaskAttempt(context, prepared, appendedNote),
		find: findContradictedPath,
		buildNote: buildContradictionNote,
		onRetry: () =>
			emit(context, {
				type: "spawn_started",
				taskId,
				backend: context.backend.name,
			}),
	});
}

async function runDriveTaskAttempt(
	context: DriveSchedulerBackendContext,
	prepared: DrivePreparedStep,
	appendedNote: string | undefined,
): Promise<DriveTaskAttemptResult> {
	const { spec, taskManager } = context;
	const taskId = prepared.taskId;
	const invocation = await invocationForAttempt(
		context,
		prepared,
		appendedNote,
	);
	const spawnResult = await runBackendWithTimeout(
		context.backend,
		invocation,
		spec.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
		prepared.abortSignal,
	);
	if (spawnResult.status === "failure") {
		return spawnFailureCandidate(
			context,
			taskId,
			spawnResult.error,
			spawnResult.exitCode,
		);
	}
	if (spawnResult.result.exitCode !== 0) {
		const reason = `spawn failed with exit code ${spawnResult.result.exitCode}`;
		return spawnFailureCandidate(
			context,
			taskId,
			reason,
			spawnResult.result.exitCode,
		);
	}

	const parsedReport = parseReport(spawnResult.result.stdout);
	await emit(context, {
		type: "spawn_completed",
		taskId,
		report: parsedReport,
	});

	const postVerifyResults = await runPostVerify(
		context,
		taskId,
		prepared.abortSignal,
	);
	const allowUnknownSuccess = await canInferUnknownSuccess(
		spec,
		toRunOneTaskCtx(context, prepared.abortSignal),
		parsedReport,
		postVerifyResults,
	);
	const reportOutcome = deriveOutcome(parsedReport, postVerifyResults, {
		allowUnknownSuccess,
	});
	const uncheckedAcceptanceCriteriaReason =
		reportOutcome === "success"
			? await findUncheckedAcceptanceCriteriaReason(taskManager, taskId)
			: undefined;
	const effectiveOutcome = uncheckedAcceptanceCriteriaReason
		? "failure"
		: reportOutcome;
	const effectiveReport =
		parsedReport.outcome === "unknown" && reportOutcome === "success"
			? inferredSuccessReport(parsedReport, postVerifyResults)
			: parsedReport;
	const failureReason =
		uncheckedAcceptanceCriteriaReason ??
		deriveFailureReason(effectiveReport, postVerifyResults);

	if (effectiveOutcome === "success") {
		return {
			kind: "outcome",
			outcome: successStepResult(taskId, prepared.attemptId, effectiveReport),
		};
	}

	if (effectiveOutcome === "partial") {
		const reason = formatPartialReport(effectiveReport);
		return {
			kind: "block-candidate",
			reason,
			finalize: async (contradicted, options) => {
				if (!options?.skipTaskUpdate) {
					await taskManager.updateTask(taskId, {
						status: "In Progress",
						implementationNotes: reason,
					});
				}
				await emit(context, {
					type: "task_blocked",
					taskId,
					reason,
					progress: reportProgress(effectiveReport),
					...(contradicted ? { contradicted } : {}),
				});
				return spec.partialMode === "continue"
					? partialContinueStepResult(taskId, prepared.attemptId, reason)
					: partialBlockedStepResult(taskId, prepared.attemptId, reason);
			},
		};
	}

	return {
		kind: "block-candidate",
		reason: failureReason,
		finalize: async (contradicted, options) => {
			if (!options?.skipTaskUpdate) {
				await taskManager.updateTask(taskId, {
					status: "Blocked",
					implementationNotes: failureReason,
				});
			}
			await emit(context, {
				type: "task_blocked",
				taskId,
				reason: failureReason,
				...(contradicted ? { contradicted } : {}),
			});
			return blockedStepResult(
				failureReason,
				outputArtifacts(taskId, prepared.attemptId),
			);
		},
	};
}

async function invocationForAttempt(
	context: DriveSchedulerBackendContext,
	prepared: DrivePreparedStep,
	appendedNote: string | undefined,
): Promise<BackendInvocation> {
	if (!appendedNote) {
		return prepared.invocation;
	}
	const promptLayers: PromptLayersWithWorkdir = {
		...context.spec.promptTemplate,
		workdir: context.spec.workdir,
	};
	const promptPath = await renderPromptForTask(
		prepared.taskId,
		promptLayers,
		context.taskManager,
		{
			appendedNote,
			runExpectations: driveRunExpectations(context.spec),
		},
	);
	return { ...prepared.invocation, promptPath };
}

function spawnFailureCandidate(
	context: DriveSchedulerBackendContext,
	taskId: string,
	error: string,
	exitCode: number | undefined,
): DriveTaskBlockCandidate {
	return {
		kind: "block-candidate",
		reason: error,
		finalize: async (contradicted, options) => {
			await emit(context, {
				type: "spawn_failed",
				taskId,
				error,
				exitCode,
				...(contradicted ? { contradicted } : {}),
			});
			if (!options?.skipTaskUpdate) {
				await blockTask(context, taskId, error);
			}
			return blockedStepResult(error);
		},
	};
}

function validateDriveTaskStep(
	step: StepRecord,
	spec: DriverRunSpec,
	context: BackendContext<SchedulerStepInput>,
): void {
	if (step.kind !== "drive") {
		throw new Error(
			`Drive scheduler backend cannot prepare ${step.kind} step ${step.id}.`,
		);
	}
	if (context.input.stepId !== step.id) {
		throw new Error(
			`Scheduler step input ${context.input.stepId} does not match step ${step.id}.`,
		);
	}
	if (step.backend.name !== spec.backendName) {
		throw new Error(
			`Drive step ${step.id} uses backend ${step.backend.name}; expected ${spec.backendName}.`,
		);
	}
	const selectedTaskIds = authoritativeDriveTaskIds(context.run.metadata, spec);
	if (!selectedTaskIds.includes(step.id)) {
		throw new Error(
			`Drive task step ${step.id} is not in selected Drive task set.`,
		);
	}
}

function toDrivePreparedStep(
	prepared: PreparedStep<SchedulerStepInput>,
): DrivePreparedStep {
	if (!("invocation" in prepared)) {
		throw new Error(
			"Drive scheduler prepared step is missing BackendInvocation.",
		);
	}
	return prepared as DrivePreparedStep;
}

async function runPreflight(
	context: DriveSchedulerBackendContext,
	taskId: string,
	signal: AbortSignal,
): Promise<{ passed: true } | { passed: false; reason: string }> {
	await emit(context, { type: "preflight", taskId, status: "started" });
	const result = await checkDrivePreflight(context.spec, signal);
	if (!result.passed) {
		await emit(context, {
			type: "preflight",
			taskId,
			status: "failed",
			details: result.details,
		});
		return result;
	}
	await emit(context, { type: "preflight", taskId, status: "passed" });
	return result;
}

async function runPostVerify(
	context: DriveSchedulerBackendContext,
	taskId: string,
	signal: AbortSignal,
): Promise<PostVerifyResult[]> {
	const results: PostVerifyResult[] = [];
	for (const command of context.spec.postflightCommands) {
		await emit(context, {
			type: "verify",
			taskId,
			phase: "post",
			status: "started",
			details: { command },
		});
		const result = await runShellCommand(
			command,
			context.spec.projectRoot,
			signal,
		);
		if (result.exitCode === 0) {
			results.push({ command, status: "pass" });
			await emit(context, {
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
		await emit(context, {
			type: "verify",
			taskId,
			phase: "post",
			status: "failed",
			details: { command, stderr },
		});
	}
	return results;
}

function runBackendWithTimeout(
	backend: Backend,
	invocation: BackendInvocation,
	timeoutMs: number,
	parentSignal: AbortSignal,
) {
	return runWithTimeout(
		(signal) => backend.run({ ...invocation, signal }),
		timeoutMs,
		parentSignal,
	);
}

/**
 * Read at step start, not run start: a task Cancelled after the run began
 * must not run, and a Cancelled dependency — active or archived — will never
 * be done, so its dependent must not run.
 */
async function cancelledDependencyReason(
	taskManager: TaskManager,
	taskId: string,
): Promise<string | undefined> {
	const task = await taskManager.getTask(taskId);
	if (task?.status === "Cancelled") {
		return `${taskId} is Cancelled; it will not run`;
	}
	if (!task || task.dependencies.length === 0) {
		return undefined;
	}
	const statuses = await taskManager.getTaskStatuses(task.dependencies);
	const cancelled = task.dependencies.filter(
		(id) => statuses.get(id.toUpperCase()) === "Cancelled",
	);
	if (cancelled.length === 0) {
		return undefined;
	}
	return `dependency ${cancelled.map((id) => `${id} is Cancelled`).join(", ")}; ${taskId} will not run`;
}

async function blockTask(
	context: DriveSchedulerBackendContext,
	taskId: string,
	reason: string,
): Promise<void> {
	await context.taskManager.updateTask(taskId, {
		status: "Blocked",
		implementationNotes: reason,
	});
	await emit(context, { type: "task_blocked", taskId, reason });
}

function successStepResult(
	taskId: string,
	attemptId: string,
	report: ParsedReport,
): StepResult {
	if (report.outcome === "unknown") {
		return {
			outcome: "success",
			summary: "Outcome inferred from passing postflight.",
			artifacts: outputArtifacts(taskId, attemptId),
			nextAction: "continue",
		};
	}
	return {
		outcome: "success",
		summary: report.notes?.trim() || "Drive task completed.",
		artifacts: outputArtifacts(taskId, attemptId),
		files: report.files.map(fileChangeSummary),
		verification: report.verification.map(verificationResult),
		nextAction: "continue",
	};
}

function partialContinueStepResult(
	taskId: string,
	attemptId: string,
	reason: string,
): StepResult {
	return {
		outcome: "success",
		summary: reason,
		artifacts: [
			...outputArtifacts(taskId, attemptId),
			{
				id: `drive-partial-continue:${taskId}:${attemptId}`,
				path: `steps/${taskId}/attempts/${attemptId}.json`,
				kind: DRIVE_PARTIAL_CONTINUE_ARTIFACT_KIND,
				metadata: { taskId },
			},
		],
		nextAction: "continue",
	};
}

function partialBlockedStepResult(
	taskId: string,
	attemptId: string,
	reason: string,
): StepResult {
	return {
		outcome: "partial",
		summary: reason,
		artifacts: outputArtifacts(taskId, attemptId),
		nextAction: "wait_for_human",
	};
}

function blockedStepResult(
	reason: string,
	artifacts: ArtifactRef[] = [],
): StepResult {
	return {
		outcome: "blocked",
		summary: reason,
		artifacts,
		nextAction: "wait_for_human",
	};
}

function outputArtifacts(taskId: string, attemptId: string): ArtifactRef[] {
	return [
		{
			id: `drive-output:${taskId}:${attemptId}`,
			path: `steps/${taskId}/attempts/${attemptId}.json`,
			kind: DRIVE_TASK_OUTPUT_ARTIFACT_KIND,
		},
	];
}

function inferredSuccessReport(
	report: Extract<ParsedReport, { outcome: "unknown" }>,
	postVerifyResults: readonly PostVerifyResult[],
): Report {
	const summary =
		report.raw
			.split(/\r?\n/)
			.map((item) => item.trim())
			.find((item) => item.length > 0) ?? "unstructured worker report";
	return {
		outcome: "success",
		files: [],
		verification: postVerifyResults.map((result) => ({
			command: result.command,
			status: result.status,
		})),
		notes: `${summary.slice(0, 80)}\n\nOutcome inferred from passing postflight because the worker emitted an unstructured report.`,
	};
}

function reportProgress(report: ParsedReport): Report["progress"] | undefined {
	return report.outcome === "partial" ? report.progress : undefined;
}

function fileChangeSummary(file: Report["files"][number]) {
	return {
		path: file.path,
		status: file.change === "created" ? ("added" as const) : file.change,
	};
}

function verificationResult(
	result: Report["verification"][number],
): VerificationResult {
	return {
		command: result.command,
		status: result.status === "not_run" ? "skipped" : result.status,
	};
}

function toRunOneTaskCtx(
	context: DriveSchedulerBackendContext,
	abortSignal: AbortSignal,
): RunOneTaskCtx {
	return {
		taskManager: context.taskManager,
		backend: context.backend,
		eventSink: context.eventSink,
		parentSessionId: context.spec.parentSessionId,
		runId: context.spec.runId,
		abortSignal,
		cosmonautsRoot: context.spec.projectRoot,
	};
}

async function emit(
	context: DriveSchedulerBackendContext,
	event: DriverEventInput,
): Promise<void> {
	await context.eventSink({
		...event,
		runId: context.spec.runId,
		parentSessionId: context.spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}
