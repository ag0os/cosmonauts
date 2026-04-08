/**
 * Module-level registry mapping active session IDs to their plan slug.
 *
 * Populated by agent-spawner when a top-level session is created with a
 * planSlug. Consumed by spawn-tool to propagate plan context to child sessions
 * so their JSONL/transcript files land under the same plan lineage directory.
 *
 * Lifecycle mirrors the parent session: registered before prompt(), removed
 * in the finally block after session.dispose().
 */

const planSlugBySessionId = new Map<string, string>();

/**
 * Associate a plan slug with a session ID.
 * Call this after session creation and before session.prompt().
 */
export function registerPlanContext(sessionId: string, planSlug: string): void {
	planSlugBySessionId.set(sessionId, planSlug);
}

/**
 * Return the plan slug for a session, or undefined if the session has no
 * associated plan context (e.g. interactive/non-plan spawns).
 */
export function getPlanSlugForSession(sessionId: string): string | undefined {
	return planSlugBySessionId.get(sessionId);
}

/**
 * Remove the plan context for a session.
 * Call this in the finally block alongside removeTracker().
 */
export function removePlanContext(sessionId: string): void {
	planSlugBySessionId.delete(sessionId);
}
