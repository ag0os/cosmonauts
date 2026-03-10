/**
 * Agent definitions — declarative config for all agents.
 *
 * Re-exports types, built-in definitions, and the registry.
 */

export {
	qualifyRole,
	roleToConfigKey,
	splitRole,
	unqualifyRole,
} from "./qualified-role.ts";
export { AgentRegistry, createRegistryFromDomains } from "./resolver.ts";
export {
	appendAgentIdentityMarker,
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
	qualifyAgentId,
} from "./runtime-identity.ts";
export type { SkillsOverrideFn } from "./skills.ts";
export { buildSkillsOverride } from "./skills.ts";
export type {
	AgentDefinition,
	AgentSessionMode,
	AgentToolSet,
} from "./types.ts";
