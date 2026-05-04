import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	createEventSink,
	type DriverBusEvent,
	type DriverEventPublisher,
	EventLogWriteError,
	type EventSink,
	shouldBridge,
	tailEvents,
	toBusEvent,
} from "../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";

const fsMocks = vi.hoisted(() => ({
	appendFile: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, appendFile: fsMocks.appendFile };
});

type EventOf<T extends DriverEvent["type"]> = Extract<DriverEvent, { type: T }>;

type AppendFile = (...args: unknown[]) => Promise<void>;

let tempDir: string | undefined;

const baseEvent = {
	runId: "run-1",
	parentSessionId: "parent-session-1",
	timestamp: "2026-05-04T00:00:00.000Z",
};

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "event-stream-"));

	const actualFs =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	const actualAppendFile = actualFs.appendFile as unknown as AppendFile;
	fsMocks.appendFile.mockReset();
	fsMocks.appendFile.mockImplementation(async (...args) => {
		await actualAppendFile(...args);
	});
});

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("event-stream", () => {
	test("writes JSONL before publishing bridged events", async () => {
		const order: string[] = [];
		let resolveAppend: (() => void) | undefined;
		fsMocks.appendFile.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					order.push("appendFile:start");
					resolveAppend = () => {
						order.push("appendFile:resolved");
						resolve();
					};
				}),
		);
		const activityBus: DriverEventPublisher = {
			publish: vi.fn(() => {
				order.push("publish");
			}),
		};
		const sink: EventSink = createEventSink({
			logPath: logPath(),
			runId: "run-1",
			parentSessionId: "parent-session-1",
			activityBus,
		});

		const pending = sink(taskDoneEvent());
		await Promise.resolve();

		expect(activityBus.publish).not.toHaveBeenCalled();
		expect(order).toEqual(["appendFile:start"]);

		resolveAppend?.();
		await pending;

		expect(order).toEqual([
			"appendFile:start",
			"appendFile:resolved",
			"publish",
		]);
	});

	test("throws EventLogWriteError when appendFile fails", async () => {
		fsMocks.appendFile.mockRejectedValueOnce(new Error("disk full"));
		const activityBus: DriverEventPublisher = { publish: vi.fn() };
		const sink = createEventSink({
			logPath: logPath(),
			runId: "run-1",
			parentSessionId: "parent-session-1",
			activityBus,
		});

		await expect(sink(taskDoneEvent())).rejects.toBeInstanceOf(
			EventLogWriteError,
		);
		await expect(sink(taskDoneEvent())).resolves.toBeUndefined();
		expect(activityBus.publish).toHaveBeenCalledTimes(1);
	});

	test("bridges only whitelisted events", () => {
		const bridgedEvents: DriverEvent[] = [
			driverActivityEvent(),
			preflightEvent("failed"),
			taskDoneEvent(),
			taskBlockedEvent(),
			commitMadeEvent(),
			lockWarningEvent(),
			runCompletedEvent(),
			runAbortedEvent(),
		];

		for (const event of bridgedEvents) {
			expect(shouldBridge(event)).toBe(true);
		}
		expect(shouldBridge(preflightEvent("started"))).toBe(false);
		expect(shouldBridge(taskStartedEvent())).toBe(false);
		expect(shouldBridge(spawnCompletedEvent())).toBe(false);
	});

	test("publishes driver_activity and driver_event bus types, never spawn_activity", async () => {
		const published: DriverBusEvent[] = [];
		const activityBus: DriverEventPublisher = {
			publish: (event) => {
				published.push(event);
			},
		};
		const sink = createEventSink({
			logPath: logPath(),
			runId: "run-1",
			parentSessionId: "parent-session-1",
			activityBus,
		});
		const activity = driverActivityEvent();
		const done = taskDoneEvent();
		const jsonlOnly = taskStartedEvent();

		await sink(activity);
		await sink(done);
		await sink(jsonlOnly);

		expect(published).toEqual([
			{
				type: "driver_activity",
				runId: activity.runId,
				parentSessionId: activity.parentSessionId,
				taskId: activity.taskId,
				activity: activity.activity,
			},
			{
				type: "driver_event",
				runId: done.runId,
				parentSessionId: done.parentSessionId,
				event: done,
			},
		]);
		expect(published.map((event) => event.type)).not.toContain(
			"spawn_activity",
		);
		expect(toBusEvent(activity)?.type).toBe("driver_activity");
		expect(toBusEvent(done)?.type).toBe("driver_event");
		expect(toBusEvent(jsonlOnly)).toBeUndefined();

		const lines = (await readFile(logPath(), "utf-8")).trimEnd().split("\n");
		expect(lines).toHaveLength(3);
	});

	test("tails events with cursor advancement, malformed-line skip, and EOF handling", async () => {
		const first = taskDoneEvent({ taskId: "TASK-1" });
		const second = taskBlockedEvent({ taskId: "TASK-2" });
		await writeFile(
			logPath(),
			`${JSON.stringify(first)}\nnot json\n${JSON.stringify(second)}\n`,
			"utf-8",
		);
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const all = await tailEvents(logPath(), 0);
		const afterFirstLine = await tailEvents(logPath(), 1);
		const beyondEof = await tailEvents(logPath(), 99);

		expect(all).toEqual({ events: [first, second], cursor: 3 });
		expect(afterFirstLine).toEqual({ events: [second], cursor: 3 });
		expect(beyondEof).toEqual({ events: [], cursor: 99 });
		expect(stderrSpy).toHaveBeenCalledTimes(2);
		expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("line 2");
	});

	test("has no domains imports", async () => {
		const source = await readFile("lib/driver/event-stream.ts", "utf-8");

		expect(source).not.toContain("domains/");
		expect(source).not.toContain("/domains");
	});
});

function logPath(): string {
	if (!tempDir) {
		throw new Error("tempDir not initialized");
	}
	return join(tempDir, "events.jsonl");
}

function taskDoneEvent(
	overrides: Partial<EventOf<"task_done">> = {},
): EventOf<"task_done"> {
	return { ...baseEvent, type: "task_done", taskId: "TASK-252", ...overrides };
}

function taskStartedEvent(
	overrides: Partial<EventOf<"task_started">> = {},
): EventOf<"task_started"> {
	return {
		...baseEvent,
		type: "task_started",
		taskId: "TASK-252",
		...overrides,
	};
}

function taskBlockedEvent(
	overrides: Partial<EventOf<"task_blocked">> = {},
): EventOf<"task_blocked"> {
	return {
		...baseEvent,
		type: "task_blocked",
		taskId: "TASK-252",
		reason: "blocked",
		...overrides,
	};
}

function driverActivityEvent(
	overrides: Partial<EventOf<"driver_activity">> = {},
): EventOf<"driver_activity"> {
	return {
		...baseEvent,
		type: "driver_activity",
		taskId: "TASK-252",
		activity: {
			kind: "tool_start",
			toolName: "read",
			summary: "read lib/driver/event-stream.ts",
		},
		...overrides,
	};
}

function preflightEvent(
	status: EventOf<"preflight">["status"],
	overrides: Partial<EventOf<"preflight">> = {},
): EventOf<"preflight"> {
	return {
		...baseEvent,
		type: "preflight",
		taskId: "TASK-252",
		status,
		...overrides,
	};
}

function commitMadeEvent(
	overrides: Partial<EventOf<"commit_made">> = {},
): EventOf<"commit_made"> {
	return {
		...baseEvent,
		type: "commit_made",
		taskId: "TASK-252",
		sha: "abc123",
		subject: "TASK-252: implement event stream",
		...overrides,
	};
}

function lockWarningEvent(
	overrides: Partial<EventOf<"lock_warning">> = {},
): EventOf<"lock_warning"> {
	return {
		...baseEvent,
		type: "lock_warning",
		reason: "stale lock removed",
		...overrides,
	};
}

function runCompletedEvent(
	overrides: Partial<EventOf<"run_completed">> = {},
): EventOf<"run_completed"> {
	return {
		...baseEvent,
		type: "run_completed",
		summary: { total: 1, done: 1, blocked: 0 },
		...overrides,
	};
}

function runAbortedEvent(
	overrides: Partial<EventOf<"run_aborted">> = {},
): EventOf<"run_aborted"> {
	return {
		...baseEvent,
		type: "run_aborted",
		reason: "preflight failed",
		...overrides,
	};
}

function spawnCompletedEvent(
	overrides: Partial<EventOf<"spawn_completed">> = {},
): EventOf<"spawn_completed"> {
	return {
		...baseEvent,
		type: "spawn_completed",
		taskId: "TASK-252",
		report: { outcome: "unknown", raw: "no report" },
		...overrides,
	};
}
