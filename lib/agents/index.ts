/**
 * Agent definitions — declarative config for all agents.
 *
 * Re-exports types, built-in definitions, and the registry.
 */

export {
	AgentRegistry,
	createDefaultRegistry,
	createRegistryFromDomains,
	resolveAgent,
} from "./resolver.ts";
export {
	appendAgentIdentityMarker,
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
} from "./runtime-identity.ts";
export type { SkillsOverrideFn } from "./skills.ts";
export { buildSkillsOverride } from "./skills.ts";
export type {
	AgentDefinition,
	AgentSessionMode,
	AgentToolSet,
} from "./types.ts";
