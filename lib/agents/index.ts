/**
 * Agent definitions — declarative config for all agents.
 *
 * Re-exports types, built-in definitions, and the registry.
 */

export {
	BUILTIN_DEFINITIONS,
	COORDINATOR_DEFINITION,
	COSMO_DEFINITION,
	PLANNER_DEFINITION,
	TASK_MANAGER_DEFINITION,
	WORKER_DEFINITION,
} from "./definitions.ts";
export {
	AgentRegistry,
	createDefaultRegistry,
	resolveAgent,
} from "./resolver.ts";
export type { SkillsOverrideFn } from "./skills.ts";
export { buildSkillsOverride } from "./skills.ts";
export type {
	AgentDefinition,
	AgentSessionMode,
	AgentToolSet,
} from "./types.ts";
