import { describe, expect, test, vi } from "vitest";
import {
	MessageBus,
	type SpawnCompletedEvent,
	type SpawnFailedEvent,
	type SpawnRegisteredEvent,
} from "../../lib/orchestration/message-bus.ts";

function makeRegisteredEvent(spawnId = "s1"): SpawnRegisteredEvent {
	return {
		type: "spawn_registered",
		spawnId,
		sessionId: "sess-1",
		agentRole: "worker",
	};
}

function makeCompletedEvent(spawnId = "s1"): SpawnCompletedEvent {
	return {
		type: "spawn_completed",
		spawnId,
		sessionId: "sess-1",
		durationMs: 100,
	};
}

function makeFailedEvent(spawnId = "s1"): SpawnFailedEvent {
	return {
		type: "spawn_failed",
		spawnId,
		sessionId: "sess-1",
		error: "timeout",
	};
}

describe("MessageBus", () => {
	describe("publish and subscribe", () => {
		test("handler fires when a matching event is published", () => {
			const bus = new MessageBus();
			const handler = vi.fn();

			bus.subscribe("spawn_registered", handler);
			bus.publish(makeRegisteredEvent());

			expect(handler).toHaveBeenCalledOnce();
			expect(handler).toHaveBeenCalledWith(makeRegisteredEvent());
		});

		test("handler does not fire for non-matching event type", () => {
			const bus = new MessageBus();
			const handler = vi.fn();

			bus.subscribe("spawn_registered", handler);
			bus.publish(makeCompletedEvent());

			expect(handler).not.toHaveBeenCalled();
		});

		test("handler fires for every matching publish", () => {
			const bus = new MessageBus();
			const handler = vi.fn();

			bus.subscribe("spawn_registered", handler);
			bus.publish(makeRegisteredEvent("a"));
			bus.publish(makeRegisteredEvent("b"));
			bus.publish(makeRegisteredEvent("c"));

			expect(handler).toHaveBeenCalledTimes(3);
		});

		test("multiple subscribers for same type all receive the event", () => {
			const bus = new MessageBus();
			const handlerA = vi.fn();
			const handlerB = vi.fn();

			bus.subscribe("spawn_completed", handlerA);
			bus.subscribe("spawn_completed", handlerB);
			bus.publish(makeCompletedEvent());

			expect(handlerA).toHaveBeenCalledOnce();
			expect(handlerB).toHaveBeenCalledOnce();
		});

		test("subscribers for different types receive only their type", () => {
			const bus = new MessageBus();
			const registeredHandler = vi.fn();
			const failedHandler = vi.fn();

			bus.subscribe("spawn_registered", registeredHandler);
			bus.subscribe("spawn_failed", failedHandler);

			bus.publish(makeRegisteredEvent());

			expect(registeredHandler).toHaveBeenCalledOnce();
			expect(failedHandler).not.toHaveBeenCalled();
		});
	});

	describe("unsubscribe", () => {
		test("unsubscribe prevents handler from receiving further events", () => {
			const bus = new MessageBus();
			const handler = vi.fn();

			const token = bus.subscribe("spawn_registered", handler);
			bus.publish(makeRegisteredEvent());
			bus.unsubscribe(token);
			bus.publish(makeRegisteredEvent());

			expect(handler).toHaveBeenCalledOnce();
		});

		test("unsubscribing one token does not affect other subscribers", () => {
			const bus = new MessageBus();
			const handlerA = vi.fn();
			const handlerB = vi.fn();

			const tokenA = bus.subscribe("spawn_registered", handlerA);
			bus.subscribe("spawn_registered", handlerB);

			bus.unsubscribe(tokenA);
			bus.publish(makeRegisteredEvent());

			expect(handlerA).not.toHaveBeenCalled();
			expect(handlerB).toHaveBeenCalledOnce();
		});

		test("unsubscribing a token twice does not throw", () => {
			const bus = new MessageBus();
			const token = bus.subscribe("spawn_registered", vi.fn());

			bus.unsubscribe(token);
			expect(() => bus.unsubscribe(token)).not.toThrow();
		});
	});

	describe("waitFor", () => {
		test("resolves with the next matching event", async () => {
			const bus = new MessageBus();
			const event = makeRegisteredEvent();

			const promise = bus.waitFor<SpawnRegisteredEvent>("spawn_registered");
			bus.publish(event);

			await expect(promise).resolves.toEqual(event);
		});

		test("does not resolve for non-matching type", async () => {
			const bus = new MessageBus();
			const resolved = vi.fn();

			bus.waitFor<SpawnRegisteredEvent>("spawn_registered").then(resolved);
			bus.publish(makeCompletedEvent());

			// Flush microtasks — promise must still be pending
			await Promise.resolve();
			expect(resolved).not.toHaveBeenCalled();
		});

		test("predicate filters events — resolves only when predicate passes", async () => {
			const bus = new MessageBus();

			const promise = bus.waitFor<SpawnRegisteredEvent>(
				"spawn_registered",
				(e) => e.spawnId === "target",
			);

			bus.publish(makeRegisteredEvent("ignored"));
			bus.publish(makeRegisteredEvent("target"));

			const result = await promise;
			expect(result.spawnId).toBe("target");
		});

		test("waitFor unsubscribes itself after resolving", async () => {
			const bus = new MessageBus();
			const second = vi.fn();

			const promise = bus.waitFor<SpawnRegisteredEvent>("spawn_registered");
			// Subscribe a second handler to verify the internal subscription count
			bus.subscribe("spawn_registered", second);

			bus.publish(makeRegisteredEvent("first"));
			await promise;

			// Publish again — only the second handler should still fire
			bus.publish(makeRegisteredEvent("second"));
			expect(second).toHaveBeenCalledTimes(2);
		});

		test("multiple concurrent waitFor calls each resolve independently", async () => {
			const bus = new MessageBus();

			const p1 = bus.waitFor<SpawnCompletedEvent>(
				"spawn_completed",
				(e) => e.spawnId === "a",
			);
			const p2 = bus.waitFor<SpawnCompletedEvent>(
				"spawn_completed",
				(e) => e.spawnId === "b",
			);

			bus.publish({
				type: "spawn_completed",
				spawnId: "a",
				sessionId: "s1",
				durationMs: 10,
			});
			bus.publish({
				type: "spawn_completed",
				spawnId: "b",
				sessionId: "s2",
				durationMs: 20,
			});

			const [r1, r2] = await Promise.all([p1, p2]);
			expect(r1.spawnId).toBe("a");
			expect(r2.spawnId).toBe("b");
		});

		test("waitFor across different event types resolve independently", async () => {
			const bus = new MessageBus();

			const registered = bus.waitFor<SpawnRegisteredEvent>("spawn_registered");
			const failed = bus.waitFor<SpawnFailedEvent>("spawn_failed");

			bus.publish(makeRegisteredEvent());
			bus.publish(makeFailedEvent());

			const [r, f] = await Promise.all([registered, failed]);
			expect(r.type).toBe("spawn_registered");
			expect(f.type).toBe("spawn_failed");
		});
	});
});
