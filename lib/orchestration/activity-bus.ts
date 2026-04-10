/** Process-global activity bus for broadcasting spawn activity events. */
import { MessageBus } from "./message-bus.ts";

export const activityBus = new MessageBus();

/**
 * Registry of per-session cleanup callbacks for activity bus subscriptions.
 *
 * Orchestration extensions register their teardown here at session_start.
 * Spawn-tool calls `runSessionCleanup()` in its finally block when the
 * child session is disposed, ensuring the parent's dead listener is removed
 * from the process-global bus rather than accumulating.
 */
const sessionCleanup = new Map<string, () => void>();

/** Register a cleanup callback to be run when the given session is disposed. */
export function registerSessionCleanup(
	sessionId: string,
	cleanup: () => void,
): void {
	sessionCleanup.set(sessionId, cleanup);
}

/** Remove a previously registered cleanup without running it. */
export function unregisterSessionCleanup(sessionId: string): void {
	sessionCleanup.delete(sessionId);
}

/**
 * Run and remove the cleanup callback for the given session.
 * Called from spawn-tool when a child session is disposed.
 * No-op if no cleanup was registered for this session ID.
 */
export function runSessionCleanup(sessionId: string): void {
	const cleanup = sessionCleanup.get(sessionId);
	if (cleanup) {
		sessionCleanup.delete(sessionId);
		cleanup();
	}
}
