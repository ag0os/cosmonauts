/**
 * Agent registry — resolves agent IDs to their definitions.
 *
 * The registry is a Map-backed class seeded with agent definitions.
 * It supports domain-qualified IDs ({domain}/{agent}), domain-context
 * resolution, and runtime registration for user-defined agents.
 */

import type { LoadedDomain } from "../domains/types.ts";
import { splitRole } from "./qualified-role.ts";
import type { AgentDefinition } from "./types.ts";

export class AgentRegistry {
	private readonly definitions: Map<string, AgentDefinition>;

	constructor(builtins: readonly AgentDefinition[]) {
		this.definitions = new Map();
		for (const def of builtins) {
			const key = def.domain ? `${def.domain}/${def.id}` : def.id;
			this.definitions.set(key, def);
		}
	}

	/** Returns the definition for the given ID, or undefined if not found. */
	get(id: string, domainContext?: string): AgentDefinition | undefined {
		return this.resolveId(id, domainContext);
	}

	/** Returns the definition for the given ID, or throws with available IDs. */
	resolve(id: string, domainContext?: string): AgentDefinition {
		const def = this.resolveId(id, domainContext);
		if (!def) {
			const available = [...this.definitions.keys()].join(", ");
			throw new Error(
				`Unknown agent ID "${id}". Available agents: ${available}`,
			);
		}
		return def;
	}

	/** Returns true if an agent with the given ID exists. */
	has(id: string, domainContext?: string): boolean {
		return this.resolveId(id, domainContext) !== undefined;
	}

	/** Returns all definitions from a specific domain. */
	resolveInDomain(domain: string): AgentDefinition[] {
		return [...this.definitions.entries()]
			.filter(([key]) => key.startsWith(`${domain}/`))
			.map(([, def]) => def);
	}

	/** Returns all registered agent IDs (keys as stored — qualified if domain is set). */
	listIds(): string[] {
		return [...this.definitions.keys()];
	}

	/** Returns all registered definitions. */
	listAll(): AgentDefinition[] {
		return [...this.definitions.values()];
	}

	/** Adds or overwrites a definition. */
	register(def: AgentDefinition): void {
		const key = def.domain ? `${def.domain}/${def.id}` : def.id;
		this.definitions.set(key, def);
	}

	/**
	 * Internal resolution logic supporting qualified IDs, domain context, and
	 * unqualified scan-all fallback.
	 */
	private resolveId(
		id: string,
		domainContext?: string,
	): AgentDefinition | undefined {
		// 1. Direct lookup (qualified or unqualified)
		const direct = this.definitions.get(id);
		if (direct) return direct;

		// 2. If id contains /, it was qualified — no further fallback
		if (id.includes("/")) return undefined;

		// 3. Try with domain context
		if (domainContext) {
			const qualified = this.definitions.get(`${domainContext}/${id}`);
			if (qualified) return qualified;
		}

		// 4. Scan all domains for unqualified match
		const matches: AgentDefinition[] = [];
		for (const [key, def] of this.definitions) {
			const { id: unqualified } = splitRole(key);
			if (unqualified === id) matches.push(def);
		}

		if (matches.length === 1) return matches[0];
		// If ambiguous (multiple domains have same agent name), return undefined
		return undefined;
	}
}

/** Create a registry from loaded domains. */
export function createRegistryFromDomains(
	domains: readonly LoadedDomain[],
): AgentRegistry {
	const allDefs: AgentDefinition[] = [];
	for (const domain of domains) {
		for (const def of domain.agents.values()) {
			allDefs.push(def);
		}
	}
	return new AgentRegistry(allDefs);
}
