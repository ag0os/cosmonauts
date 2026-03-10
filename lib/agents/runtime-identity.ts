/**
 * Runtime identity marker helpers.
 *
 * We embed a hidden marker into each agent's system prompt so extensions can
 * determine which agent definition is currently executing a tool call.
 */

const AGENT_ID_MARKER_PREFIX = "COSMONAUTS_AGENT_ID:";
const AGENT_ID_MARKER_REGEX =
	/<!--\s*COSMONAUTS_AGENT_ID:([a-z0-9/-]+)\s*-->/gi;

/** @deprecated Use `qualifyRole` from `qualified-role.ts` instead. */
export { qualifyRole as qualifyAgentId } from "./qualified-role.ts";

/** Build a hidden system-prompt marker for an agent ID. */
export function buildAgentIdentityMarker(agentId: string): string {
	return `<!-- ${AGENT_ID_MARKER_PREFIX}${agentId} -->`;
}

/**
 * Append the runtime identity marker to prompt content.
 * If prompt content is empty, returns only the marker.
 */
export function appendAgentIdentityMarker(
	promptContent: string | undefined,
	agentId: string,
): string {
	const marker = buildAgentIdentityMarker(agentId);
	return promptContent ? `${promptContent}\n\n${marker}` : marker;
}

/**
 * Extract the agent ID marker from a resolved system prompt.
 * Returns undefined when the marker is missing.
 */
export function extractAgentIdFromSystemPrompt(
	systemPrompt: string,
): string | undefined {
	const matches = [...systemPrompt.matchAll(AGENT_ID_MARKER_REGEX)];
	const last = matches.at(-1);
	return last?.[1]?.toLowerCase();
}
