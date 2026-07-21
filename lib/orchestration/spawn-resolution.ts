import type { AgentRegistry } from "../agents/index.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import type { SpawnConfig } from "./types.ts";

export interface SpawnAgentResolution {
	readonly definition: AgentDefinition;
	readonly qualifiedId: string;
	readonly reference?: ResolvedAgentReference;
}

/**
 * Resolve the exact definition the Pi spawner will execute. Launch surfaces
 * reuse this seam when they need to freeze that execution identity.
 */
export function resolveSpawnAgent(
	registry: AgentRegistry,
	config: Pick<SpawnConfig, "agentReference" | "domainContext" | "role">,
): SpawnAgentResolution | undefined {
	if (config.agentReference) {
		const definition = registry.getResolvedTarget(
			config.agentReference.resolved.qualifiedId,
			config.domainContext,
		);
		if (!definition) return undefined;
		return {
			definition,
			qualifiedId: config.agentReference.resolved.qualifiedId,
			reference: config.agentReference,
		};
	}

	const resolved = registry.resolveReference(config.role, config.domainContext);
	if (resolved) {
		return {
			definition: resolved.definition,
			qualifiedId: resolved.reference.resolved.qualifiedId,
			reference: resolved.reference,
		};
	}

	// Domainless legacy definitions cannot produce a qualified reference, but
	// remain valid execution targets for the general-purpose spawner.
	const definition = registry.get(config.role, config.domainContext);
	if (!definition) return undefined;
	return {
		definition,
		qualifiedId: definition.domain
			? `${definition.domain}/${definition.id}`
			: definition.id,
	};
}
