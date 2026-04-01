import { afterEach, describe, expect, test } from "vitest";
import { MessageBus } from "../../lib/orchestration/message-bus.ts";
import {
	DEFAULT_MAX_CONCURRENT_SPAWNS,
	DEFAULT_MAX_SPAWN_DEPTH,
} from "../../lib/orchestration/spawn-limits.ts";
import {
	getOrCreateTracker,
	removeTracker,
	SpawnTracker,
} from "../../lib/orchestration/spawn-tracker.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeTracker(
	options?: { maxConcurrentSpawns?: number; maxDepth?: number },
	sessionId = "sess-1",
): { tracker: SpawnTracker; bus: MessageBus } {
	const bus = new MessageBus();
	const tracker = new SpawnTracker(sessionId, bus, options);
	return { tracker, bus };
}

// ============================================================================
// Registration and limit enforcement
// ============================================================================

describe("SpawnTracker — registration", () => {
	test("register() records the spawn and increments activeCount", () => {
		const { tracker } = makeTracker();
		expect(tracker.activeCount()).toBe(0);

		tracker.register("s1", "worker", 1);
		expect(tracker.activeCount()).toBe(1);

		tracker.register("s2", "worker", 1);
		expect(tracker.activeCount()).toBe(2);
	});

	test("register() publishes SpawnRegisteredEvent on the bus", () => {
		const { tracker, bus } = makeTracker({}, "parent-session");
		const received: unknown[] = [];
		bus.subscribe("spawn_registered", (e) => received.push(e));

		tracker.register("s1", "worker", 1);

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			type: "spawn_registered",
			spawnId: "s1",
			sessionId: "parent-session",
			agentRole: "worker",
		});
	});

	test("register() throws when max spawn depth is exceeded", () => {
		const { tracker } = makeTracker({ maxDepth: 2 });
		expect(() => tracker.register("s1", "worker", 3)).toThrow(
			/depth.*2|depth.*exceeded/i,
		);
	});

	test("register() allows spawn at exactly maxDepth", () => {
		const { tracker } = makeTracker({ maxDepth: 2 });
		expect(() => tracker.register("s1", "worker", 2)).not.toThrow();
	});

	test("register() throws when max concurrent spawns is exceeded", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 2 });
		tracker.register("s1", "worker", 1);
		tracker.register("s2", "worker", 1);
		expect(() => tracker.register("s3", "worker", 1)).toThrow(
			/concurrent|breadth|limit/i,
		);
	});

	test("register() allows spawn after a slot is freed by complete()", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 1 });
		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "done");
		expect(() => tracker.register("s2", "worker", 1)).not.toThrow();
	});

	test("register() allows spawn after a slot is freed by fail()", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 1 });
		tracker.register("s1", "worker", 1);
		tracker.fail("s1", "crash");
		expect(() => tracker.register("s2", "worker", 1)).not.toThrow();
	});

	test("uses DEFAULT_MAX_CONCURRENT_SPAWNS when no override is given", () => {
		const { tracker } = makeTracker();
		for (let i = 0; i < DEFAULT_MAX_CONCURRENT_SPAWNS; i++) {
			tracker.register(`s${i}`, "worker", 1);
		}
		expect(() => tracker.register("overflow", "worker", 1)).toThrow();
	});

	test("uses DEFAULT_MAX_SPAWN_DEPTH when no override is given", () => {
		const { tracker } = makeTracker();
		expect(() =>
			tracker.register("s1", "worker", DEFAULT_MAX_SPAWN_DEPTH + 1),
		).toThrow();
	});
});

// ============================================================================
// canSpawn()
// ============================================================================

describe("SpawnTracker — canSpawn()", () => {
	test("returns true when slots and depth allow it", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 2, maxDepth: 2 });
		expect(tracker.canSpawn(1)).toBe(true);
		expect(tracker.canSpawn(2)).toBe(true);
	});

	test("returns false when depth exceeds maxDepth", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 5, maxDepth: 2 });
		expect(tracker.canSpawn(3)).toBe(false);
	});

	test("returns false when all concurrency slots are occupied", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 1, maxDepth: 5 });
		tracker.register("s1", "worker", 1);
		expect(tracker.canSpawn(1)).toBe(false);
	});

	test("returns true again after a slot is released", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 1, maxDepth: 5 });
		tracker.register("s1", "worker", 1);
		expect(tracker.canSpawn(1)).toBe(false);
		tracker.complete("s1", "done");
		expect(tracker.canSpawn(1)).toBe(true);
	});
});

// ============================================================================
// Completion / failure lifecycle
// ============================================================================

describe("SpawnTracker — complete() and fail()", () => {
	test("complete() decrements activeCount", () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.register("s2", "worker", 1);
		tracker.complete("s1", "ok");
		expect(tracker.activeCount()).toBe(1);
	});

	test("fail() decrements activeCount", () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.fail("s1", "oops");
		expect(tracker.activeCount()).toBe(0);
	});

	test("complete() publishes SpawnCompletedEvent on the bus", () => {
		const { tracker, bus } = makeTracker({}, "parent-session");
		const received: unknown[] = [];
		bus.subscribe("spawn_completed", (e) => received.push(e));

		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "all done");

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			type: "spawn_completed",
			spawnId: "s1",
			sessionId: "parent-session",
		});
		// durationMs should be a non-negative number
		const event = received[0] as { durationMs: number };
		expect(event.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("fail() publishes SpawnFailedEvent on the bus with error string", () => {
		const { tracker, bus } = makeTracker({}, "parent-session");
		const received: unknown[] = [];
		bus.subscribe("spawn_failed", (e) => received.push(e));

		tracker.register("s1", "worker", 1);
		tracker.fail("s1", "task timed out");

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			type: "spawn_failed",
			spawnId: "s1",
			sessionId: "parent-session",
			error: "task timed out",
		});
	});

	test("complete() throws for an unknown spawnId", () => {
		const { tracker } = makeTracker();
		expect(() => tracker.complete("unknown", "done")).toThrow(/unknown/i);
	});

	test("fail() throws for an unknown spawnId", () => {
		const { tracker } = makeTracker();
		expect(() => tracker.fail("unknown", "error")).toThrow(/unknown/i);
	});

	test("complete() throws when called twice for the same spawnId", () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "done");
		expect(() => tracker.complete("s1", "done again")).toThrow();
	});

	test("fail() is idempotent after complete()", () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "done");
		expect(() => tracker.fail("s1", "late error")).not.toThrow();
	});
});

// ============================================================================
// nextCompletion()
// ============================================================================

describe("SpawnTracker — nextCompletion()", () => {
	test("resolves with SpawnCompletedEvent when complete() is called after awaiting", async () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);

		const promise = tracker.nextCompletion();
		tracker.complete("s1", "done");

		const event = await promise;
		expect(event.type).toBe("spawn_completed");
		expect(event.spawnId).toBe("s1");
	});

	test("resolves with SpawnFailedEvent when fail() is called after awaiting", async () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);

		const promise = tracker.nextCompletion();
		tracker.fail("s1", "boom");

		const event = await promise;
		expect(event.type).toBe("spawn_failed");
		expect(event.spawnId).toBe("s1");
	});

	test("resolves immediately when an event is already buffered", async () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "done"); // event buffered before nextCompletion

		const event = await tracker.nextCompletion();
		expect(event.type).toBe("spawn_completed");
	});

	test("resolves events in arrival order across multiple nextCompletion() calls", async () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.register("s2", "worker", 1);

		const p1 = tracker.nextCompletion();
		const p2 = tracker.nextCompletion();

		tracker.complete("s1", "first");
		tracker.complete("s2", "second");

		const [e1, e2] = await Promise.all([p1, p2]);
		expect(e1.spawnId).toBe("s1");
		expect(e2.spawnId).toBe("s2");
	});

	test("does not resolve for events from other trackers on a different bus", async () => {
		const { tracker: trackerA } = makeTracker({}, "A");
		const { tracker: trackerB } = makeTracker({}, "B");

		trackerA.register("sA", "worker", 1);
		trackerB.register("sB", "worker", 1);

		const resolved = { value: false };
		trackerA.nextCompletion().then(() => {
			resolved.value = true;
		});

		trackerB.complete("sB", "done");

		// Flush microtasks — trackerA's promise must still be pending
		await Promise.resolve();
		expect(resolved.value).toBe(false);
	});
});

// ============================================================================
// deliveryMode
// ============================================================================

describe("SpawnTracker — deliveryMode", () => {
	test("defaults to 'self' when no option is provided", () => {
		const { tracker } = makeTracker();
		expect(tracker.deliveryMode).toBe("self");
	});

	test("returns 'external' when set via options", () => {
		const bus = new MessageBus();
		const tracker = new SpawnTracker("sess-dm", bus, {
			deliveryMode: "external",
		});
		expect(tracker.deliveryMode).toBe("external");
	});

	test("returns 'self' when explicitly set via options", () => {
		const bus = new MessageBus();
		const tracker = new SpawnTracker("sess-dm2", bus, {
			deliveryMode: "self",
		});
		expect(tracker.deliveryMode).toBe("self");
	});
});

// ============================================================================
// drainCompleted()
// ============================================================================

describe("SpawnTracker — drainCompleted()", () => {
	test("returns empty array when no events have arrived", () => {
		const { tracker } = makeTracker();
		expect(tracker.drainCompleted()).toEqual([]);
	});

	test("returns all buffered events and clears the buffer", () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 5 });
		tracker.register("s1", "worker", 1);
		tracker.register("s2", "worker", 1);
		tracker.register("s3", "worker", 1);
		tracker.complete("s1", "ok");
		tracker.fail("s2", "error");
		tracker.complete("s3", "ok");

		const [e1, e2, e3] = tracker.drainCompleted();
		expect([e1, e2, e3]).toHaveLength(3);
		expect(e1?.spawnId).toBe("s1");
		expect(e2?.spawnId).toBe("s2");
		expect(e3?.spawnId).toBe("s3");
	});

	test("returns empty array on second drain when no new events", () => {
		const { tracker } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.complete("s1", "ok");

		tracker.drainCompleted(); // first drain
		const second = tracker.drainCompleted();
		expect(second).toEqual([]);
	});

	test("events consumed by nextCompletion() do not appear in drainCompleted()", async () => {
		const { tracker } = makeTracker({ maxConcurrentSpawns: 3 });
		tracker.register("s1", "worker", 1);
		tracker.register("s2", "worker", 1);

		// Consume s1 via nextCompletion before it arrives
		const p = tracker.nextCompletion();
		tracker.complete("s1", "consumed");
		await p; // ensure resolution

		// s2 completes → goes to buffer
		tracker.complete("s2", "buffered");

		const [only] = tracker.drainCompleted();
		expect(only?.spawnId).toBe("s2");
	});
});

// ============================================================================
// dispose()
// ============================================================================

describe("SpawnTracker — dispose()", () => {
	test("dispose() unsubscribes from the bus so future events are not buffered", () => {
		const { tracker, bus } = makeTracker();
		tracker.register("s1", "worker", 1);
		tracker.dispose();

		// Publish directly — tracker should ignore it
		bus.publish({
			type: "spawn_completed",
			spawnId: "s1",
			sessionId: "sess-1",
			durationMs: 0,
		});

		expect(tracker.drainCompleted()).toEqual([]);
	});

	test("dispose() can be called multiple times without throwing", () => {
		const { tracker } = makeTracker();
		expect(() => {
			tracker.dispose();
			tracker.dispose();
		}).not.toThrow();
	});
});

// ============================================================================
// Module-level registry
// ============================================================================

describe("getOrCreateTracker() and removeTracker()", () => {
	const TEST_SESSION = "module-test-session";

	afterEach(() => {
		removeTracker(TEST_SESSION);
	});

	test("getOrCreateTracker() creates a new SpawnTracker on first call", () => {
		const bus = new MessageBus();
		const tracker = getOrCreateTracker(TEST_SESSION, bus);
		expect(tracker).toBeInstanceOf(SpawnTracker);
	});

	test("getOrCreateTracker() returns the same instance on subsequent calls", () => {
		const bus = new MessageBus();
		const t1 = getOrCreateTracker(TEST_SESSION, bus);
		const t2 = getOrCreateTracker(TEST_SESSION, bus);
		expect(t1).toBe(t2);
	});

	test("options are used only when creating; ignored on subsequent calls", () => {
		const bus = new MessageBus();
		const tracker = getOrCreateTracker(TEST_SESSION, bus, {
			maxConcurrentSpawns: 1,
		});
		// Second call with different options should return the same instance
		const same = getOrCreateTracker(TEST_SESSION, bus, {
			maxConcurrentSpawns: 99,
		});
		expect(same).toBe(tracker);
	});

	test("removeTracker() removes the tracker from the registry", () => {
		const bus = new MessageBus();
		const t1 = getOrCreateTracker(TEST_SESSION, bus);
		removeTracker(TEST_SESSION);
		const t2 = getOrCreateTracker(TEST_SESSION, bus);
		expect(t2).not.toBe(t1);
	});

	test("removeTracker() calls dispose() on the removed tracker", () => {
		const bus = new MessageBus();
		const tracker = getOrCreateTracker(TEST_SESSION, bus);
		tracker.register("s1", "worker", 1);

		removeTracker(TEST_SESSION);

		// After dispose, bus events should not be buffered
		bus.publish({
			type: "spawn_completed",
			spawnId: "s1",
			sessionId: TEST_SESSION,
			durationMs: 0,
		});
		expect(tracker.drainCompleted()).toEqual([]);
	});

	test("removeTracker() is a no-op for an unknown sessionId", () => {
		expect(() => removeTracker("nonexistent-session")).not.toThrow();
	});

	test("different sessionIds get different tracker instances", () => {
		const bus = new MessageBus();
		const t1 = getOrCreateTracker("session-X", bus);
		const t2 = getOrCreateTracker("session-Y", bus);
		expect(t1).not.toBe(t2);
		removeTracker("session-X");
		removeTracker("session-Y");
	});
});
