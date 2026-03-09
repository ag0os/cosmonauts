/**
 * Domain registry — stores and queries loaded domains.
 *
 * Provides lookup methods for domains and their resources,
 * including capability resolution with domain-first fallback to shared.
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

	/**
	 * Find which domain provides a given capability.
	 *
	 * Resolution order:
	 * 1. If `preferDomain` is specified and has the capability, return it.
	 * 2. Fall back to the "shared" domain.
	 * 3. Return undefined if no domain provides the capability.
	 */
	resolveCapability(
		name: string,
		preferDomain?: string,
	): LoadedDomain | undefined {
		if (preferDomain) {
			const domain = this.domains.get(preferDomain);
			if (domain?.capabilities.has(name)) return domain;
		}
		const shared = this.domains.get("shared");
		if (shared?.capabilities.has(name)) return shared;
		return undefined;
	}
}
