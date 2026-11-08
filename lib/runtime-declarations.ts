import { validateAgentDefinition } from "./agents/declaration.ts";
import { splitRole } from "./agents/qualified-role.ts";
import type { AgentRegistry } from "./agents/resolver.ts";
import { qualifyAgentId } from "./agents/runtime-identity.ts";
import type { AgentDefinition } from "./agents/types.ts";
import type { NamedChain } from "./chains/types.ts";
import type { LoadedDomain } from "./domains/types.ts";

/** Collision checks belong to a run-scoped collection; layering registries still overwrite. */
export class RuntimeDeclarationCollisionError extends Error {
	constructor(
		readonly kind: "agent" | "domain" | "chain",
		readonly id: string,
	) {
		super(`Duplicate runtime ${kind} declaration: ${id}`);
		this.name = "RuntimeDeclarationCollisionError";
	}
}

export function collectRuntimeDomains(
	loaded: readonly LoadedDomain[],
	supplied: readonly LoadedDomain[] = [],
): LoadedDomain[] {
	const collected = [...loaded];
	const ids = new Set(loaded.map((domain) => domain.manifest.id));
	for (const domain of supplied) {
		if (ids.has(domain.manifest.id))
			throw new RuntimeDeclarationCollisionError("domain", domain.manifest.id);
		ids.add(domain.manifest.id);
		collected.push(domain);
	}
	return collected;
}

export function registerRuntimeAgents(options: {
	registry: AgentRegistry;
	domains: readonly LoadedDomain[];
	agents: readonly AgentDefinition[];
}): void {
	const ids = new Set(
		options.domains.flatMap((domain) =>
			[...domain.agents.values()].map((def) =>
				qualifyAgentId(def.id, def.domain),
			),
		),
	);
	for (const definition of options.agents) {
		validateAgentDefinition(definition);
		const qualified = qualifyAgentId(definition.id, definition.domain);
		if (ids.has(qualified))
			throw new RuntimeDeclarationCollisionError("agent", qualified);
		ids.add(qualified);
		const identity = splitRole(qualified);
		options.registry.register(
			definition.id.includes("/")
				? { ...definition, id: identity.id, domain: identity.domain }
				: definition,
		);
	}
}

export function collectRuntimeChains(
	loaded: readonly NamedChain[],
	supplied: readonly NamedChain[] = [],
): NamedChain[] {
	const collected = [...loaded];
	const names = new Set(loaded.map((chain) => chain.name));
	for (const chain of supplied) {
		if (names.has(chain.name))
			throw new RuntimeDeclarationCollisionError("chain", chain.name);
		names.add(chain.name);
		collected.push(chain);
	}
	return collected;
}
