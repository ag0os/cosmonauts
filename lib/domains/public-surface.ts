import type { AgentDefinition } from "../agents/types.ts";
import type { NamedChain } from "../chains/types.ts";
import type { LoadedDomain } from "./types.ts";

export type PublicSurfaceAssetType = "agents" | "skills" | "chains";

export interface PublicSurfaceAccess {
	readonly domain: LoadedDomain;
	readonly assetType: PublicSurfaceAssetType;
	readonly name: string;
	readonly requesterDomain?: string;
}

export function isInternalSurfaceName(
	domain: LoadedDomain,
	assetType: PublicSurfaceAssetType,
	name: string,
): boolean {
	return domain.manifest.internal?.[assetType]?.includes(name) ?? false;
}

export function canAccessSurfaceName({
	domain,
	assetType,
	name,
	requesterDomain,
}: PublicSurfaceAccess): boolean {
	if (requesterDomain === domain.manifest.id) return true;
	return !isInternalSurfaceName(domain, assetType, name);
}

export function selectPublicAgentDefinitions(
	domain: LoadedDomain,
	requesterDomain?: string,
): AgentDefinition[] {
	return [...domain.agents.entries()]
		.filter(([name]) =>
			canAccessSurfaceName({
				domain,
				assetType: "agents",
				name,
				requesterDomain,
			}),
		)
		.map(([, definition]) => definition);
}

export function selectPublicAgentIds(
	domain: LoadedDomain,
	requesterDomain?: string,
): string[] {
	return [...domain.agents.keys()].filter((name) =>
		canAccessSurfaceName({
			domain,
			assetType: "agents",
			name,
			requesterDomain,
		}),
	);
}

export function selectPublicSkillNames(
	domain: LoadedDomain,
	requesterDomain?: string,
): string[] {
	return [...domain.skills].filter((name) =>
		canAccessSurfaceName({
			domain,
			assetType: "skills",
			name,
			requesterDomain,
		}),
	);
}

export function selectPublicChains(
	domain: LoadedDomain,
	requesterDomain?: string,
): NamedChain[] {
	return domain.chains.filter((chain) =>
		canAccessSurfaceName({
			domain,
			assetType: "chains",
			name: chain.name,
			requesterDomain,
		}),
	);
}

export function collectInternalAgentsByDomain(
	domains: readonly LoadedDomain[],
): Map<string, ReadonlySet<string>> {
	const internalAgents = new Map<string, ReadonlySet<string>>();

	for (const domain of domains) {
		const agents = domain.manifest.internal?.agents;
		if (agents && agents.length > 0) {
			internalAgents.set(domain.manifest.id, new Set(agents));
		}
	}

	return internalAgents;
}
