import type { AgentRegistry } from "../../agents/resolver.ts";
import type { AgentDefinition } from "../../agents/types.ts";
import type { ResolvedAgentReference } from "../../domains/bindings.ts";

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

/** Resolve the same target facts for every agent-starting tool before admission. */
export function authorizeAgentStart(options: {
	registry: AgentRegistry;
	domainContext?: string;
	callerRole: string;
	targetRole: string;
	targetReference?: ResolvedAgentReference;
}): string | undefined {
	const { registry, domainContext, callerRole, targetRole } = options;
	const caller = registry.get(callerRole, domainContext);
	if (!caller) return `unknown caller ${callerRole} cannot start ${targetRole}`;

	if (options.targetReference) {
		const reference = options.targetReference;
		const definition = registry.getResolvedTarget(
			reference.resolved.qualifiedId,
			caller.domain,
		);
		if (!definition)
			return `${callerRole} cannot start ${targetRole}: unavailable or internal target`;
		if (reference.requested.agentId !== reference.resolved.agentId)
			return `${callerRole} cannot start ${targetRole}: invalid binding target`;
		return isSubagentAllowed(caller, definition, reference)
			? undefined
			: `${callerRole} cannot start ${targetRole}`;
	}

	const target = registry.resolveReferenceResult(
		targetRole,
		domainContext,
		caller.domain,
	);
	if (target.kind !== "found") {
		return `${callerRole} cannot start ${targetRole}: ${target.kind === "internal" ? "internal target" : "unknown target"}`;
	}
	const reference =
		target.reference ??
		registry.resolveReference(targetRole, domainContext, caller.domain)
			?.reference;
	if (!reference || !isSubagentAllowed(caller, target.definition, reference)) {
		return `${callerRole} cannot start ${targetRole}`;
	}
	return undefined;
}
