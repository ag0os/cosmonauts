import { existsSync, type FSWatcher, watch } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
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

export interface JsonlActivityBusBridge {
	stop(): void;
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

export function bridgeJsonlToActivityBus(
	path: string,
	runId: string,
	parentSessionId: string,
	bus: DriverEventPublisher,
): JsonlActivityBusBridge {
	const filePath = path;
	const targetName = basename(filePath);
	const parentDir = dirname(filePath);
	let cursor = 0;
	let stopped = false;
	let tailingStarted = false;
	let polling = false;
	let pollAgain = false;
	let directoryWatcher: FSWatcher | undefined;
	let fileWatcher: FSWatcher | undefined;
	let retryInterval: NodeJS.Timeout | undefined;
	let missingFileCheckInterval: NodeJS.Timeout | undefined;
	let missingFileTimeout: NodeJS.Timeout | undefined;

	const stop = (): void => {
		if (stopped) {
			return;
		}

		stopped = true;
		directoryWatcher?.close();
		fileWatcher?.close();
		if (retryInterval) {
			clearInterval(retryInterval);
		}
		if (missingFileCheckInterval) {
			clearInterval(missingFileCheckInterval);
		}
		if (missingFileTimeout) {
			clearTimeout(missingFileTimeout);
		}
	};

	const reportError = (
		code: string,
		message: string,
		error?: unknown,
		extra: Record<string, unknown> = {},
	): void => {
		console.error(
			JSON.stringify({
				type: "driver_event_bridge_error",
				code,
				path: filePath,
				runId,
				parentSessionId,
				message,
				error: error === undefined ? undefined : formatJsonError(error),
				...extra,
			}),
		);
	};

	const schedulePoll = (): void => {
		if (stopped) {
			return;
		}
		if (polling) {
			pollAgain = true;
			return;
		}

		void poll();
	};

	const poll = async (): Promise<void> => {
		if (stopped) {
			return;
		}

		polling = true;
		try {
			const content = await readFile(filePath, "utf-8");
			if (cursor > content.length) {
				cursor = 0;
			}

			const pending = content.slice(cursor);
			if (pending.length === 0) {
				return;
			}

			const parts = pending.split("\n");
			// Drop the trailing fragment; cursor remains before it until newline.
			parts.pop();

			for (const rawLine of parts) {
				const lineStart = cursor;
				const line = rawLine.replace(/\r$/, "");
				let event: DriverEvent;

				try {
					event = JSON.parse(line) as DriverEvent;
				} catch (error) {
					reportError(
						"parse_error",
						"Failed to parse driver event JSONL line; retrying without advancing cursor",
						error,
						{ cursor: lineStart },
					);
					return;
				}

				cursor += rawLine.length + 1;
				if (
					event.runId !== runId ||
					event.parentSessionId !== parentSessionId
				) {
					continue;
				}

				const busEvent = toBusEvent(event);
				if (busEvent) {
					bus.publish(busEvent);
				}

				if (isTerminalEvent(event)) {
					stop();
					return;
				}
			}
		} catch (error) {
			if (!isNotFoundError(error)) {
				reportError(
					"read_error",
					"Failed to read driver event JSONL file",
					error,
				);
			}
		} finally {
			polling = false;
			if (pollAgain && !stopped) {
				pollAgain = false;
				schedulePoll();
			}
		}
	};

	const startTailing = (): void => {
		if (stopped || tailingStarted) {
			return;
		}

		tailingStarted = true;
		directoryWatcher?.close();
		directoryWatcher = undefined;
		if (missingFileTimeout) {
			clearTimeout(missingFileTimeout);
			missingFileTimeout = undefined;
		}
		if (missingFileCheckInterval) {
			clearInterval(missingFileCheckInterval);
			missingFileCheckInterval = undefined;
		}

		try {
			fileWatcher = watch(filePath, () => {
				schedulePoll();
			});
			fileWatcher.on("error", (error) => {
				reportError(
					"watch_file_failed",
					"Driver event JSONL file watcher failed; continuing with interval polling",
					error,
				);
				fileWatcher?.close();
				fileWatcher = undefined;
			});
		} catch (error) {
			reportError(
				"watch_file_failed",
				"Failed to watch driver event JSONL file; continuing with interval polling",
				error,
			);
		}

		retryInterval = setInterval(schedulePoll, JSONL_BRIDGE_POLL_INTERVAL_MS);
		schedulePoll();
	};

	const startWhenFileAppears = (): void => {
		try {
			directoryWatcher = watch(parentDir, (eventType, filename) => {
				if (eventType !== "rename") {
					return;
				}
				if (
					(filename === null || filename.toString() === targetName) &&
					existsSync(filePath)
				) {
					startTailing();
				}
			});
			directoryWatcher.on("error", (error) => {
				reportError(
					"watch_parent_failed",
					"Driver event log parent directory watcher failed; continuing with interval wait",
					error,
				);
				directoryWatcher?.close();
				directoryWatcher = undefined;
			});
		} catch (error) {
			reportError(
				"watch_parent_failed",
				"Failed to watch driver event log parent directory; continuing with interval wait",
				error,
			);
		}

		missingFileCheckInterval = setInterval(() => {
			if (existsSync(filePath)) {
				startTailing();
			}
		}, JSONL_BRIDGE_POLL_INTERVAL_MS);

		missingFileTimeout = setTimeout(() => {
			reportError(
				"event_log_not_found_timeout",
				"Driver event JSONL file did not appear within timeout",
				undefined,
				{ timeoutMs: JSONL_BRIDGE_MISSING_FILE_TIMEOUT_MS },
			);
			stop();
		}, JSONL_BRIDGE_MISSING_FILE_TIMEOUT_MS);

		if (existsSync(filePath)) {
			startTailing();
		}
	};

	if (existsSync(filePath)) {
		startTailing();
	} else {
		startWhenFileAppears();
	}

	return { stop };
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

const JSONL_BRIDGE_POLL_INTERVAL_MS = 200;
const JSONL_BRIDGE_MISSING_FILE_TIMEOUT_MS = 30_000;

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

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isTerminalEvent(event: DriverEvent): boolean {
	return event.type === "run_completed" || event.type === "run_aborted";
}
