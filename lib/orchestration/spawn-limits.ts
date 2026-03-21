/**
 * Spawn limit constants and resolution functions.
 * Controls how many child sessions a parent may run concurrently
 * and how deeply agents may nest.
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum simultaneous child sessions per parent agent. */
export const DEFAULT_MAX_CONCURRENT_SPAWNS = 5;

/**
 * Maximum spawn nesting depth.
 * coordinator → worker = depth 1; worker spawning further = depth 2,
 * which hits this default limit.
 */
export const DEFAULT_MAX_SPAWN_DEPTH = 2;

// ============================================================================
// Helpers
// ============================================================================

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Return the override if it is a positive integer, otherwise the default.
 */
export function resolveMaxConcurrentSpawns(override?: number): number {
	return isPositiveInteger(override) ? override : DEFAULT_MAX_CONCURRENT_SPAWNS;
}

/**
 * Return the override if it is a positive integer, otherwise the default.
 */
export function resolveMaxSpawnDepth(override?: number): number {
	return isPositiveInteger(override) ? override : DEFAULT_MAX_SPAWN_DEPTH;
}
