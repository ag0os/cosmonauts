import type { AgentDefinition } from "../../../../lib/agents/types.ts";
import type { ResolvedAgentReference } from "../../../../lib/domains/bindings.ts";

/**
 * Check if a target agent is in the caller's subagents allowlist.
 * Handles both qualified (domain/id) and unqualified ID formats.
 */
export function isSubagentAllowed(
	callerDef: AgentDefinition,
	targetDef: AgentDefinition,
	targetReference?: ResolvedAgentReference,
): boolean {
	const allowed = callerDef.subagents ?? [];
	if (targetReference) {
		if (allowed.includes(targetReference.requested.qualifiedId)) return true;
		if (allowed.includes(targetReference.resolved.qualifiedId)) return true;
	}
	// Check unqualified match
	if (allowed.includes(targetDef.id)) return true;
	// Check qualified match
	if (
		targetDef.domain &&
		allowed.includes(`${targetDef.domain}/${targetDef.id}`)
	)
		return true;
	return false;
}
