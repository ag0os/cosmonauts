/**
 * Tests for activity bus scoping and cleanup in the orchestration extension.
 *
 * Verifies:
 * - P1: Activity events are scoped to the owning parent session
 * - P2: Bus subscriptions are cleaned up when sessions are disposed
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
	activityBus,
	runSessionCleanup,
} from "../../lib/orchestration/activity-bus.ts";
import type {
	SpawnActivityEvent,
	SubscriptionToken,
} from "../../lib/orchestration/message-bus.ts";
import "./orchestration-mocks.ts";

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";

// ============================================================================
// Mock Pi with lifecycle event support
// ============================================================================

type EventHandler = (
	event: Record<string, unknown>,
	ctx: Record<string, unknown>,
) => Promise<void>;

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
		async fireSessionStart(isIdle = () => true) {
			for (const h of handlers.get("session_start") ?? []) {
				await h(
					{},
					{ sessionManager: { getSessionId: () => sessionId }, isIdle },
				);
			}
		},
		async fireSessionShutdown() {
			for (const h of handlers.get("session_shutdown") ?? []) {
				await h({}, {});
			}
		},
	};
}

function makeEvent(parentSessionId: string): SpawnActivityEvent {
	return {
		type: "spawn_activity",
		spawnId: `spawn-${Math.random()}`,
		parentSessionId,
		role: "worker",
		activity: { kind: "tool_start", toolName: "read", summary: "read file.ts" },
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("orchestration extension — activity bus scoping", () => {
	// Track tokens so we can clean up leaked subscriptions in afterEach
	const activeTokens: SubscriptionToken[] = [];

	afterEach(() => {
		for (const token of activeTokens) {
			activityBus.unsubscribe(token);
		}
		activeTokens.length = 0;
		vi.useRealTimers();
	});

	test("only forwards events whose parentSessionId matches the owning session", async () => {
		const { pi, sendMessage, fireSessionStart } =
			createLifecyclePi("session-A");
		orchestrationExtension(pi as never);
		await fireSessionStart();

		// Event from session-A's own spawn — should be forwarded
		activityBus.publish(makeEvent("session-A"));
		expect(sendMessage).toHaveBeenCalledTimes(1);

		// Event from a different session — should be filtered out
		sendMessage.mockClear();
		activityBus.publish(makeEvent("session-B"));
		expect(sendMessage).not.toHaveBeenCalled();
	});

	test("buffers activity while parent session is busy and flushes when idle", async () => {
		vi.useFakeTimers();
		let isIdle = false;
		const { pi, sendMessage, fireSessionStart } =
			createLifecyclePi("session-buffer");
		orchestrationExtension(pi as never);
		await fireSessionStart(() => isIdle);

		activityBus.publish(makeEvent("session-buffer"));
		expect(sendMessage).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(sendMessage).not.toHaveBeenCalled();

		isIdle = true;
		await vi.advanceTimersByTimeAsync(100);
		expect(sendMessage).toHaveBeenCalledTimes(1);

		runSessionCleanup("session-buffer");
	});

	test("session_shutdown removes the bus subscription", async () => {
		const { pi, sendMessage, fireSessionStart, fireSessionShutdown } =
			createLifecyclePi("session-C");
		orchestrationExtension(pi as never);
		await fireSessionStart();

		// Verify subscription is active
		activityBus.publish(makeEvent("session-C"));
		expect(sendMessage).toHaveBeenCalledTimes(1);

		await fireSessionShutdown();

		// After shutdown, events should not be forwarded
		sendMessage.mockClear();
		activityBus.publish(makeEvent("session-C"));
		expect(sendMessage).not.toHaveBeenCalled();
	});

	test("runSessionCleanup removes the bus subscription (dispose path)", async () => {
		const { pi, sendMessage, fireSessionStart } =
			createLifecyclePi("session-D");
		orchestrationExtension(pi as never);
		await fireSessionStart();

		// Verify subscription is active
		activityBus.publish(makeEvent("session-D"));
		expect(sendMessage).toHaveBeenCalledTimes(1);

		// Simulate what spawn-tool does in its finally block: runSessionCleanup
		runSessionCleanup("session-D");

		// After cleanup, events should not be forwarded
		sendMessage.mockClear();
		activityBus.publish(makeEvent("session-D"));
		expect(sendMessage).not.toHaveBeenCalled();
	});

	test("stale subscriptions do not accumulate across multiple disposed sessions", async () => {
		// Spy on the bus to count active handlers
		const spy = vi.fn();
		const spyToken = activityBus.subscribe("spawn_activity", spy);
		activeTokens.push(spyToken);

		// Create and dispose 5 ephemeral sessions
		for (let i = 0; i < 5; i++) {
			const sessionId = `ephemeral-${i}`;
			const { pi, fireSessionStart } = createLifecyclePi(sessionId);
			orchestrationExtension(pi as never);
			await fireSessionStart();
			runSessionCleanup(sessionId);
		}

		// Publish one event — only the spy handler should fire, not any of the
		// 5 cleaned-up session handlers
		spy.mockClear();
		activityBus.publish(makeEvent("unrelated"));
		expect(spy).toHaveBeenCalledOnce();
	});

	test("new session_start tears down prior subscription for the same extension instance", async () => {
		const { pi, sendMessage } = createLifecyclePi("session-E");
		// Override the on() to allow changing session ID between starts
		let currentSessionId = "session-E";
		(pi as { on: (e: string, h: EventHandler) => void }).on = (() => {
			const handlers = new Map<string, EventHandler[]>();
			return (event: string, handler: EventHandler) => {
				const list = handlers.get(event) ?? [];
				list.push(handler);
				handlers.set(event, list);
			};
		})();

		// Re-create with mutable session ID
		const handlers: EventHandler[] = [];
		(pi as { on: (e: string, h: EventHandler) => void }).on = (
			_event: string,
			handler: EventHandler,
		) => {
			handlers.push(handler);
		};
		orchestrationExtension(pi as never);

		// Find the session_start handler (registered second, after session_start and before session_shutdown)
		// Handlers are: session_start, session_shutdown (in that order based on extension code)
		const sessionStartHandler = handlers[0];

		// First session_start
		await sessionStartHandler?.(
			{},
			{
				sessionManager: { getSessionId: () => currentSessionId },
				isIdle: () => true,
			},
		);

		activityBus.publish(makeEvent("session-E"));
		expect(sendMessage).toHaveBeenCalledTimes(1);

		// Switch session ID and fire session_start again
		sendMessage.mockClear();
		currentSessionId = "session-F";
		await sessionStartHandler?.(
			{},
			{
				sessionManager: { getSessionId: () => currentSessionId },
				isIdle: () => true,
			},
		);

		// Old session-E events no longer forwarded
		activityBus.publish(makeEvent("session-E"));
		expect(sendMessage).not.toHaveBeenCalled();

		// New session-F events are forwarded
		activityBus.publish(makeEvent("session-F"));
		expect(sendMessage).toHaveBeenCalledTimes(1);

		// Clean up
		runSessionCleanup("session-F");
	});
});
