/**
 * Named-chain loader — resolves named chains from domain-provided defaults
 * and project-level config (`.cosmonauts/config.json`).
 *
 * Domain chains provide baseline definitions. Project config chains take
 * precedence on name collision, allowing per-project customization.
 */

import { loadProjectConfig } from "../config/index.ts";
import {
	canAccessSurfaceName,
	selectPublicChains,
} from "../domains/public-surface.ts";
import type { LoadedDomain } from "../domains/types.ts";
import type { NamedChain } from "./types.ts";

export interface NamedChainDomainSource {
	readonly domains: readonly LoadedDomain[];
	readonly domainContext?: string;
}

type NamedChainSource = readonly NamedChain[] | NamedChainDomainSource;

export class InternalNamedChainAccessError extends Error {
	readonly requestedName: string;
	readonly domain: string;
	readonly requesterDomain: string | undefined;

	constructor(options: {
		requestedName: string;
		domain: string;
		requesterDomain?: string;
	}) {
		const requester = options.requesterDomain
			? ` from domain "${options.requesterDomain}"`
			: "";
		super(
			`Named chain "${options.requestedName}" is internal to domain "${options.domain}" and is not visible${requester}.`,
		);
		this.name = "InternalNamedChainAccessError";
		this.requestedName = options.requestedName;
		this.domain = options.domain;
		this.requesterDomain = options.requesterDomain;
	}
}

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
		.flatMap((domain) => selectPublicChains(domain, domainContext));
}

/**
 * Load all available named chains by merging domain-provided chains with
 * project config chains. Project config takes precedence on name collision.
 */
export async function loadNamedChains(
	projectRoot: string,
	domainChains?: NamedChainSource,
): Promise<NamedChain[]> {
	const config = await loadProjectConfig(projectRoot);
	const visibleDomainChains = resolveDomainChainSource(domainChains);

	const chainMap = new Map<string, NamedChain>();
	if (visibleDomainChains) {
		for (const chain of visibleDomainChains) {
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
	domainChains?: NamedChainSource,
): Promise<NamedChain> {
	const chains = await loadNamedChains(projectRoot, domainChains);
	const found = chains.find((chain) => chain.name === name);
	if (!found) {
		const internal = findInternalNamedChain(name, domainChains);
		if (internal) {
			throw new InternalNamedChainAccessError({
				requestedName: name,
				domain: internal.manifest.id,
				requesterDomain: asDomainSource(domainChains)?.domainContext,
			});
		}
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
	domainChains?: NamedChainSource,
): Promise<NamedChain[]> {
	return loadNamedChains(projectRoot, domainChains);
}

function resolveDomainChainSource(
	source: NamedChainSource | undefined,
): readonly NamedChain[] | undefined {
	if (source === undefined) return undefined;
	if (isChainArray(source)) return source;
	return selectDomainChains(source.domains, source.domainContext);
}

function findInternalNamedChain(
	name: string,
	source: NamedChainSource | undefined,
): LoadedDomain | undefined {
	const domainSource = asDomainSource(source);
	if (!domainSource) return undefined;

	for (const domain of domainSource.domains) {
		if (!isDomainInContext(domain, domainSource.domainContext)) continue;
		if (!domain.chains.some((chain) => chain.name === name)) continue;
		if (
			!canAccessSurfaceName({
				domain,
				assetType: "chains",
				name,
				requesterDomain: domainSource.domainContext,
			})
		) {
			return domain;
		}
	}
	return undefined;
}

function isDomainInContext(
	domain: LoadedDomain,
	domainContext: string | undefined,
): boolean {
	return (
		domainContext === undefined ||
		domain.manifest.id === "shared" ||
		domain.manifest.id === domainContext
	);
}

function asDomainSource(
	source: NamedChainSource | undefined,
): NamedChainDomainSource | undefined {
	if (!source || isChainArray(source)) return undefined;
	return source;
}

function isChainArray(
	source: NamedChainSource,
): source is readonly NamedChain[] {
	return Array.isArray(source);
}
