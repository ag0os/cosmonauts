import { existsSync, type FSWatcher, watch } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	FileRunStore,
	type OrchestrationEvent,
	type RunPolicy,
	type RunRef,
	type RuntimeDiagnostic,
} from "../durable-runtime/index.ts";
import type { BusEvent } from "../orchestration/message-bus.ts";
import { normalizeDriverEvent } from "./durable-events.ts";
import {
	createDriveStepProjector,
	type DriveStepProjector,
} from "./durable-steps.ts";
import type {
	BackendName,
	DriverEvent,
	DriverRunSpec,
	EventSink,
	SpawnActivity,
} from "./types.ts";

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
	durable?: DurableDriverEventSinkOptions;
}

export type DurableDriverEventSinkMode =
	| "legacy-loop-projector"
	| "graph-activity-only";

export interface DurableDriverEventSinkOptions {
	rootDir: string;
	scope: string;
	runId: string;
	mode?: DurableDriverEventSinkMode;
	projectRoot?: string;
	workdir?: string;
	configuredBackendName?: BackendName;
	taskIds?: readonly string[];
	eventsPath?: string;
	policy?: Partial<RunPolicy>;
	metadata?: Record<string, unknown>;
}

interface DurableDriverEventSinkState {
	options: DurableDriverEventSinkOptions;
	store: FileRunStore;
	ref: RunRef;
	ready: boolean;
	disabled: boolean;
	stepProjector?: DriveStepProjector;
}

interface TailEventsResult {
	events: DriverEvent[];
	cursor: number;
}

export interface JsonlActivityBusBridge {
	stop(): void;
}

type BridgeErrorReporter = (
	code: string,
	message: string,
	error?: unknown,
	extra?: Record<string, unknown>,
) => void;

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
	durable,
}: CreateEventSinkOptions): EventSink {
	const durableSink = durable
		? createDurableDriverEventSink(durable)
		: undefined;

	return async (event) => {
		await writeJsonLine(logPath, event);

		const busEvent = toBusEvent(event);
		if (busEvent) {
			activityBus.publish(busEvent);
		}

		await durableSink?.(event);
	};
}

export function driveDurableEventSinkOptions(
	spec: DriverRunSpec,
): DurableDriverEventSinkOptions {
	return {
		rootDir: join(spec.projectRoot, "missions", "sessions"),
		scope: spec.planSlug,
		runId: spec.runId,
		projectRoot: spec.projectRoot,
		workdir: spec.workdir,
		configuredBackendName: spec.backendName,
		taskIds: spec.taskIds,
		eventsPath: "orchestration-events.jsonl",
		policy: {
			defaultBackend: { name: spec.backendName },
			timeoutMs: spec.taskTimeoutMs,
		},
		metadata: {
			source: "drive",
			legacyEventsPath: spec.eventLogPath,
			parentSessionId: spec.parentSessionId,
			driveTaskIds: spec.taskIds,
			configuredBackendName: spec.backendName,
		},
	};
}

export function driveGraphActivityEventSinkOptions(
	spec: DriverRunSpec,
): DurableDriverEventSinkOptions {
	return {
		...driveDurableEventSinkOptions(spec),
		mode: "graph-activity-only",
	};
}

function createDurableDriverEventSink(
	options: DurableDriverEventSinkOptions,
): EventSink {
	const state: DurableDriverEventSinkState = {
		options,
		store: new FileRunStore({ rootDir: options.rootDir }),
		ref: { scope: options.scope, runId: options.runId },
		ready: false,
		disabled: false,
	};

	return async (event) => {
		await processDurableDriverEvent(state, event);
	};
}

async function processDurableDriverEvent(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
): Promise<void> {
	if (state.disabled) {
		return;
	}

	let normalized = normalizeDriverEvent(event);
	if (normalized.events.length === 0 && normalized.diagnostics.length === 0) {
		return;
	}

	if (!(await ensureDurableSinkReady(state, event))) {
		return;
	}

	if (state.options.mode === "graph-activity-only") {
		await appendDurableDiagnostics(state, event, normalized.diagnostics);
		await appendDurableEvents(
			state,
			event,
			normalized.events.filter(isGraphActivityEvent),
		);
		return;
	}

	const projected = await projectTaskDoneBeforeNormalization(state, event);
	if (event.type === "task_done") {
		normalized = normalizeDriverEvent(event, {
			latestTaskResult: (taskId) =>
				state.stepProjector?.latestTaskResult(taskId),
		});
	}

	await appendDurableDiagnostics(state, event, normalized.diagnostics);
	await appendDurableEvents(state, event, normalized.events);

	if (!projected) {
		await projectDurableStep(state, event);
	}
}

async function ensureDurableSinkReady(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
): Promise<boolean> {
	if (state.ready) {
		return true;
	}

	try {
		await createDurableRunIfMissing(state);
		state.stepProjector = createStepProjectorIfConfigured(state);
		state.ready = true;
		return true;
	} catch (error) {
		state.disabled = true;
		reportDurableDiagnostic({
			code: "drive_durable_run_setup_failed",
			message:
				"Drive normalized run record setup failed; disabling normalized event writes for this sink.",
			details: durableDiagnosticDetails(event, error),
		});
		return false;
	}
}

async function createDurableRunIfMissing(
	state: DurableDriverEventSinkState,
): Promise<void> {
	if (await state.store.loadRun(state.ref)) {
		return;
	}

	await state.store.createRun({
		...state.ref,
		status: "pending",
		eventsPath: state.options.eventsPath,
		policy: state.options.policy,
		metadata: state.options.metadata,
	});
}

function createStepProjectorIfConfigured(
	state: DurableDriverEventSinkState,
): DriveStepProjector | undefined {
	const { options } = state;
	if (options.mode === "graph-activity-only") {
		return undefined;
	}
	if (
		!options.projectRoot ||
		!options.workdir ||
		!options.configuredBackendName ||
		!options.taskIds
	) {
		return undefined;
	}

	return createDriveStepProjector({
		store: state.store,
		ref: state.ref,
		projectRoot: options.projectRoot,
		workdir: options.workdir,
		configuredBackendName: options.configuredBackendName,
		taskIds: options.taskIds,
	});
}

function isGraphActivityEvent(event: OrchestrationEvent): boolean {
	return (
		event.type === "step_tool_activity" ||
		event.type === "step_output" ||
		event.type === "artifact_written"
	);
}

async function projectTaskDoneBeforeNormalization(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
): Promise<boolean> {
	if (event.type !== "task_done") {
		return false;
	}

	await projectDurableStep(state, event);
	return true;
}

async function projectDurableStep(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
): Promise<void> {
	try {
		await state.stepProjector?.project(event);
	} catch (error) {
		reportDurableDiagnostic({
			code: "drive_durable_step_write_failed",
			message:
				"Drive durable step projection failed; legacy driver event write and normalized event writes remain authoritative.",
			details: durableDiagnosticDetails(event, error),
		});
	}
}

async function appendDurableDiagnostics(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
	diagnostics: readonly RuntimeDiagnostic[],
): Promise<void> {
	for (const diagnostic of diagnostics) {
		try {
			await state.store.appendDiagnostic(state.ref, diagnostic);
		} catch (error) {
			reportDurableDiagnostic({
				code: "drive_durable_diagnostic_append_failed",
				message:
					"Drive normalized diagnostic append failed; legacy driver event write remains authoritative.",
				details: durableDiagnosticDetails(event, error),
			});
		}
	}
}

async function appendDurableEvents(
	state: DurableDriverEventSinkState,
	event: DriverEvent,
	events: readonly OrchestrationEvent[],
): Promise<void> {
	for (const normalizedEvent of events) {
		try {
			await state.store.appendEvent(state.ref, normalizedEvent);
		} catch (error) {
			reportDurableDiagnostic({
				code: "drive_durable_event_append_failed",
				message:
					"Drive normalized event append failed; legacy driver event write remains authoritative.",
				details: durableDiagnosticDetails(event, error),
			});
		}
	}
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

	const processContent = (content: string): void => {
		if (cursor > content.length) {
			cursor = 0;
		}

		const pending = content.slice(cursor);
		if (pending.length === 0) {
			return;
		}

		const parts = pending.split("\n");
		parts.pop();

		for (const rawLine of parts) {
			const lineStart = cursor;
			const event = parseDriverEventLine(rawLine, lineStart, reportError);
			if (!event) {
				return;
			}

			cursor += rawLine.length + 1;
			if (event.runId !== runId || event.parentSessionId !== parentSessionId) {
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
	};

	const poll = async (): Promise<void> => {
		if (stopped) {
			return;
		}

		polling = true;
		try {
			processContent(await readFile(filePath, "utf-8"));
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
	"finalize",
	"task_finalization_failed",
	"lock_warning",
	"run_completed",
	"run_aborted",
	"run_finalization_failed",
	"plan_completion_candidate",
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

function parseDriverEventLine(
	rawLine: string,
	cursor: number,
	reportError: BridgeErrorReporter,
): DriverEvent | undefined {
	try {
		return JSON.parse(rawLine.replace(/\r$/, "")) as DriverEvent;
	} catch (error) {
		reportError(
			"parse_error",
			"Failed to parse driver event JSONL line; retrying without advancing cursor",
			error,
			{ cursor },
		);
		return undefined;
	}
}

function splitJsonLines(content: string): string[] {
	const lines = content.split("\n");
	if (content.endsWith("\n")) {
		lines.pop();
	}
	return lines.map((line) => line.replace(/\r$/, ""));
}

function reportDurableDiagnostic(diagnostic: RuntimeDiagnostic): void {
	console.error(
		JSON.stringify({
			type: "drive_durable_event_diagnostic",
			...diagnostic,
		}),
	);
}

function durableDiagnosticDetails(
	event: DriverEvent,
	error: unknown,
): Record<string, unknown> {
	return {
		legacyEventType: event.type,
		runId: event.runId,
		error: formatJsonError(error),
	};
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
	return (
		event.type === "run_completed" ||
		event.type === "run_aborted" ||
		event.type === "run_finalization_failed"
	);
}
