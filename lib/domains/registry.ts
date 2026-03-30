/**
 * Domain registry — stores and queries loaded domains.
 *
 * Provides lookup methods for domains and their resources,
 * including capability resolution with three-tier fallback:
 * agent domain → portable domains → shared.
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

	/**
	 * Find which domain provides a given capability.
	 *
	 * Resolution order:
	 * 1. `preferDomain` (agent's own domain) — if specified and has the capability.
	 * 2. Portable domains in registry discovery order, excluding agent domain and shared.
	 * 3. "shared" domain.
	 * 4. Return undefined if no domain provides the capability.
	 */
	resolveCapability(
		name: string,
		preferDomain?: string,
	): LoadedDomain | undefined {
		// Tier 1: agent's own domain
		if (preferDomain) {
			const domain = this.domains.get(preferDomain);
			if (domain?.capabilities.has(name)) return domain;
		}

		// Tier 2: portable domains (registry order, skip agent domain and shared)
		for (const domain of this.domains.values()) {
			if (preferDomain && domain.manifest.id === preferDomain) continue;
			if (domain.manifest.id === "shared") continue;
			if (domain.portable && domain.capabilities.has(name)) return domain;
		}

		// Tier 3: shared
		const shared = this.domains.get("shared");
		if (shared?.capabilities.has(name)) return shared;

		return undefined;
	}
}
