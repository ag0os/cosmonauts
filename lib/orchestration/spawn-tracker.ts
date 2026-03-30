/**
 * Per-session spawn registry that tracks active children, enforces
 * breadth/depth limits, and bridges between the spawner (which controls
 * session lifecycle) and the spawn tool (which registers children from
 * tool calls).
 */

import {
	MessageBus,
	type SpawnCompletedEvent,
	type SpawnFailedEvent,
	type SpawnRegisteredEvent,
	type SubscriptionToken,
} from "./message-bus.ts";
import { Semaphore } from "./semaphore.ts";
import {
	resolveMaxConcurrentSpawns,
	resolveMaxSpawnDepth,
} from "./spawn-limits.ts";

// ============================================================================
// Types
// ============================================================================

export interface SpawnTrackerOptions {
	maxConcurrentSpawns?: number;
	maxDepth?: number;
}

interface SpawnRecord {
	role: string;
	depth: number;
	status: "running" | "completed" | "failed";
	startedAt: number;
	summary?: string;
}

// ============================================================================
// SpawnTracker
// ============================================================================

/**
 * Per-session registry for child spawns.
 *
 * Tracks running children, enforces concurrency/depth limits via a semaphore,
 * and surfaces completion events through a buffered async queue.
 */
export class SpawnTracker {
	private readonly sessionId: string;
	private readonly bus: MessageBus;
	private readonly semaphore: Semaphore;
	private readonly maxDepth: number;
	private readonly maxConcurrent: number;
	private readonly spawns = new Map<string, SpawnRecord>();
	private _activeCount = 0;

	/** Events that have arrived but not yet consumed by nextCompletion(). */
	private readonly buffer: Array<SpawnCompletedEvent | SpawnFailedEvent> = [];
	/** Pending nextCompletion() resolvers waiting for the next event. */
	private readonly waiters: Array<
		(event: SpawnCompletedEvent | SpawnFailedEvent) => void
	> = [];
	private readonly subscriptionTokens: SubscriptionToken[] = [];

	constructor(
		sessionId: string,
		bus: MessageBus,
		options?: SpawnTrackerOptions,
	) {
		this.sessionId = sessionId;
		this.bus = bus;
		this.maxConcurrent = resolveMaxConcurrentSpawns(
			options?.maxConcurrentSpawns,
		);
		this.maxDepth = resolveMaxSpawnDepth(options?.maxDepth);
		this.semaphore = new Semaphore(this.maxConcurrent);

		this.subscriptionTokens.push(
			bus.subscribe<SpawnCompletedEvent>("spawn_completed", (event) => {
				if (this.spawns.has(event.spawnId)) {
					this.enqueue(event);
				}
			}),
			bus.subscribe<SpawnFailedEvent>("spawn_failed", (event) => {
				if (this.spawns.has(event.spawnId)) {
					this.enqueue(event);
				}
			}),
		);
	}

	// -------------------------------------------------------------------------
	// Private
	// -------------------------------------------------------------------------

	private enqueue(event: SpawnCompletedEvent | SpawnFailedEvent): void {
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter(event);
		} else {
			this.buffer.push(event);
		}
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Records a new child spawn, acquires a semaphore slot, and publishes
	 * SpawnRegisteredEvent. Throws synchronously if the depth or breadth
	 * limit would be exceeded.
	 */
	register(spawnId: string, role: string, depth: number): void {
		if (depth > this.maxDepth) {
			throw new Error(
				`Max spawn depth (${this.maxDepth}) exceeded: requested depth ${depth}`,
			);
		}
		if (this.semaphore.available === 0) {
			throw new Error(`Max concurrent spawns (${this.maxConcurrent}) exceeded`);
		}
		// acquire() resolves synchronously when available > 0
		void this.semaphore.acquire();
		this._activeCount++;
		this.spawns.set(spawnId, {
			role,
			depth,
			status: "running",
			startedAt: Date.now(),
		});
		this.bus.publish<SpawnRegisteredEvent>({
			type: "spawn_registered",
			spawnId,
			sessionId: this.sessionId,
			agentRole: role,
		});
	}

	/**
	 * Marks a spawn complete, releases the semaphore slot, and publishes
	 * SpawnCompletedEvent on the bus.
	 */
	complete(spawnId: string, summary: string): void {
		const spawn = this.spawns.get(spawnId);
		if (!spawn) {
			throw new Error(`Unknown spawnId: ${spawnId}`);
		}
		if (spawn.status !== "running") {
			throw new Error(
				`Spawn ${spawnId} is not running (status: ${spawn.status})`,
			);
		}
		spawn.status = "completed";
		spawn.summary = summary;
		this._activeCount--;
		const durationMs = Date.now() - spawn.startedAt;
		this.semaphore.release();
		this.bus.publish<SpawnCompletedEvent>({
			type: "spawn_completed",
			spawnId,
			sessionId: this.sessionId,
			durationMs,
		});
	}

	/**
	 * Marks a spawn failed, releases the semaphore slot, and publishes
	 * SpawnFailedEvent on the bus.
	 */
	fail(spawnId: string, error: string): void {
		const spawn = this.spawns.get(spawnId);
		if (!spawn) {
			throw new Error(`Unknown spawnId: ${spawnId}`);
		}
		// Idempotent: if already terminated (by timeout or prior error), skip.
		if (spawn.status !== "running") {
			return;
		}
		spawn.status = "failed";
		this._activeCount--;
		this.semaphore.release();
		this.bus.publish<SpawnFailedEvent>({
			type: "spawn_failed",
			spawnId,
			sessionId: this.sessionId,
			error,
		});
	}

	/** Number of currently running children. */
	activeCount(): number {
		return this._activeCount;
	}

	/** Returns the role for a given spawnId, or undefined if unknown. */
	spawnRole(spawnId: string): string | undefined {
		return this.spawns.get(spawnId)?.role;
	}

	/** Returns all currently-running spawns as { spawnId, role } pairs. */
	runningSpawns(): Array<{ spawnId: string; role: string }> {
		const result: Array<{ spawnId: string; role: string }> = [];
		for (const [spawnId, record] of this.spawns.entries()) {
			if (record.status === "running") {
				result.push({ spawnId, role: record.role });
			}
		}
		return result;
	}

	/** Returns true if both the depth and breadth limits allow another spawn. */
	canSpawn(depth: number): boolean {
		return depth <= this.maxDepth && this.semaphore.available > 0;
	}

	/**
	 * Returns a Promise that resolves with the next SpawnCompletedEvent or
	 * SpawnFailedEvent in arrival order. If an event is already buffered,
	 * the Promise resolves immediately with the oldest buffered event.
	 */
	nextCompletion(): Promise<SpawnCompletedEvent | SpawnFailedEvent> {
		const buffered = this.buffer.shift();
		if (buffered !== undefined) {
			return Promise.resolve(buffered);
		}
		return new Promise<SpawnCompletedEvent | SpawnFailedEvent>((resolve) => {
			this.waiters.push(resolve);
		});
	}

	/**
	 * Returns all buffered completion/failure events that have arrived since
	 * the last drain, without waiting. Clears the internal buffer.
	 */
	drainCompleted(): Array<SpawnCompletedEvent | SpawnFailedEvent> {
		const drained = [...this.buffer];
		this.buffer.length = 0;
		return drained;
	}

	/** Removes all bus subscriptions. */
	dispose(): void {
		for (const token of this.subscriptionTokens) {
			this.bus.unsubscribe(token);
		}
		this.subscriptionTokens.length = 0;
	}
}

// ============================================================================
// Module-level registry (spawner ↔ spawn-tool bridge)
// ============================================================================

const trackerRegistry = new Map<string, SpawnTracker>();

/**
 * Returns the existing SpawnTracker for a session, or creates and registers
 * a new one. The bus and options are only used when creating a new tracker;
 * subsequent calls with the same sessionId return the existing instance.
 *
 * When bus is omitted, a new MessageBus is created for the tracker. This
 * keeps bus lifecycle tied to the tracker — no separate cleanup needed.
 */
export function getOrCreateTracker(
	sessionId: string,
	bus?: MessageBus,
	options?: SpawnTrackerOptions,
): SpawnTracker {
	let tracker = trackerRegistry.get(sessionId);
	if (!tracker) {
		const resolvedBus = bus ?? new MessageBus();
		tracker = new SpawnTracker(sessionId, resolvedBus, options);
		trackerRegistry.set(sessionId, tracker);
	}
	return tracker;
}

/**
 * Disposes and removes the SpawnTracker for a session. No-op if the session
 * has no registered tracker.
 */
export function removeTracker(sessionId: string): void {
	const tracker = trackerRegistry.get(sessionId);
	if (tracker) {
		tracker.dispose();
		trackerRegistry.delete(sessionId);
	}
}
