import type { ProjectConfig } from "./types.ts";

/**
 * Default project config used by `cosmonauts init` (as the template injected
 * into the bootstrap prompt) and written by `cosmonauts scaffold missions`.
 *
 * Intentionally minimal — both `skills` and `workflows` are omitted on purpose:
 *
 * - `skills` absent → session setup falls back to each agent's declared skills
 *   rather than intersecting with a project filter. An explicit list is an
 *   opt-in way to restrict further, not a necessary base case.
 * - `workflows` absent → the active domain's workflows are used as-is. The
 *   workflow loader treats domain workflows as the baseline and only lets
 *   project config override on name collision (see `lib/workflows/loader.ts`),
 *   so shipping a copy of the domain table here would shadow it and silently
 *   drift out of sync. Projects customize a chain by adding a `workflows` block
 *   explicitly — see the catalog in `docs/orchestration.md`.
 */
export function createDefaultProjectConfig(): ProjectConfig {
	return {};
}
