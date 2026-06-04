import type {
	ArtifactRef,
	BackendSpec,
	FileChangeSummary,
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	StepAttemptRecord,
	StepRecord,
	StepResult,
	VerificationResult,
} from "../durable-runtime/index.ts";
import type {
	BackendName,
	DriverEvent,
	ParsedReport,
	Report,
	ReportOutcome,
} from "./types.ts";

export interface DriveStepProjectorOptions {
	store: RunStore & {
		appendDiagnostic?(
			ref: RunRef,
			diagnostic: RuntimeDiagnostic,
		): Promise<void>;
	};
	ref: RunRef;
	projectRoot: string;
	workdir: string;
	configuredBackendName: BackendName;
	taskIds: readonly string[];
}

export interface DriveStepProjector {
	project(event: DriverEvent): Promise<void>;
	latestTaskResult(taskId: string): StepResult | undefined;
}

export type DurableFinalizerRetryFailure = {
	phase: "commit" | "task_status" | "state_commit";
	taskId?: string;
	reason: string;
	commitSha?: string;
	timestamp: string;
};

interface ActiveAttempt {
	attemptId: string;
	startedAt: string;
}

const REPORT_ARTIFACT_ID = "report";
const PENDING_FINALIZATION_ARTIFACT: ArtifactRef = {
	id: "pending-finalization",
	path: "pending-finalization.json",
	kind: "pending-finalization",
};

export function createDriveStepProjector(
	options: DriveStepProjectorOptions,
): DriveStepProjector {
	const activeAttempts = new Map<string, ActiveAttempt>();
	const activeFinalizerAttempts = new Map<string, ActiveAttempt>();
	const latestResults = new Map<string, StepResult>();
	const metadataWarnings = new Set<string>();

	return {
		async project(event) {
			if (event.runId !== options.ref.runId) {
				return;
			}

			switch (event.type) {
				case "task_started":
					await upsertTaskStep(options, event.taskId, {
						status: "ready",
					});
					return;
				case "spawn_started":
					await recordSpawnStarted(
						options,
						activeAttempts,
						metadataWarnings,
						event,
					);
					return;
				case "spawn_completed":
					await recordSpawnCompleted(
						options,
						activeAttempts,
						latestResults,
						event,
					);
					return;
				case "spawn_failed":
					await recordSpawnFailed(
						options,
						activeAttempts,
						latestResults,
						event,
					);
					return;
				case "preflight":
					if (event.status === "failed") {
						await recordPreflightFailure(options, latestResults, event);
					}
					return;
				case "task_done":
					await recordTaskDone(options, latestResults, event);
					return;
				case "task_blocked":
					await recordTaskBlocked(options, latestResults, event);
					return;
				case "commit_made":
					await recordCommitMade(options, latestResults, event);
					return;
				case "finalize":
					await recordFinalize(options, activeFinalizerAttempts, event);
					return;
				case "task_finalization_failed":
					await recordTaskFinalizationFailed(
						options,
						activeFinalizerAttempts,
						event,
					);
					return;
				case "run_finalization_failed":
					await recordRunFinalizationFailed(
						options,
						activeFinalizerAttempts,
						event,
					);
					return;
				default:
					return;
			}
		},
		latestTaskResult(taskId) {
			return latestResults.get(taskId);
		},
	};
}

export async function recordDurableFinalizerRetryFailure(
	options: DriveStepProjectorOptions,
	failure: DurableFinalizerRetryFailure,
): Promise<void> {
	await recordRetryableFinalizerFailure(options, new Map(), failure);
}

async function recordSpawnStarted(
	options: DriveStepProjectorOptions,
	activeAttempts: Map<string, ActiveAttempt>,
	metadataWarnings: Set<string>,
	event: Extract<DriverEvent, { type: "spawn_started" }>,
): Promise<void> {
	await upsertTaskStep(options, event.taskId, { status: "running" });

	if (event.backend !== options.configuredBackendName) {
		await appendDiagnostic(options, {
			code: "drive_backend_identity_mismatch",
			message:
				"Drive observed backend telemetry differs from configured durable backend identity.",
			details: {
				taskId: event.taskId,
				configuredBackendName: options.configuredBackendName,
				observedBackendName: event.backend,
			},
		});
	}

	await warnForMissingTaskOrderMetadata(
		options,
		event.taskId,
		metadataWarnings,
	);
	const attemptId = await nextAttemptId(options, event.taskId);
	activeAttempts.set(event.taskId, {
		attemptId,
		startedAt: event.timestamp,
	});
	const attempt: StepAttemptRecord = {
		attemptId,
		startedAt: event.timestamp,
	};
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId: event.taskId },
		attempt,
	);
	await upsertTaskStep(options, event.taskId, {
		status: "running",
		latestAttemptId: attemptId,
	});
}

async function recordSpawnCompleted(
	options: DriveStepProjectorOptions,
	activeAttempts: Map<string, ActiveAttempt>,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "spawn_completed" }>,
): Promise<void> {
	const active =
		activeAttempts.get(event.taskId) ??
		(await synthesizeActiveAttempt(options, activeAttempts, event));
	const result = stepResultFromReport(
		event.taskId,
		active.attemptId,
		event.report,
	);
	latestResults.set(event.taskId, result);

	const attempt: StepAttemptRecord = {
		attemptId: active.attemptId,
		startedAt: active.startedAt,
		endedAt: event.timestamp,
		result,
	};
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId: event.taskId },
		attempt,
		{ outputText: reportEvidence(event.report) },
	);
	await upsertTaskStep(options, event.taskId, {
		status: "running",
		latestAttemptId: active.attemptId,
		outputArtifacts: outputArtifactsForAttempt(event.taskId, active.attemptId),
		result,
	});
	activeAttempts.delete(event.taskId);
}

async function recordSpawnFailed(
	options: DriveStepProjectorOptions,
	activeAttempts: Map<string, ActiveAttempt>,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "spawn_failed" }>,
): Promise<void> {
	const active =
		activeAttempts.get(event.taskId) ??
		(await synthesizeActiveAttempt(options, activeAttempts, event));
	const result: StepResult = {
		outcome: "failed",
		summary: event.error,
		artifacts: outputArtifactsForAttempt(event.taskId, active.attemptId),
		nextAction: "wait_for_human",
	};
	latestResults.set(event.taskId, result);
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId: event.taskId },
		{
			attemptId: active.attemptId,
			startedAt: active.startedAt,
			endedAt: event.timestamp,
			result,
		},
		{ outputText: event.error },
	);
	await upsertTaskStep(options, event.taskId, {
		status: "failed",
		latestAttemptId: active.attemptId,
		outputArtifacts: result.artifacts,
		result,
	});
	activeAttempts.delete(event.taskId);
}

async function recordPreflightFailure(
	options: DriveStepProjectorOptions,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "preflight" }>,
): Promise<void> {
	const summary =
		event.details?.stderr ??
		(event.details?.command
			? `preflight failed: ${event.details.command}`
			: "preflight failed");
	const result: StepResult = {
		outcome: "blocked",
		summary,
		artifacts: [],
		nextAction: "wait_for_human",
	};
	latestResults.set(event.taskId, result);
	await upsertTaskStep(options, event.taskId, {
		status: "blocked",
		result,
	});
}

async function recordTaskDone(
	options: DriveStepProjectorOptions,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "task_done" }>,
): Promise<void> {
	const result =
		latestResults.get(event.taskId) ?? completedResult(event.taskId, undefined);
	latestResults.set(event.taskId, result);
	await upsertTaskStep(options, event.taskId, {
		status: "completed",
		result,
	});
}

async function recordTaskBlocked(
	options: DriveStepProjectorOptions,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "task_blocked" }>,
): Promise<void> {
	const existing = latestResults.get(event.taskId);
	const result =
		existing && existing.outcome !== "success"
			? existing
			: ({
					outcome: event.progress ? "partial" : "blocked",
					summary: event.reason,
					artifacts: [],
					nextAction: "wait_for_human",
				} satisfies StepResult);
	latestResults.set(event.taskId, result);
	await upsertTaskStep(options, event.taskId, {
		status: blockedStepStatus(result),
		result,
	});
}

async function recordCommitMade(
	options: DriveStepProjectorOptions,
	latestResults: Map<string, StepResult>,
	event: Extract<DriverEvent, { type: "commit_made" }>,
): Promise<void> {
	const existingStep = await options.store.readStepRecord({
		...options.ref,
		stepId: event.taskId,
	});
	const result = withCommit(
		latestResults.get(event.taskId) ??
			existingStep?.result ??
			completedResult(event.taskId, undefined),
		event.sha,
		event.subject,
	);
	latestResults.set(event.taskId, result);

	await upsertTaskStep(options, event.taskId, {
		status: existingStep?.status ?? "running",
		outputArtifacts: uniqueArtifacts([
			...(existingStep?.outputArtifacts ?? []),
			commitArtifact(event.sha, event.subject),
		]),
		result,
	});
}

async function recordFinalize(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "finalize" }>,
): Promise<void> {
	const stepId = finalizerStepId(event.phase, event.taskId);
	if (!stepId) {
		await appendDiagnostic(options, missingFinalizerTaskDiagnostic(event));
		return;
	}

	if (event.status === "started") {
		await startFinalizerAttempt(
			options,
			activeFinalizerAttempts,
			event,
			stepId,
		);
		return;
	}

	await finishFinalizerAttempt(
		options,
		activeFinalizerAttempts,
		event,
		stepId,
		finalizeResult(event),
	);
}

async function recordTaskFinalizationFailed(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "task_finalization_failed" }>,
): Promise<void> {
	await recordRetryableFinalizerFailure(options, activeFinalizerAttempts, {
		phase: event.phase,
		taskId: event.taskId,
		reason: event.reason,
		commitSha: event.commitSha,
		timestamp: event.timestamp,
	});
}

async function recordRunFinalizationFailed(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "run_finalization_failed" }>,
): Promise<void> {
	await recordRetryableFinalizerFailure(options, activeFinalizerAttempts, {
		phase: event.phase,
		taskId: event.taskId,
		reason: event.reason,
		commitSha: event.commitSha,
		timestamp: event.timestamp,
	});
}

async function startFinalizerAttempt(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "finalize" }>,
	stepId: string,
): Promise<void> {
	const attemptId = await nextAttemptId(options, stepId);
	activeFinalizerAttempts.set(stepId, {
		attemptId,
		startedAt: event.timestamp,
	});
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId },
		{
			attemptId,
			startedAt: event.timestamp,
		},
		{ outputText: finalizerEvidence(event) },
	);
	await upsertFinalizerStep(options, event.phase, event.taskId, {
		status: "running",
		latestAttemptId: attemptId,
	});
}

async function finishFinalizerAttempt(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "finalize" }>,
	stepId: string,
	result: StepResult,
): Promise<void> {
	const active =
		activeFinalizerAttempts.get(stepId) ??
		(await activeAttemptFromExistingFinalizer(
			options,
			stepId,
			event.timestamp,
		));
	const outputArtifacts = result.artifacts;
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId },
		{
			attemptId: active.attemptId,
			startedAt: active.startedAt,
			endedAt: event.timestamp,
			result,
		},
		{ outputText: finalizerEvidence(event) },
	);
	await upsertFinalizerStep(options, event.phase, event.taskId, {
		status: event.status === "failed" ? "failed" : "completed",
		latestAttemptId: active.attemptId,
		outputArtifacts,
		result,
	});
	activeFinalizerAttempts.delete(stepId);
}

async function recordRetryableFinalizerFailure(
	options: DriveStepProjectorOptions,
	activeFinalizerAttempts: Map<string, ActiveAttempt>,
	failure: DurableFinalizerRetryFailure,
): Promise<void> {
	const stepId = finalizerStepId(failure.phase, failure.taskId);
	if (!stepId) {
		await appendDiagnostic(options, {
			code: "drive_finalizer_task_context_missing",
			message: "Drive finalization failure event has no task context.",
			details: {
				phase: failure.phase,
				reason: failure.reason,
				commitSha: failure.commitSha,
			},
		});
		return;
	}

	const active =
		activeFinalizerAttempts.get(stepId) ??
		(await activeAttemptForRetryableFinalizerFailure(
			options,
			stepId,
			failure.timestamp,
		));
	if (!active) {
		return;
	}
	const result = retryableFinalizerFailureResult(failure);
	await options.store.writeStepAttemptRecord(
		{ ...options.ref, stepId },
		{
			attemptId: active.attemptId,
			startedAt: active.startedAt,
			endedAt: failure.timestamp,
			result,
		},
		{ outputText: `${failure.reason}\n` },
	);
	await upsertFinalizerStep(options, failure.phase, failure.taskId, {
		status: "failed",
		latestAttemptId: active.attemptId,
		outputArtifacts: result.artifacts,
		result,
	});
	activeFinalizerAttempts.delete(stepId);
}

async function activeAttemptForRetryableFinalizerFailure(
	options: DriveStepProjectorOptions,
	stepId: string,
	timestamp: string,
): Promise<ActiveAttempt | undefined> {
	const existing = await options.store.readStepRecord({
		...options.ref,
		stepId,
	});
	if (existing?.latestAttemptId) {
		const attempt = await options.store.readStepAttemptRecord({
			...options.ref,
			stepId,
			attemptId: existing.latestAttemptId,
		});
		if (attempt && !attempt.endedAt && !attempt.result) {
			return {
				attemptId: attempt.attemptId,
				startedAt: attempt.startedAt,
			};
		}
		if (
			attempt?.result?.outcome === "failed" &&
			attempt.result.nextAction === "retry"
		) {
			return undefined;
		}
	}

	return {
		attemptId: await nextAttemptId(options, stepId),
		startedAt: timestamp,
	};
}

async function activeAttemptFromExistingFinalizer(
	options: DriveStepProjectorOptions,
	stepId: string,
	timestamp: string,
): Promise<ActiveAttempt> {
	const existing = await options.store.readStepRecord({
		...options.ref,
		stepId,
	});
	if (existing?.latestAttemptId) {
		const attempt = await options.store.readStepAttemptRecord({
			...options.ref,
			stepId,
			attemptId: existing.latestAttemptId,
		});
		if (attempt && !attempt.endedAt && !attempt.result) {
			return {
				attemptId: attempt.attemptId,
				startedAt: attempt.startedAt,
			};
		}
	}

	return {
		attemptId: await nextAttemptId(options, stepId),
		startedAt: timestamp,
	};
}

async function synthesizeActiveAttempt(
	options: DriveStepProjectorOptions,
	activeAttempts: Map<string, ActiveAttempt>,
	event: Extract<DriverEvent, { type: "spawn_completed" | "spawn_failed" }>,
): Promise<ActiveAttempt> {
	const active = {
		attemptId: await nextAttemptId(options, event.taskId),
		startedAt: event.timestamp,
	};
	activeAttempts.set(event.taskId, active);
	return active;
}

async function upsertTaskStep(
	options: DriveStepProjectorOptions,
	taskId: string,
	updates: Partial<
		Pick<
			StepRecord,
			"status" | "latestAttemptId" | "outputArtifacts" | "result"
		>
	>,
): Promise<StepRecord> {
	const existing = await options.store.readStepRecord({
		...options.ref,
		stepId: taskId,
	});
	const step: StepRecord = {
		id: taskId,
		runId: options.ref.runId,
		title: existing?.title ?? `Drive task ${taskId}`,
		kind: "drive",
		backend: taskBackend(options.configuredBackendName),
		dependsOn: existing?.dependsOn ?? (await taskDependencies(options, taskId)),
		status: updates.status ?? existing?.status ?? "pending",
		inputArtifacts:
			existing?.inputArtifacts ?? inputArtifactsForTask(options, taskId),
		outputArtifacts: updates.outputArtifacts ?? existing?.outputArtifacts ?? [],
		result: updates.result ?? existing?.result,
		latestAttemptId: updates.latestAttemptId ?? existing?.latestAttemptId,
	};
	return await options.store.writeStepRecord(options.ref, step);
}

async function upsertFinalizerStep(
	options: DriveStepProjectorOptions,
	phase: "commit" | "task_status" | "state_commit",
	taskId: string | undefined,
	updates: Partial<
		Pick<
			StepRecord,
			"status" | "latestAttemptId" | "outputArtifacts" | "result"
		>
	>,
): Promise<StepRecord | undefined> {
	const stepId = finalizerStepId(phase, taskId);
	if (!stepId) {
		return undefined;
	}
	const existing = await options.store.readStepRecord({
		...options.ref,
		stepId,
	});
	const inputArtifacts =
		existing?.inputArtifacts ??
		(await inputArtifactsForFinalizer(options, phase, taskId));
	const step: StepRecord = {
		id: stepId,
		runId: options.ref.runId,
		title: existing?.title ?? finalizerTitle(phase, taskId),
		kind: "finalizer",
		backend: finalizerBackend(phase),
		dependsOn:
			existing?.dependsOn ??
			(await finalizerDependencies(options, phase, taskId)),
		status: updates.status ?? existing?.status ?? "pending",
		inputArtifacts,
		outputArtifacts: updates.outputArtifacts ?? existing?.outputArtifacts ?? [],
		result: updates.result ?? existing?.result,
		latestAttemptId: updates.latestAttemptId ?? existing?.latestAttemptId,
	};
	return await options.store.writeStepRecord(options.ref, step);
}

async function taskDependencies(
	options: DriveStepProjectorOptions,
	taskId: string,
): Promise<string[]> {
	const taskIds = await originalTaskIds(options);
	const index = taskIds.indexOf(taskId);
	if (index <= 0) {
		return [];
	}
	const dependency = taskIds[index - 1];
	return dependency ? [dependency] : [];
}

async function originalTaskIds(
	options: DriveStepProjectorOptions,
): Promise<readonly string[]> {
	const record = await options.store.loadRun(options.ref);
	const fromMetadata = record?.metadata?.driveTaskIds;
	if (isStringArray(fromMetadata)) {
		return fromMetadata;
	}
	return options.taskIds;
}

async function finalizerDependencies(
	options: DriveStepProjectorOptions,
	phase: "commit" | "task_status" | "state_commit",
	taskId: string | undefined,
): Promise<string[]> {
	if (phase !== "state_commit") {
		return taskId ? [taskId] : [];
	}
	return [...(await originalTaskIds(options))];
}

async function warnForMissingTaskOrderMetadata(
	options: DriveStepProjectorOptions,
	taskId: string,
	metadataWarnings: Set<string>,
): Promise<void> {
	const record = await options.store.loadRun(options.ref);
	if (isStringArray(record?.metadata?.driveTaskIds)) {
		return;
	}
	if (metadataWarnings.has(taskId)) {
		return;
	}
	metadataWarnings.add(taskId);
	await appendDiagnostic(options, {
		code: "drive_task_order_metadata_missing",
		message:
			"Drive run record lacks original task order metadata; using active task slice for step dependencies.",
		details: { taskId, activeTaskIds: [...options.taskIds] },
	});
}

async function nextAttemptId(
	options: DriveStepProjectorOptions,
	taskId: string,
): Promise<string> {
	const attempts = await options.store.listStepAttemptRecords({
		...options.ref,
		stepId: taskId,
	});
	return `attempt-${String(attempts.length + 1).padStart(3, "0")}`;
}

function finalizeResult(
	event: Extract<DriverEvent, { type: "finalize" }>,
): StepResult {
	const sha = event.details?.sha;
	const subject = event.details?.subject;
	const artifacts = sha ? [commitArtifact(sha, subject)] : [];
	const base: StepResult = {
		outcome: event.status === "failed" ? "failed" : "success",
		summary: finalizerSummary(event),
		artifacts:
			event.status === "failed"
				? uniqueArtifacts([...artifacts, PENDING_FINALIZATION_ARTIFACT])
				: artifacts,
		nextAction: event.status === "failed" ? "retry" : "continue",
	};
	return sha ? withCommit(base, sha, subject) : base;
}

function retryableFinalizerFailureResult(failure: {
	reason: string;
	commitSha?: string;
}): StepResult {
	const base: StepResult = {
		outcome: "failed",
		summary: failure.reason,
		artifacts: failure.commitSha
			? uniqueArtifacts([
					commitArtifact(failure.commitSha),
					PENDING_FINALIZATION_ARTIFACT,
				])
			: [PENDING_FINALIZATION_ARTIFACT],
		nextAction: "retry",
	};
	return failure.commitSha ? withCommit(base, failure.commitSha) : base;
}

function stepResultFromReport(
	taskId: string,
	attemptId: string,
	report: ParsedReport,
): StepResult {
	if (report.outcome === "unknown") {
		return {
			outcome: "unknown",
			summary: "Drive backend report was not machine-readable.",
			artifacts: outputArtifactsForAttempt(taskId, attemptId),
			nextAction: "wait_for_human",
		};
	}

	const outcome = stepOutcome(report.outcome);
	return {
		outcome,
		summary: report.notes?.trim() || defaultSummary(report.outcome),
		artifacts: outputArtifactsForAttempt(taskId, attemptId),
		files: report.files.map(fileChangeSummary),
		verification: report.verification.map(verificationResult),
		nextAction: report.outcome === "success" ? "continue" : "wait_for_human",
	};
}

function completedResult(
	taskId: string,
	attemptId: string | undefined,
): StepResult {
	return {
		outcome: "success",
		summary: "Drive task completed.",
		artifacts: attemptId ? outputArtifactsForAttempt(taskId, attemptId) : [],
		nextAction: "continue",
	};
}

function stepOutcome(outcome: ReportOutcome): StepResult["outcome"] {
	if (outcome === "failure") {
		return "failed";
	}
	return outcome;
}

function blockedStepStatus(result: StepResult): StepRecord["status"] {
	if (result.outcome === "failed") {
		return "failed";
	}
	return "blocked";
}

function defaultSummary(outcome: ReportOutcome): string {
	if (outcome === "success") {
		return "Drive task completed.";
	}
	if (outcome === "partial") {
		return "Drive task partially completed.";
	}
	return "Drive task failed.";
}

function finalizerSummary(
	event: Extract<DriverEvent, { type: "finalize" }>,
): string {
	const label = finalizerPhaseLabel(event.phase);
	if (event.status === "skipped") {
		return `Drive ${label} finalization skipped: ${event.details?.reason ?? "unspecified"}.`;
	}
	if (event.status === "failed") {
		return event.details?.error ?? `Drive ${label} finalization failed.`;
	}
	return `Drive ${label} finalization ${event.status}.`;
}

function finalizerStepId(
	phase: "commit" | "task_status" | "state_commit",
	taskId: string | undefined,
): string | undefined {
	if (phase === "commit") {
		return taskId ? `finalizer-source-commit-${taskId}` : undefined;
	}
	if (phase === "task_status") {
		return taskId ? `finalizer-task-status-${taskId}` : undefined;
	}
	return "finalizer-state-commit";
}

function finalizerTitle(
	phase: "commit" | "task_status" | "state_commit",
	taskId: string | undefined,
): string {
	const label = finalizerPhaseLabel(phase);
	return taskId
		? `Drive ${label} finalizer for ${taskId}`
		: `Drive ${label} finalizer`;
}

function finalizerPhaseLabel(
	phase: "commit" | "task_status" | "state_commit",
): string {
	switch (phase) {
		case "commit":
			return "source commit";
		case "task_status":
			return "task status";
		case "state_commit":
			return "state commit";
	}
}

function outputArtifactsForAttempt(
	taskId: string,
	attemptId: string,
): ArtifactRef[] {
	return [
		{
			id: REPORT_ARTIFACT_ID,
			path: `steps/${taskId}/attempts/${attemptId}/result.json`,
			kind: "report",
		},
	];
}

async function inputArtifactsForFinalizer(
	options: DriveStepProjectorOptions,
	phase: "commit" | "task_status" | "state_commit",
	taskId: string | undefined,
): Promise<ArtifactRef[]> {
	const taskIds =
		phase === "state_commit"
			? await originalTaskIds(options)
			: taskId
				? [taskId]
				: [];
	return taskIds.map((id) => ({
		id: `step:${id}`,
		path: `steps/${id}/step.json`,
		kind: "step",
	}));
}

function inputArtifactsForTask(
	_options: DriveStepProjectorOptions,
	taskId: string,
): ArtifactRef[] {
	return [
		{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
		{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
	];
}

function fileChangeSummary(file: Report["files"][number]): FileChangeSummary {
	return {
		path: file.path,
		status: file.change === "created" ? "added" : file.change,
	};
}

function verificationResult(
	verification: Report["verification"][number],
): VerificationResult {
	return {
		command: verification.command,
		status: verification.status === "not_run" ? "skipped" : verification.status,
	};
}

function withCommit(
	result: StepResult,
	sha: string,
	subject?: string,
): StepResult {
	const commit = compactRecord({ sha, subject }) as {
		sha: string;
		subject?: string;
	};
	const commits = [
		...(result.commits ?? []).filter((item) => item.sha !== sha),
		commit,
	];
	return {
		...result,
		artifacts: uniqueArtifacts([
			...result.artifacts,
			commitArtifact(sha, subject),
		]),
		commits,
	};
}

function commitArtifact(sha: string, subject?: string): ArtifactRef {
	return {
		id: `commit:${sha}`,
		path: sha,
		kind: "commit",
		metadata: compactRecord({ sha, subject }),
	};
}

function finalizerBackend(
	phase: "commit" | "task_status" | "state_commit",
): BackendSpec {
	return { name: "shell-command", options: { drivePhase: phase } };
}

function uniqueArtifacts(artifacts: readonly ArtifactRef[]): ArtifactRef[] {
	const seen = new Set<string>();
	const unique: ArtifactRef[] = [];
	for (const artifact of artifacts) {
		const key = `${artifact.id}\0${artifact.path}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		unique.push(artifact);
	}
	return unique;
}

function reportEvidence(report: ParsedReport): string {
	if (report.outcome === "unknown") {
		return report.raw;
	}
	return `${JSON.stringify(report, null, 2)}\n`;
}

async function appendDiagnostic(
	options: DriveStepProjectorOptions,
	diagnostic: RuntimeDiagnostic,
): Promise<void> {
	await options.store.appendDiagnostic?.(options.ref, diagnostic);
}

function finalizerEvidence(
	event: Extract<DriverEvent, { type: "finalize" }>,
): string {
	return `${JSON.stringify(
		compactRecord({
			type: event.type,
			phase: event.phase,
			status: event.status,
			taskId: event.taskId,
			details: event.details,
		}),
		null,
		2,
	)}\n`;
}

function missingFinalizerTaskDiagnostic(
	event: Extract<DriverEvent, { type: "finalize" }>,
): RuntimeDiagnostic {
	return {
		code: "drive_finalizer_task_context_missing",
		message: "Drive task finalization event has no task context.",
		details: {
			phase: event.phase,
			status: event.status,
			details: event.details,
		},
	};
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function taskBackend(name: BackendName): BackendSpec {
	return { name };
}

function compactRecord(
	record: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	);
}
