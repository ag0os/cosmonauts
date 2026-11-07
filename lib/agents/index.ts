/**
 * Agent definitions — declarative config for all agents.
 *
 * Re-exports types, built-in definitions, and the registry.
 */

export { resolveMemoryGrants, validateAgentDefinition } from "./declaration.ts";

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
	stripAgentIdentityMarkers,
} from "./runtime-identity.ts";
export type { SkillsOverrideFn } from "./skills.ts";
export { buildSkillsOverride } from "./skills.ts";
export type {
	AgentDefinition,
	AgentInstructions,
	AgentMemoryGrants,
	AgentSessionMode,
	AgentToolSet,
} from "./types.ts";
