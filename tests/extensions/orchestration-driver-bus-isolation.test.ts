import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	DriverActivityBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import {
	activityBus,
	runSessionCleanup,
} from "../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";
import "./orchestration-mocks.ts";

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";

type EventHandler = (
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
) => Promise<void> | void;

const activeSessionIds = new Set<string>();

afterEach(() => {
	for (const sessionId of activeSessionIds) {
		runSessionCleanup(sessionId);
	}
	activeSessionIds.clear();
});

describe("driver bus isolation", () => {
	test("driver_activity does not invoke the spawn_activity subscriber", async () => {
		const { sendMessage } = await startOrchestrationSession("session-driver");

		activityBus.publish(makeDriverActivityEvent("session-driver"));

		expect(customTypes(sendMessage)).toEqual(["driver-activity"]);
		expect(sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "spawn-activity" }),
			expect.anything(),
		);
	});

	test("spawn_activity does not invoke the driver_activity subscriber", async () => {
		const { sendMessage } = await startOrchestrationSession("session-spawn");

		activityBus.publish(makeSpawnActivityEvent("session-spawn"));

		expect(customTypes(sendMessage)).toEqual(["spawn-activity"]);
		expect(sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ customType: "driver-activity" }),
			expect.anything(),
		);
	});

	test("spawn_activity, driver_activity, and driver_event subscribers coexist", async () => {
		const { sendMessage } = await startOrchestrationSession("session-both");

		activityBus.publish(makeDriverActivityEvent("session-both"));
		activityBus.publish(makeSpawnActivityEvent("session-both", "spawn-both"));
		activityBus.publish(makeDriverEvent("session-both"));

		expect(customTypes(sendMessage)).toEqual([
			"driver-activity",
			"spawn-activity",
			"driver-event",
		]);
		expect(sendMessage).toHaveBeenCalledTimes(3);
	});
});

async function startOrchestrationSession(sessionId: string): Promise<{
	sendMessage: ReturnType<typeof vi.fn>;
}> {
	const handlers = new Map<string, EventHandler[]>();
	const sendMessage = vi.fn();
	const pi = {
		registerTool: vi.fn(),
		registerMessageRenderer: vi.fn(),
		sendMessage,
		sendUserMessage: vi.fn(),
		on(event: string, handler: EventHandler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
	};

	orchestrationExtension(pi as never);

	for (const handler of handlers.get("session_start") ?? []) {
		await handler(
			{},
			{ sessionManager: { getSessionId: () => sessionId }, isIdle: () => true },
		);
	}
	activeSessionIds.add(sessionId);

	return { sendMessage };
}

function customTypes(sendMessage: ReturnType<typeof vi.fn>): string[] {
	return sendMessage.mock.calls.map((call) => {
		const message = call[0] as { customType?: string };
		return message.customType ?? "";
	});
}

function makeSpawnActivityEvent(
	parentSessionId: string,
	spawnId = "spawn-1",
): SpawnActivityEvent {
	return {
		type: "spawn_activity",
		spawnId,
		parentSessionId,
		role: "worker",
		taskId: "TASK-260",
		activity: {
			kind: "tool_start",
			toolName: "read",
			summary: "read orchestration index",
		},
	};
}

function makeDriverActivityEvent(
	parentSessionId: string,
): DriverActivityBusEvent {
	return {
		type: "driver_activity",
		runId: "run-260",
		parentSessionId,
		taskId: "TASK-260",
		activity: {
			kind: "tool_start",
			toolName: "read",
			summary: "read driver event stream",
		},
	};
}

function makeDriverEvent(parentSessionId: string): DriverEventBusEvent {
	const event: DriverEventBusEvent["event"] = {
		type: "task_done",
		runId: "run-260",
		parentSessionId,
		timestamp: "2026-05-04T00:00:00.000Z",
		taskId: "TASK-260",
	};

	return {
		type: "driver_event",
		runId: event.runId,
		parentSessionId,
		event,
	};
}
