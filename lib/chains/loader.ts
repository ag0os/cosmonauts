/**
 * Named-chain loader — resolves named chains from domain-provided defaults
 * and project-level config (`.cosmonauts/config.json`).
 *
 * Domain chains provide baseline definitions. Project config chains take
 * precedence on name collision, allowing per-project customization.
 */

import { loadProjectConfig } from "../config/index.ts";
import type { LoadedDomain } from "../domains/types.ts";
import type { NamedChain } from "./types.ts";

export function selectDomainChains(
	domains: readonly LoadedDomain[],
	domainContext?: string,
): NamedChain[] {
	return domains
		.filter(
			(domain) =>
				domainContext === undefined ||
				domain.manifest.id === "shared" ||
				domain.manifest.id === domainContext,
		)
		.flatMap((domain) => domain.chains);
}

/**
 * Load all available named chains by merging domain-provided chains with
 * project config chains. Project config takes precedence on name collision.
 */
export async function loadNamedChains(
	projectRoot: string,
	domainChains?: readonly NamedChain[],
): Promise<NamedChain[]> {
	const config = await loadProjectConfig(projectRoot);

	const chainMap = new Map<string, NamedChain>();
	if (domainChains) {
		for (const chain of domainChains) {
			chainMap.set(chain.name, chain);
		}
	}

	if (config.chains) {
		for (const [name, def] of Object.entries(config.chains)) {
			if (def && typeof def.chain === "string") {
				chainMap.set(name, {
					name,
					description: def.description ?? "",
					chain: def.chain,
				});
			}
		}
	}

	return [...chainMap.values()];
}

/**
 * Resolve a named chain by name. Throws if not found.
 */
export async function resolveNamedChain(
	name: string,
	projectRoot: string,
	domainChains?: readonly NamedChain[],
): Promise<NamedChain> {
	const chains = await loadNamedChains(projectRoot, domainChains);
	const found = chains.find((chain) => chain.name === name);
	if (!found) {
		const available = chains.map((chain) => chain.name).join(", ");
		throw new Error(`Unknown named chain "${name}". Available: ${available}`);
	}
	return found;
}

/**
 * List all available named chains with descriptions.
 */
export async function listNamedChains(
	projectRoot: string,
	domainChains?: readonly NamedChain[],
): Promise<NamedChain[]> {
	return loadNamedChains(projectRoot, domainChains);
}
