import { appendFile, readFile } from "node:fs/promises";
import type { BusEvent } from "../orchestration/message-bus.ts";
import type { DriverEvent, EventSink, SpawnActivity } from "./types.ts";

export type { EventSink } from "./types.ts";

export interface DriverActivityBusEvent extends BusEvent {
	type: "driver_activity";
	runId: string;
	parentSessionId: string;
	taskId: string;
	activity: SpawnActivity;
}

export interface DriverEventBusEvent extends BusEvent {
	type: "driver_event";
	runId: string;
	parentSessionId: string;
	event: DriverEvent;
}

export type DriverBusEvent = DriverActivityBusEvent | DriverEventBusEvent;

export interface DriverEventPublisher {
	publish(event: DriverBusEvent): void;
}

export interface CreateEventSinkOptions {
	logPath: string;
	runId: string;
	parentSessionId: string;
	activityBus: DriverEventPublisher;
}

export interface TailEventsResult {
	events: DriverEvent[];
	cursor: number;
}

export class EventLogWriteError extends Error {
	readonly logPath: string;
	readonly eventType: DriverEvent["type"];

	constructor(logPath: string, event: DriverEvent, cause: unknown) {
		super(`Failed to write driver event log: ${logPath}`, { cause });
		this.name = "EventLogWriteError";
		this.logPath = logPath;
		this.eventType = event.type;
	}
}

export function createEventSink({
	logPath,
	activityBus,
}: CreateEventSinkOptions): EventSink {
	return async (event) => {
		await writeJsonLine(logPath, event);

		const busEvent = toBusEvent(event);
		if (busEvent) {
			activityBus.publish(busEvent);
		}
	};
}

export function shouldBridge(event: DriverEvent): boolean {
	if (event.type === "preflight") {
		return event.status === "failed";
	}

	return BRIDGED_EVENT_TYPES.has(event.type);
}

export function toBusEvent(event: DriverEvent): DriverBusEvent | undefined {
	if (!shouldBridge(event)) {
		return undefined;
	}

	if (event.type === "driver_activity") {
		return {
			type: "driver_activity",
			runId: event.runId,
			parentSessionId: event.parentSessionId,
			taskId: event.taskId,
			activity: event.activity,
		};
	}

	return {
		type: "driver_event",
		runId: event.runId,
		parentSessionId: event.parentSessionId,
		event,
	};
}

export async function tailEvents(
	path: string,
	since = 0,
): Promise<TailEventsResult> {
	const content = await readFile(path, "utf-8");
	const lines = splitJsonLines(content);

	if (since >= lines.length) {
		return { events: [], cursor: since };
	}

	const events: DriverEvent[] = [];
	for (let index = Math.max(0, since); index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined) {
			continue;
		}

		try {
			events.push(JSON.parse(line) as DriverEvent);
		} catch (error) {
			console.error(
				`Skipping malformed driver event log line ${index + 1} in ${path}: ${formatJsonError(error)}`,
			);
		}
	}

	return { events, cursor: lines.length };
}

const BRIDGED_EVENT_TYPES = new Set<DriverEvent["type"]>([
	"driver_activity",
	"task_done",
	"task_blocked",
	"commit_made",
	"lock_warning",
	"run_completed",
	"run_aborted",
]);

async function writeJsonLine(
	logPath: string,
	event: DriverEvent,
): Promise<void> {
	try {
		await appendFile(logPath, `${JSON.stringify(event)}\n`, "utf-8");
	} catch (error) {
		throw new EventLogWriteError(logPath, event, error);
	}
}

function splitJsonLines(content: string): string[] {
	const lines = content.split("\n");
	if (content.endsWith("\n")) {
		lines.pop();
	}
	return lines.map((line) => line.replace(/\r$/, ""));
}

function formatJsonError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
