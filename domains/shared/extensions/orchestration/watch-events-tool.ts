import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { tailEvents } from "../../../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../../../lib/driver/types.ts";

const MAX_RENDERED_EVENTS = 30;
const MAX_LINE_LENGTH = 160;

export function registerWatchEventsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "watch_events",
		label: "Watch Driver Events",
		description:
			"Read driver events from a run JSONL log with cursor support. Returns recent events as compact one-line summaries (type plus key fields) in the text output, plus the full structured event list and the next cursor.",
		parameters: Type.Object({
			planSlug: Type.String({ description: "Plan slug for the driver run" }),
			runId: Type.String({ description: "Driver run ID" }),
			since: Type.Optional(
				Type.Number({
					description: "Cursor line number returned by watch_events",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const eventLogPath = join(
				ctx.cwd,
				"missions",
				"sessions",
				params.planSlug,
				"runs",
				params.runId,
				"events.jsonl",
			);
			const result = await tailEvents(eventLogPath, params.since ?? 0);

			return {
				...result,
				content: [
					{
						type: "text" as const,
						text: renderEventsText(result.events, result.cursor),
					},
				],
				details: result,
			};
		},
	});
}

function renderEventsText(events: DriverEvent[], cursor: number): string {
	if (events.length === 0) {
		return `No new driver events; cursor ${cursor}`;
	}

	const overflow = Math.max(0, events.length - MAX_RENDERED_EVENTS);
	const shown = overflow > 0 ? events.slice(-MAX_RENDERED_EVENTS) : events;

	const lines: string[] = [];
	if (overflow > 0) {
		lines.push(
			`(+${overflow} earlier events not shown; full list is in the structured result — use an earlier 'since' cursor to page back)`,
		);
	}
	for (const event of shown) {
		lines.push(`- ${summarizeDriverEvent(event)}`);
	}
	lines.push(`cursor ${cursor}`);
	return lines.join("\n");
}

export function summarizeDriverEvent(event: DriverEvent): string {
	return clip(`${event.type}: ${describeDriverEvent(event)}`);
}

function describeDriverEvent(event: DriverEvent): string {
	switch (event.type) {
		case "run_started":
			return `${event.planSlug} via ${event.backend} (${event.mode})`;
		case "task_started":
			return event.taskId;
		case "preflight":
			return joinParts([
				event.taskId,
				event.status,
				event.details?.command && `cmd: ${event.details.command}`,
			]);
		case "spawn_started":
			return `${event.taskId} via ${event.backend}`;
		case "driver_activity":
			return `${event.taskId} ${describeActivity(event.activity)}`;
		case "spawn_completed":
			return `${event.taskId} report: ${describeReportOutcome(event.report)}`;
		case "spawn_failed":
			return joinParts([
				event.taskId,
				`error: ${event.error}`,
				event.exitCode !== undefined && `exitCode: ${event.exitCode}`,
			]);
		case "verify":
			return joinParts([
				event.taskId,
				event.status,
				event.details?.command && `cmd: ${event.details.command}`,
			]);
		case "commit_made":
			return `${event.taskId} ${shortSha(event.sha)} ${event.subject}`;
		case "task_done":
			return event.taskId;
		case "task_blocked":
			return joinParts([
				event.taskId,
				`reason: ${event.reason}`,
				event.progress &&
					`progress: phase ${event.progress.phase}/${event.progress.of}`,
			]);
		case "lock_warning":
			return joinParts([
				`reason: ${event.reason}`,
				event.details?.previousRunId &&
					`previousRunId: ${event.details.previousRunId}`,
			]);
		case "run_completed":
			return `total ${event.summary.total}, done ${event.summary.done}, blocked ${event.summary.blocked}`;
		case "run_aborted":
			return `reason: ${event.reason}`;
		default:
			return JSON.stringify(event);
	}
}

type DriverActivity = Extract<
	DriverEvent,
	{ type: "driver_activity" }
>["activity"];

function describeActivity(activity: DriverActivity): string {
	switch (activity.kind) {
		case "tool_start":
			return `tool_start ${activity.toolName}: ${activity.summary}`;
		case "tool_end":
			return `tool_end ${activity.toolName}${activity.isError ? " (error)" : ""}`;
		case "turn_start":
			return "turn_start";
		case "turn_end":
			return "turn_end";
		case "compaction":
			return "compaction";
		default:
			return "activity";
	}
}

function describeReportOutcome(
	report: Extract<DriverEvent, { type: "spawn_completed" }>["report"],
): string {
	if (report.outcome === "unknown") {
		return "unknown";
	}
	const phase = report.progress
		? `, phase ${report.progress.phase}/${report.progress.of}`
		: "";
	return `${report.outcome}${phase}`;
}

function joinParts(parts: (string | false | undefined | null)[]): string {
	return parts.filter((part): part is string => Boolean(part)).join(", ");
}

function shortSha(sha: string): string {
	return sha.slice(0, 8);
}

function clip(text: string): string {
	const flattened = text.replace(/\s+/g, " ").trim();
	if (flattened.length <= MAX_LINE_LENGTH) {
		return flattened;
	}
	return `${flattened.slice(0, MAX_LINE_LENGTH - 1)}…`;
}
