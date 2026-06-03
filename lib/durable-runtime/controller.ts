import type {
	OrchestrationEvent,
	ReadEventsOptions,
	RunRecord,
	RunRef,
	RunStatus,
	RunStatusSummary,
	RunStore,
	RuntimeDiagnostic,
	RunWatchSummary,
	StoredOrchestrationEvent,
} from "./types.ts";

export async function runWatch(
	store: RunStore,
	ref: RunRef,
	options: ReadEventsOptions = {},
): Promise<RunWatchSummary> {
	const result = await store.readEvents(ref, options);

	return {
		runId: result.runId,
		cursor: result.cursor,
		events: result.events.map((envelope) => ({
			seq: envelope.seq,
			text: summarizeEvent(envelope),
			envelope,
		})),
		diagnostics: result.diagnostics,
	};
}

export async function runStatus(
	store: RunStore,
	ref: RunRef,
): Promise<RunStatusSummary | undefined> {
	const record = await store.loadRun(ref);
	if (!record) {
		return undefined;
	}

	const result = await store.readEvents(ref);
	return summarizeRunStatus(record, result.events, result.diagnostics);
}

export function summarizeRunStatus(
	record: RunRecord,
	events: StoredOrchestrationEvent[],
	diagnostics: RuntimeDiagnostic[] = [],
): RunStatusSummary {
	const ordered = [...events].sort((left, right) => left.seq - right.seq);
	const terminal = latestTerminalRunEvent(ordered);
	if (terminal) {
		const eventStatus = statusFromEvent(terminal.event);
		if (eventStatus) {
			return {
				scope: record.scope,
				runId: record.runId,
				status: eventStatus,
				statusSource: "event",
				recordStatus: record.status,
				eventStatus,
				updatedAt: terminal.timestamp,
				diagnostics: [
					...diagnostics,
					...adjacentTerminalDiagnostics(ordered, terminal),
				],
			};
		}
	}

	return {
		scope: record.scope,
		runId: record.runId,
		status: record.status,
		statusSource: "record",
		recordStatus: record.status,
		updatedAt: record.updatedAt,
		diagnostics,
	};
}

function summarizeEvent(envelope: StoredOrchestrationEvent): string {
	const event = envelope.event;
	switch (event.type) {
		case "run_started":
			return `${envelope.seq} run_started`;
		case "run_completed":
			return `${envelope.seq} run_completed: ${event.result.outcome}`;
		case "run_blocked":
			return `${envelope.seq} run_blocked: ${event.reason}`;
		case "run_failed":
			return `${envelope.seq} run_failed: ${event.reason}`;
		case "run_cancelled":
			return `${envelope.seq} run_cancelled`;
		case "run_stale":
			return `${envelope.seq} run_stale`;
		case "step_ready":
			return `${envelope.seq} step_ready ${event.stepId}`;
		case "step_started":
			return `${envelope.seq} step_started ${event.stepId}: ${event.backend}`;
		case "step_heartbeat":
			return `${envelope.seq} step_heartbeat ${event.stepId}`;
		case "step_output":
			return `${envelope.seq} step_output ${event.stepId}: ${compactText(event.chunk)}`;
		case "step_tool_activity":
			return `${envelope.seq} step_tool_activity ${event.stepId}`;
		case "artifact_written":
			return `${envelope.seq} artifact_written${event.stepId ? ` ${event.stepId}` : ""}: ${event.artifact.id}`;
		case "step_completed":
			return `${envelope.seq} step_completed ${event.stepId}: ${event.result.outcome}`;
		case "step_failed":
			return `${envelope.seq} step_failed ${event.stepId}: ${event.reason}`;
		case "step_blocked":
			return `${envelope.seq} step_blocked ${event.stepId}: ${event.reason}`;
		case "child_run_started":
			return `${envelope.seq} child_run_started ${event.stepId}: ${event.childRunId}`;
		case "step_cancelled":
			return `${envelope.seq} step_cancelled ${event.stepId}`;
		case "step_stale":
			return `${envelope.seq} step_stale ${event.stepId}`;
	}
}

function compactText(value: string): string {
	const compact = value.replace(/\s+/g, " ").trim();
	return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function adjacentTerminalDiagnostics(
	events: StoredOrchestrationEvent[],
	terminal: StoredOrchestrationEvent,
): RuntimeDiagnostic[] {
	if (terminal.event.type !== "run_failed") {
		return [];
	}

	const terminalIndex = events.findIndex((event) => event.seq === terminal.seq);
	const previous = terminalIndex > 0 ? events[terminalIndex - 1] : undefined;
	if (
		previous?.event.type !== "step_tool_activity" ||
		!looksLikeFinalizationEvidence(previous.event.details)
	) {
		return [];
	}

	return [
		{
			code: "drive_finalization_evidence",
			message:
				"Adjacent activity event contains Drive finalization evidence for the terminal run failure.",
			details: {
				terminalSeq: terminal.seq,
				activitySeq: previous.seq,
				activity: previous.event.details,
			},
		},
	];
}

function looksLikeFinalizationEvidence(details: unknown): boolean {
	if (typeof details !== "object" || details === null) {
		return false;
	}

	const record = details as Record<string, unknown>;
	return (
		hasOwn(record, "finalizationPhase") ||
		hasOwn(record, "finalizationReason") ||
		hasOwn(record, "finalizationTaskId") ||
		hasOwn(record, "finalizationCommitSha") ||
		record.kind === "finalization" ||
		record.type === "finalization"
	);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.hasOwn(record, key);
}

function latestTerminalRunEvent(
	events: StoredOrchestrationEvent[],
): StoredOrchestrationEvent | undefined {
	return events
		.filter((event) => {
			const status = statusFromEvent(event.event);
			return status !== undefined && isTerminalStatus(status);
		})
		.at(-1);
}

function statusFromEvent(event: OrchestrationEvent): RunStatus | undefined {
	switch (event.type) {
		case "run_completed":
			return "completed";
		case "run_blocked":
			return "blocked";
		case "run_failed":
			return "failed";
		case "run_cancelled":
			return "cancelled";
		case "run_stale":
			return "stale";
		case "run_started":
			return "running";
		default:
			return undefined;
	}
}

function isTerminalStatus(status: RunStatus): boolean {
	return (
		status === "completed" ||
		status === "blocked" ||
		status === "failed" ||
		status === "cancelled" ||
		status === "stale"
	);
}
