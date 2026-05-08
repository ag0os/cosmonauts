import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import { createEventSink } from "../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import {
	activityBus,
	runSessionCleanup,
} from "../../lib/orchestration/activity-bus.ts";
import "./orchestration-mocks.ts";

type MockBusEvent = { type: string };
type MockBusHandler = (event: MockBusEvent) => void;
type EventHandler = (
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
) => Promise<void>;
type DriverEventOf<T extends DriverEvent["type"]> = Extract<
	DriverEvent,
	{ type: T }
>;

const activityBusMocks = vi.hoisted(() => {
	const handlers = new Map<symbol, { type: string; handler: MockBusHandler }>();
	const sessionCleanups = new Map<string, () => void>();

	const activityBus = {
		publish: vi.fn((event: MockBusEvent) => {
			for (const entry of handlers.values()) {
				if (entry.type === event.type) {
					entry.handler(event);
				}
			}
		}),
		subscribe: vi.fn((type: string, handler: MockBusHandler) => {
			const token = Symbol(type);
			handlers.set(token, { type, handler });
			return token;
		}),
		unsubscribe: vi.fn((token: symbol) => {
			handlers.delete(token);
		}),
	};
	const registerSessionCleanup = vi.fn(
		(sessionId: string, cleanup: () => void) => {
			sessionCleanups.set(sessionId, cleanup);
		},
	);
	const unregisterSessionCleanup = vi.fn((sessionId: string) => {
		sessionCleanups.delete(sessionId);
	});
	const runSessionCleanup = vi.fn((sessionId: string) => {
		const cleanup = sessionCleanups.get(sessionId);
		if (!cleanup) return;
		sessionCleanups.delete(sessionId);
		cleanup();
	});

	return {
		activityBus,
		registerSessionCleanup,
		unregisterSessionCleanup,
		runSessionCleanup,
		reset() {
			handlers.clear();
			sessionCleanups.clear();
			activityBus.publish.mockClear();
			activityBus.subscribe.mockClear();
			activityBus.unsubscribe.mockClear();
			registerSessionCleanup.mockClear();
			unregisterSessionCleanup.mockClear();
			runSessionCleanup.mockClear();
		},
	};
});

vi.mock("../../lib/orchestration/activity-bus.ts", () => ({
	activityBus: activityBusMocks.activityBus,
	registerSessionCleanup: activityBusMocks.registerSessionCleanup,
	unregisterSessionCleanup: activityBusMocks.unregisterSessionCleanup,
	runSessionCleanup: activityBusMocks.runSessionCleanup,
}));

const SESSION_A = "driver-session-A";
const SESSION_B = "driver-session-B";
const RUN_A = "run-session-A";
const RUN_B = "run-session-B";
const TASK_ID = "TASK-261";
const timestamp = "2026-05-04T00:00:00.000Z";

let tempDir: string | undefined;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "driver-session-scoping-"));
});

afterEach(async () => {
	runSessionCleanup(SESSION_A);
	runSessionCleanup(SESSION_B);
	activityBusMocks.reset();
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("driver session scoping", () => {
	test("forwards driver run events only to their owning Pi session", async () => {
		const sessionA = createLifecyclePi(SESSION_A);
		const sessionB = createLifecyclePi(SESSION_B);
		orchestrationExtension(sessionA.pi as never);
		orchestrationExtension(sessionB.pi as never);
		await Promise.all([
			sessionA.fireSessionStart(),
			sessionB.fireSessionStart(),
		]);

		await emitDriverActivity(RUN_B, SESSION_B, "TASK-261-B");
		expect(sessionB.sendMessage).toHaveBeenCalledOnce();
		expect(sessionA.sendMessage).not.toHaveBeenCalled();
		sessionA.sendMessage.mockClear();
		sessionB.sendMessage.mockClear();

		await emitDriverActivity(RUN_A, SESSION_A, TASK_ID);
		await emitTaskDone(RUN_A, SESSION_A, TASK_ID);

		expect(sessionA.sendMessage).toHaveBeenCalledTimes(2);
		expect(sessionA.sendMessage).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				customType: "driver-activity",
				details: expect.objectContaining({
					runId: RUN_A,
					parentSessionId: SESSION_A,
					taskId: TASK_ID,
				}),
			}),
		);
		expect(sessionA.sendMessage).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				customType: "driver-event",
				details: expect.objectContaining({
					runId: RUN_A,
					parentSessionId: SESSION_A,
					event: expect.objectContaining({
						type: "task_done",
						taskId: TASK_ID,
					}),
				}),
			}),
		);
		expect(sessionB.sendMessage).not.toHaveBeenCalled();
	});
});

function createLifecyclePi(sessionId: string) {
	const handlers = new Map<string, EventHandler[]>();
	const sendMessage = vi.fn();

	return {
		pi: {
			registerTool: vi.fn(),
			registerMessageRenderer: vi.fn(),
			sendMessage,
			sendUserMessage: vi.fn(),
			on(event: string, handler: EventHandler) {
				const list = handlers.get(event) ?? [];
				list.push(handler);
				handlers.set(event, list);
			},
		},
		sendMessage,
		async fireSessionStart() {
			for (const handler of handlers.get("session_start") ?? []) {
				await handler(
					{},
					{
						sessionManager: { getSessionId: () => sessionId },
						isIdle: () => true,
					},
				);
			}
		},
	};
}

async function emitDriverActivity(
	runId: string,
	parentSessionId: string,
	taskId: string,
): Promise<void> {
	const sink = createEventSink({
		logPath: eventLogPath(runId),
		runId,
		parentSessionId,
		activityBus,
	});
	await sink(driverActivityEvent({ runId, parentSessionId, taskId }));
}

async function emitTaskDone(
	runId: string,
	parentSessionId: string,
	taskId: string,
): Promise<void> {
	const sink = createEventSink({
		logPath: eventLogPath(runId),
		runId,
		parentSessionId,
		activityBus,
	});
	await sink(taskDoneEvent({ runId, parentSessionId, taskId }));
}

function eventLogPath(runId: string): string {
	if (!tempDir) {
		throw new Error("tempDir not initialized");
	}
	return join(tempDir, `${runId}.jsonl`);
}

function driverActivityEvent(
	overrides: Partial<DriverEventOf<"driver_activity">> = {},
): DriverEventOf<"driver_activity"> {
	return {
		type: "driver_activity",
		runId: RUN_A,
		parentSessionId: SESSION_A,
		timestamp,
		taskId: TASK_ID,
		activity: {
			kind: "tool_start",
			toolName: "read",
			summary: "read driver session scoping fixture",
		},
		...overrides,
	};
}

function taskDoneEvent(
	overrides: Partial<DriverEventOf<"task_done">> = {},
): DriverEventOf<"task_done"> {
	return {
		type: "task_done",
		runId: RUN_A,
		parentSessionId: SESSION_A,
		timestamp,
		taskId: TASK_ID,
		...overrides,
	};
}
