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

interface ActiveAttempt {
	attemptId: string;
	startedAt: string;
}

const REPORT_ARTIFACT_ID = "report";

export function createDriveStepProjector(
	options: DriveStepProjectorOptions,
): DriveStepProjector {
	const activeAttempts = new Map<string, ActiveAttempt>();
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
				default:
					return;
			}
		},
		latestTaskResult(taskId) {
			return latestResults.get(taskId);
		},
	};
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

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function taskBackend(name: BackendName): BackendSpec {
	return { name };
}
