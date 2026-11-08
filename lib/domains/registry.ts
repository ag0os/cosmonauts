/**
 * Domain registry — stores and queries loaded domains.
 *
 * Provides lookup methods for domains and their resources,
 * including capability resolution with three-tier fallback:
 * agent domain → portable domains → declared fallback domains.
 */

import type { LoadedDomain } from "./types.ts";

export class DomainRegistry {
	private readonly domains: Map<string, LoadedDomain>;

	constructor(domains: LoadedDomain[]) {
		this.domains = new Map();
		for (const domain of domains) {
			this.domains.set(domain.manifest.id, domain);
		}
	}

	/** Returns the loaded domain for the given ID, or undefined if not found. */
	get(id: string): LoadedDomain | undefined {
		return this.domains.get(id);
	}

	/** Returns true if a domain with the given ID exists. */
	has(id: string): boolean {
		return this.domains.has(id);
	}

	/** Returns all registered domain IDs. */
	listIds(): string[] {
		return [...this.domains.keys()];
	}

	/** Returns all loaded domains. */
	listAll(): LoadedDomain[] {
		return [...this.domains.values()];
	}

	/** Returns all domains with portable = true. */
	listPortable(): LoadedDomain[] {
		return [...this.domains.values()].filter((d) => d.portable);
	}

	/** Declared final-tier resource providers, in registry discovery order. */
	listResourceFallbacks(): LoadedDomain[] {
		return this.listAll().filter((domain) => domain.manifest.resourceFallback);
	}

	/** Own non-fallback domain, portable providers, then declared fallback providers. */
	resourceOrder(preferDomain?: string): LoadedDomain[] {
		const own = preferDomain ? this.get(preferDomain) : undefined;
		return [
			...(own && !own.manifest.resourceFallback ? [own] : []),
			...this.listPortable().filter(
				(domain) =>
					domain.manifest.id !== preferDomain &&
					!domain.manifest.resourceFallback,
			),
			...this.listResourceFallbacks(),
		];
	}

	/** Find the first declared capability provider in resource order. */
	resolveCapability(
		name: string,
		preferDomain?: string,
	): LoadedDomain | undefined {
		return this.resourceOrder(preferDomain).find((domain) =>
			domain.capabilities.has(name),
		);
	}
}
