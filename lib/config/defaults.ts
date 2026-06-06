import type { ProjectConfig } from "./types.ts";

/**
 * Default project config used by `cosmonauts init` (as the template injected
 * into the bootstrap prompt) and written by `cosmonauts scaffold missions`.
 *
 * Intentionally minimal — both `skills` and `chains` are omitted on purpose:
 *
 * - `skills` absent → session setup falls back to each agent's declared skills
 *   rather than intersecting with a project filter. An explicit list is an
 *   opt-in way to restrict further, not a necessary base case.
 * - `chains` absent → the active domain's named chains are used as-is. The
 *   named-chain loader treats domain chains as the baseline and only lets
 *   project config override on name collision (see `lib/chains/loader.ts`),
 *   so shipping a copy of the domain table here would shadow it and silently
 *   drift out of sync. Projects customize a chain by adding a `chains` block
 *   explicitly.
 */
export function createDefaultProjectConfig(): ProjectConfig {
	return {};
}
