/**
 * In-process typed message bus for orchestration events.
 *
 * Provides publish/subscribe semantics with Promise-based waitFor support.
 * Designed for extensibility — new event types can be added without changing
 * the bus interface.
 */

// ============================================================================
// Event Types
// ============================================================================

/** All bus events carry a discriminator type field. */
export interface BusEvent {
	type: string;
}

/** Published when a sub-agent spawn is registered and about to begin. */
export interface SpawnRegisteredEvent extends BusEvent {
	type: "spawn_registered";
	spawnId: string;
	sessionId: string;
	agentRole: string;
}

/** Published when a sub-agent spawn completes successfully. */
export interface SpawnCompletedEvent extends BusEvent {
	type: "spawn_completed";
	spawnId: string;
	sessionId: string;
	durationMs: number;
	summary?: string;
	fullText?: string;
}

/** Published when a sub-agent spawn fails. */
export interface SpawnFailedEvent extends BusEvent {
	type: "spawn_failed";
	spawnId: string;
	sessionId: string;
	error: string;
}

/** Activity update from a running sub-agent spawn (tool calls, turns, compaction). */
export interface SpawnActivityEvent extends BusEvent {
	type: "spawn_activity";
	spawnId: string;
	parentSessionId: string;
	role: string;
	taskId?: string;
	activity:
		| { kind: "tool_start"; toolName: string; summary: string }
		| { kind: "tool_end"; toolName: string; isError: boolean }
		| { kind: "turn_start" }
		| { kind: "turn_end" }
		| { kind: "compaction" };
}

/** Union of all known bus event types. */
export type KnownBusEvent =
	| SpawnRegisteredEvent
	| SpawnCompletedEvent
	| SpawnFailedEvent
	| SpawnActivityEvent;

// ============================================================================
// Subscription Token
// ============================================================================

/** Opaque token returned by subscribe() and passed to unsubscribe(). */
export type SubscriptionToken = symbol;

// ============================================================================
// MessageBus
// ============================================================================

interface HandlerEntry {
	type: string;
	handler: (event: BusEvent) => void;
}

/**
 * In-process typed message bus.
 *
 * Handlers registered for a given type string receive all published events
 * whose `type` field matches. Tokens returned by subscribe() can be passed to
 * unsubscribe() to stop receiving events.
 */
export class MessageBus {
	private readonly handlers = new Map<SubscriptionToken, HandlerEntry>();

	/** Publish an event to all matching subscribers. */
	publish<T extends BusEvent>(event: T): void {
		for (const entry of this.handlers.values()) {
			if (entry.type === event.type) {
				entry.handler(event);
			}
		}
	}

	/**
	 * Subscribe to events of a given type.
	 *
	 * Returns a SubscriptionToken that can be passed to unsubscribe() to stop
	 * receiving events.
	 */
	subscribe<T extends BusEvent>(
		type: string,
		handler: (event: T) => void,
	): SubscriptionToken {
		const token = Symbol();
		this.handlers.set(token, {
			type,
			handler: handler as (event: BusEvent) => void,
		});
		return token;
	}

	/** Remove a subscription so its handler receives no further events. */
	unsubscribe(token: SubscriptionToken): void {
		this.handlers.delete(token);
	}

	/**
	 * Returns a Promise that resolves with the next published event matching
	 * the given type and optional predicate.
	 */
	waitFor<T extends BusEvent>(
		type: string,
		predicate?: (event: T) => boolean,
	): Promise<T> {
		return new Promise<T>((resolve) => {
			const token = this.subscribe<T>(type, (event) => {
				if (!predicate || predicate(event)) {
					this.unsubscribe(token);
					resolve(event);
				}
			});
		});
	}
}
