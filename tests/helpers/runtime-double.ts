import type { CosmonautsRuntime } from "../../lib/runtime.ts";

/**
 * An opaque runtime for suites that mock what a runtime would supply. Spawns and
 * chains now require one, and a spawner accepts only its own runtime object, so
 * share one double between a spawner and its spawns.
 */
export function runtimeDouble(
	fields: Partial<CosmonautsRuntime> = {},
): CosmonautsRuntime {
	return { ...fields } as CosmonautsRuntime;
}
