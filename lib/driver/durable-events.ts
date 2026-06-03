import type {
	OrchestrationEvent,
	RuntimeDiagnostic,
	StepResult,
} from "../durable-runtime/index.ts";
import type { DriverEvent } from "./types.ts";

export type DriverEventNormalizationDiagnostic = RuntimeDiagnostic & {
	details: Record<string, unknown>;
};

export interface DriverEventNormalization {
	events: OrchestrationEvent[];
	diagnostics: DriverEventNormalizationDiagnostic[];
}

interface ActivitySource {
	runId: string;
	taskId: string;
}

export function normalizeDriverEvent(
	event: DriverEvent,
): DriverEventNormalization {
	switch (event.type) {
		case "run_started":
			return events({ type: "run_started", runId: event.runId });
		case "task_started":
			return events(stepEvent(event, "step_ready"));
		case "preflight":
			return normalizePreflight(event);
		case "spawn_started":
			return events({
				type: "step_started",
				runId: event.runId,
				stepId: event.taskId,
				backend: event.backend,
			});
		case "driver_activity":
			return events(
				activityEvent(event, {
					kind: "driver_activity",
					activity: event.activity,
				}),
			);
		case "spawn_completed":
			return events(
				activityEvent(event, {
					kind: "spawn_completed",
					report: event.report,
				}),
			);
		case "spawn_failed":
			return events(activityEvent(event, spawnFailedDetails(event)));
		case "verify":
			return events(activityEvent(event, verifyDetails(event)));
		case "commit_made":
			return events({
				type: "artifact_written",
				runId: event.runId,
				stepId: event.taskId,
				artifact: {
					id: `commit:${event.taskId}:${event.sha}`,
					path: event.sha,
					kind: "commit",
					metadata: { sha: event.sha, subject: event.subject },
				},
			});
		case "finalize":
			return normalizeFinalize(event);
		case "task_finalization_failed":
			return events(
				activityEvent(event, taskFinalizationFailedDetails(event)),
				{
					type: "step_failed",
					runId: event.runId,
					stepId: event.taskId,
					reason: event.reason,
				},
			);
		case "task_done":
			return events({
				type: "step_completed",
				runId: event.runId,
				stepId: event.taskId,
				result: completedTaskResult(),
			});
		case "task_blocked":
			return events(activityEvent(event, taskBlockedDetails(event)), {
				type: "step_blocked",
				runId: event.runId,
				stepId: event.taskId,
				reason: event.reason,
			});
		case "lock_warning":
		case "plan_completion_candidate":
			return diagnostic(legacyOnlyDiagnostic(event));
		case "run_completed":
			return events({
				type: "run_completed",
				runId: event.runId,
				result: {
					outcome: "completed",
					tasksDone: event.summary.done,
					tasksBlocked: event.summary.blocked,
				},
			});
		case "run_aborted":
			return events({
				type: "run_failed",
				runId: event.runId,
				reason: event.reason,
			});
		case "run_finalization_failed":
			return normalizeRunFinalizationFailed(event);
	}
}

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
