import { afterEach, describe, expect, test, vi } from "vitest";
import {
	activityBus,
	registerSessionCleanup,
	runSessionCleanup,
	unregisterSessionCleanup,
} from "../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";

function makeToolStartEvent(
	overrides?: Partial<SpawnActivityEvent>,
): SpawnActivityEvent {
	return {
		type: "spawn_activity",
		spawnId: "spawn-1",
		parentSessionId: "parent-sess",
		role: "worker",
		activity: {
			kind: "tool_start",
			toolName: "read",
			summary: "read auth.ts",
		},
		...overrides,
	};
}

describe("activityBus", () => {
	test("subscriber receives spawn_activity events", () => {
		const handler = vi.fn();
		const token = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			handler,
		);

		const event = makeToolStartEvent();
		activityBus.publish(event);

		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(event);

		activityBus.unsubscribe(token);
	});

	test("unsubscribe stops delivery", () => {
		const handler = vi.fn();
		const token = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			handler,
		);

		activityBus.publish(makeToolStartEvent());
		activityBus.unsubscribe(token);
		activityBus.publish(makeToolStartEvent());

		expect(handler).toHaveBeenCalledOnce();
	});

	test("carries taskId when present", () => {
		const handler = vi.fn();
		const token = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			handler,
		);

		const event = makeToolStartEvent({ taskId: "COSMO-003" });
		activityBus.publish(event);

		const received = handler.mock.calls[0]?.[0] as SpawnActivityEvent;
		expect(received.taskId).toBe("COSMO-003");

		activityBus.unsubscribe(token);
	});

	test("supports all activity kinds", () => {
		const handler = vi.fn();
		const token = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			handler,
		);

		const kinds: SpawnActivityEvent["activity"][] = [
			{ kind: "tool_start", toolName: "read", summary: "read file.ts" },
			{ kind: "tool_end", toolName: "read", isError: false },
			{ kind: "turn_start" },
			{ kind: "turn_end" },
			{ kind: "compaction" },
		];

		for (const activity of kinds) {
			activityBus.publish(makeToolStartEvent({ activity }));
		}

		expect(handler).toHaveBeenCalledTimes(5);

		activityBus.unsubscribe(token);
	});
});

describe("session cleanup registry", () => {
	afterEach(() => {
		// Ensure no leftover registrations leak between tests
		unregisterSessionCleanup("sess-a");
		unregisterSessionCleanup("sess-b");
	});

	test("runSessionCleanup invokes and removes the registered callback", () => {
		const cleanup = vi.fn();
		registerSessionCleanup("sess-a", cleanup);

		runSessionCleanup("sess-a");

		expect(cleanup).toHaveBeenCalledOnce();

		// Second call is a no-op — callback was removed
		cleanup.mockClear();
		runSessionCleanup("sess-a");
		expect(cleanup).not.toHaveBeenCalled();
	});

	test("runSessionCleanup is a no-op for unregistered sessions", () => {
		// Should not throw
		runSessionCleanup("nonexistent-session");
	});

	test("unregisterSessionCleanup prevents the callback from running", () => {
		const cleanup = vi.fn();
		registerSessionCleanup("sess-a", cleanup);
		unregisterSessionCleanup("sess-a");

		runSessionCleanup("sess-a");

		expect(cleanup).not.toHaveBeenCalled();
	});

	test("registering a new callback for the same session replaces the old one", () => {
		const first = vi.fn();
		const second = vi.fn();
		registerSessionCleanup("sess-a", first);
		registerSessionCleanup("sess-a", second);

		runSessionCleanup("sess-a");

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
	});

	test("cleanup callbacks are independent per session", () => {
		const cleanupA = vi.fn();
		const cleanupB = vi.fn();
		registerSessionCleanup("sess-a", cleanupA);
		registerSessionCleanup("sess-b", cleanupB);

		runSessionCleanup("sess-a");

		expect(cleanupA).toHaveBeenCalledOnce();
		expect(cleanupB).not.toHaveBeenCalled();
	});

	test("cleanup actually unsubscribes a bus listener (integration)", () => {
		const handler = vi.fn();
		const token = activityBus.subscribe<SpawnActivityEvent>(
			"spawn_activity",
			handler,
		);

		// Register cleanup that unsubscribes the bus listener — mirrors what
		// the orchestration extension does at session_start
		registerSessionCleanup("sess-a", () => {
			activityBus.unsubscribe(token);
		});

		// Event delivered before cleanup
		activityBus.publish(makeToolStartEvent());
		expect(handler).toHaveBeenCalledOnce();

		// Simulate spawn-tool disposing the child session
		runSessionCleanup("sess-a");

		// Event no longer delivered — listener was actually removed
		handler.mockClear();
		activityBus.publish(makeToolStartEvent());
		expect(handler).not.toHaveBeenCalled();
	});
});
