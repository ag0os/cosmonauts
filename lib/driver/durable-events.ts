import type {
	OrchestrationEvent,
	RuntimeDiagnostic,
	StepResult,
} from "../durable-runtime/index.ts";
import type { DriverEvent } from "./types.ts";

export type DriverEventNormalizationDiagnostic = RuntimeDiagnostic & {
	details: Record<string, unknown>;
};

interface DriverEventNormalization {
	events: OrchestrationEvent[];
	diagnostics: DriverEventNormalizationDiagnostic[];
}

interface DriverEventNormalizationContext {
	latestTaskResult?(taskId: string): StepResult | undefined;
}

interface ActivitySource {
	runId: string;
	taskId: string;
}

type DriverEventOf<Type extends DriverEvent["type"]> = Extract<
	DriverEvent,
	{ type: Type }
>;

type DriverEventNormalizer = (
	event: DriverEvent,
	context: DriverEventNormalizationContext,
) => DriverEventNormalization;

function driverEventNormalizer<Type extends DriverEvent["type"]>(
	normalize: (
		event: DriverEventOf<Type>,
		context: DriverEventNormalizationContext,
	) => DriverEventNormalization,
): DriverEventNormalizer {
	return (event, context) => normalize(event as DriverEventOf<Type>, context);
}

export function normalizeDriverEvent(
	event: DriverEvent,
	context: DriverEventNormalizationContext = {},
): DriverEventNormalization {
	return DRIVER_EVENT_NORMALIZERS[event.type](event, context);
}

const DRIVER_EVENT_NORMALIZERS = {
	run_started: driverEventNormalizer<"run_started">((event) =>
		events({ type: "run_started", runId: event.runId }),
	),
	task_started: driverEventNormalizer<"task_started">((event) =>
		events(stepEvent(event, "step_ready")),
	),
	preflight: driverEventNormalizer<"preflight">((event) =>
		normalizePreflight(event),
	),
	spawn_started: driverEventNormalizer<"spawn_started">((event) =>
		events({
			type: "step_started",
			runId: event.runId,
			stepId: event.taskId,
			backend: event.backend,
		}),
	),
	driver_activity: driverEventNormalizer<"driver_activity">((event) =>
		events(
			activityEvent(event, {
				kind: "driver_activity",
				activity: event.activity,
			}),
		),
	),
	spawn_completed: driverEventNormalizer<"spawn_completed">((event) =>
		events(
			activityEvent(event, {
				kind: "spawn_completed",
				report: event.report,
			}),
		),
	),
	spawn_failed: driverEventNormalizer<"spawn_failed">((event) =>
		events(activityEvent(event, spawnFailedDetails(event))),
	),
	verify: driverEventNormalizer<"verify">((event) =>
		events(activityEvent(event, verifyDetails(event))),
	),
	commit_made: driverEventNormalizer<"commit_made">((event) =>
		events({
			type: "artifact_written",
			runId: event.runId,
			stepId: event.taskId,
			artifact: {
				id: `commit:${event.taskId}:${event.sha}`,
				path: event.sha,
				kind: "commit",
				metadata: { sha: event.sha, subject: event.subject },
			},
		}),
	),
	finalize: driverEventNormalizer<"finalize">((event) =>
		normalizeFinalize(event),
	),
	task_finalization_failed: driverEventNormalizer<"task_finalization_failed">(
		(event) =>
			events(activityEvent(event, taskFinalizationFailedDetails(event)), {
				type: "step_failed",
				runId: event.runId,
				stepId: event.taskId,
				reason: event.reason,
			}),
	),
	task_done: driverEventNormalizer<"task_done">((event, context) =>
		events({
			type: "step_completed",
			runId: event.runId,
			stepId: event.taskId,
			result: taskDoneResult(event.taskId, context),
		}),
	),
	task_blocked: driverEventNormalizer<"task_blocked">((event) =>
		events(activityEvent(event, taskBlockedDetails(event)), {
			type: "step_blocked",
			runId: event.runId,
			stepId: event.taskId,
			reason: event.reason,
		}),
	),
	lock_warning: driverEventNormalizer<"lock_warning">((event) =>
		diagnostic(legacyOnlyDiagnostic(event)),
	),
	plan_completion_candidate: driverEventNormalizer<"plan_completion_candidate">(
		(event) => diagnostic(legacyOnlyDiagnostic(event)),
	),
	run_completed: driverEventNormalizer<"run_completed">((event) =>
		events({
			type: "run_completed",
			runId: event.runId,
			result: {
				outcome: "completed",
				tasksDone: event.summary.done,
				tasksBlocked: event.summary.blocked,
			},
		}),
	),
	run_aborted: driverEventNormalizer<"run_aborted">((event) =>
		events({
			type: "run_failed",
			runId: event.runId,
			reason: event.reason,
		}),
	),
	run_finalization_failed: driverEventNormalizer<"run_finalization_failed">(
		(event) => normalizeRunFinalizationFailed(event),
	),
} satisfies Record<DriverEvent["type"], DriverEventNormalizer>;

function normalizePreflight(
	event: Extract<DriverEvent, { type: "preflight" }>,
): DriverEventNormalization {
	const detail = compactRecord({
		kind: "preflight",
		status: event.status,
		...event.details,
	});
	const activity = activityEvent(event, detail);
	if (event.status !== "failed") {
		return events(activity);
	}

	return events(activity, {
		type: "step_blocked",
		runId: event.runId,
		stepId: event.taskId,
		reason: preflightFailureReason(event),
	});
}

function normalizeFinalize(
	event: Extract<DriverEvent, { type: "finalize" }>,
): DriverEventNormalization {
	if (!event.taskId) {
		return diagnostic({
			code: "drive_finalization_evidence",
			message:
				"Drive finalize event has no task context for normalized activity.",
			details: compactRecord({
				eventType: event.type,
				phase: event.phase,
				status: event.status,
				...event.details,
			}),
		});
	}

	return events(
		activityEvent({ ...event, taskId: event.taskId }, finalizeDetails(event)),
	);
}

function normalizeRunFinalizationFailed(
	event: Extract<DriverEvent, { type: "run_finalization_failed" }>,
): DriverEventNormalization {
	const terminal: OrchestrationEvent = {
		type: "run_failed",
		runId: event.runId,
		reason: event.reason,
	};

	if (!event.taskId) {
		return {
			events: [terminal],
			diagnostics: [
				{
					code: "drive_finalization_evidence",
					message:
						"Drive run_finalization_failed event has no task context for normalized activity.",
					details: runFinalizationFailedDiagnosticDetails(event),
				},
			],
		};
	}

	return events(
		activityEvent(
			{ ...event, taskId: event.taskId },
			runFinalizationFailedActivityDetails(event),
		),
		terminal,
	);
}

function events(...normalized: OrchestrationEvent[]): DriverEventNormalization {
	return { events: normalized, diagnostics: [] };
}

function diagnostic(
	...diagnostics: DriverEventNormalizationDiagnostic[]
): DriverEventNormalization {
	return { events: [], diagnostics };
}

function stepEvent<T extends "step_ready">(
	event: Extract<DriverEvent, { taskId: string }>,
	type: T,
): Extract<OrchestrationEvent, { type: T }> {
	return { type, runId: event.runId, stepId: event.taskId } as Extract<
		OrchestrationEvent,
		{ type: T }
	>;
}

function activityEvent(
	event: ActivitySource,
	details: Record<string, unknown>,
): Extract<OrchestrationEvent, { type: "step_tool_activity" }> {
	return {
		type: "step_tool_activity",
		runId: event.runId,
		stepId: event.taskId,
		details,
	};
}

function preflightFailureReason(
	event: Extract<DriverEvent, { type: "preflight" }>,
): string {
	const stderr = event.details?.stderr?.trim();
	if (stderr) {
		return stderr;
	}
	const command = event.details?.command?.trim();
	if (command) {
		return `preflight failed: ${command}`;
	}
	return "preflight failed";
}

function spawnFailedDetails(
	event: Extract<DriverEvent, { type: "spawn_failed" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "spawn_failed",
		error: event.error,
		exitCode: event.exitCode,
		contradicted: event.contradicted,
	});
}

function verifyDetails(
	event: Extract<DriverEvent, { type: "verify" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "verify",
		phase: event.phase,
		status: event.status,
		...event.details,
	});
}

function finalizeDetails(
	event: Extract<DriverEvent, { type: "finalize" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "finalize",
		phase: event.phase,
		status: event.status,
		...event.details,
	});
}

function taskBlockedDetails(
	event: Extract<DriverEvent, { type: "task_blocked" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "task_blocked",
		reason: event.reason,
		progress: event.progress,
		contradicted: event.contradicted,
	});
}

function taskFinalizationFailedDetails(
	event: Extract<DriverEvent, { type: "task_finalization_failed" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "task_finalization_failed",
		phase: event.phase,
		reason: event.reason,
		commitSha: event.commitSha,
		retryable: event.retryable,
	});
}

function runFinalizationFailedActivityDetails(
	event: Extract<DriverEvent, { type: "run_finalization_failed" }>,
): Record<string, unknown> {
	return compactRecord({
		kind: "run_finalization_failed",
		phase: event.phase,
		reason: event.reason,
		taskId: event.taskId,
		commitSha: event.commitSha,
	});
}

function runFinalizationFailedDiagnosticDetails(
	event: Extract<DriverEvent, { type: "run_finalization_failed" }>,
): Record<string, unknown> {
	return compactRecord({
		eventType: event.type,
		phase: event.phase,
		reason: event.reason,
		taskId: event.taskId,
		commitSha: event.commitSha,
	});
}

function legacyOnlyDiagnostic(
	event: Extract<
		DriverEvent,
		{ type: "lock_warning" | "plan_completion_candidate" }
	>,
): DriverEventNormalizationDiagnostic {
	return {
		code: "legacy_only_driver_event",
		message: `Drive ${event.type} event has no canonical normalized variant.`,
		details: { eventType: event.type },
	};
}

function taskDoneResult(
	taskId: string,
	context: DriverEventNormalizationContext,
): StepResult {
	const latest = context.latestTaskResult?.(taskId);
	return isUnknownReportCorrection(latest) ? latest : completedTaskResult();
}

function isUnknownReportCorrection(
	result: StepResult | undefined,
): result is StepResult {
	return result?.outcome === "unknown" && result.nextAction !== "continue";
}

function completedTaskResult(): StepResult {
	return {
		outcome: "success",
		summary: "Drive task completed.",
		artifacts: [],
	};
}

function compactRecord(
	record: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	);
}
