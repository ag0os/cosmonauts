/**
 * Agent registry — resolves agent IDs to their definitions.
 *
 * The registry is a Map-backed class seeded with agent definitions.
 * It supports domain-qualified IDs ({domain}/{agent}), domain-context
 * resolution, and runtime registration for user-defined agents.
 */

import { collectInternalAgentsByDomain } from "../domains/public-surface.ts";
import type { LoadedDomain } from "../domains/types.ts";
import { splitRole } from "./qualified-role.ts";
import type { AgentDefinition } from "./types.ts";

export interface AgentRegistryOptions {
	readonly internalAgentsByDomain?: ReadonlyMap<string, ReadonlySet<string>>;
}

type AgentResolutionResult =
	| { readonly kind: "found"; readonly definition: AgentDefinition }
	| { readonly kind: "not-found" }
	| {
			readonly kind: "internal";
			readonly domain: string;
			readonly agent: string;
	  };

export class InternalAgentAccessError extends Error {
	readonly requestedId: string;
	readonly domain: string;
	readonly agent: string;
	readonly requesterDomain: string | undefined;

	constructor(options: {
		requestedId: string;
		domain: string;
		agent: string;
		requesterDomain?: string;
	}) {
		const requester = options.requesterDomain
			? ` from domain "${options.requesterDomain}"`
			: "";
		super(
			`Agent "${options.requestedId}" is internal to domain "${options.domain}" and is not visible${requester}.`,
		);
		this.name = "InternalAgentAccessError";
		this.requestedId = options.requestedId;
		this.domain = options.domain;
		this.agent = options.agent;
		this.requesterDomain = options.requesterDomain;
	}
}

export class AgentRegistry {
	private readonly definitions: Map<string, AgentDefinition>;
	private readonly internalAgentsByDomain: ReadonlyMap<
		string,
		ReadonlySet<string>
	>;

	constructor(
		builtins: readonly AgentDefinition[],
		options: AgentRegistryOptions = {},
	) {
		this.definitions = new Map();
		this.internalAgentsByDomain =
			options.internalAgentsByDomain ?? new Map<string, ReadonlySet<string>>();
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
		const result = this.resolveResult(id, domainContext);
		if (result.kind === "found") return result.definition;
		if (result.kind === "internal") {
			throw new InternalAgentAccessError({
				requestedId: id,
				domain: result.domain,
				agent: result.agent,
				requesterDomain: domainContext,
			});
		}

		{
			const available = this.listIds(domainContext).join(", ");
			throw new Error(
				`Unknown agent ID "${id}". Available agents: ${available}`,
			);
		}
	}

	/** Returns true if an agent with the given ID exists. */
	has(id: string, domainContext?: string): boolean {
		return this.resolveId(id, domainContext) !== undefined;
	}

	/** Returns all definitions from a specific domain. */
	resolveInDomain(domain: string, requesterDomain = domain): AgentDefinition[] {
		return [...this.definitions.entries()]
			.filter(([key]) => key.startsWith(`${domain}/`))
			.filter(([, def]) => this.isVisible(def, requesterDomain))
			.map(([, def]) => def);
	}

	/** Returns all registered agent IDs (keys as stored — qualified if domain is set). */
	listIds(domainContext?: string): string[] {
		return [...this.definitions.entries()]
			.filter(([, def]) => this.isVisible(def, domainContext))
			.map(([key]) => key);
	}

	/** Returns all registered definitions. */
	listAll(domainContext?: string): AgentDefinition[] {
		return [...this.definitions.values()].filter((def) =>
			this.isVisible(def, domainContext),
		);
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
		const result = this.resolveResult(id, domainContext);
		return result.kind === "found" ? result.definition : undefined;
	}

	private resolveResult(
		id: string,
		domainContext?: string,
	): AgentResolutionResult {
		// 1. Direct lookup (qualified or unqualified)
		const direct = this.definitions.get(id);
		if (direct) return this.visibleResult(direct, domainContext);

		// 2. If id contains /, it was qualified — no further fallback
		if (id.includes("/")) {
			const { domain, id: agent } = splitRole(id);
			if (
				domain &&
				this.internalAgentsByDomain.get(domain)?.has(agent) &&
				domainContext !== domain
			) {
				return { kind: "internal", domain, agent };
			}
			return { kind: "not-found" };
		}

		// 3. Try with domain context
		if (domainContext) {
			const qualified = this.definitions.get(`${domainContext}/${id}`);
			if (qualified) return this.visibleResult(qualified, domainContext);
		}

		// 4. Scan all domains for unqualified match
		const matches: AgentDefinition[] = [];
		const internalMatches: AgentDefinition[] = [];
		for (const [key, def] of this.definitions) {
			const { id: unqualified } = splitRole(key);
			if (unqualified !== id) continue;
			if (this.isVisible(def, domainContext)) {
				matches.push(def);
			} else {
				internalMatches.push(def);
			}
		}

		if (matches.length === 1) {
			const definition = matches[0];
			if (definition) return { kind: "found", definition };
		}
		if (matches.length === 0 && internalMatches.length === 1) {
			const hidden = internalMatches[0];
			if (hidden?.domain) {
				return { kind: "internal", domain: hidden.domain, agent: hidden.id };
			}
		}
		// If ambiguous (multiple domains have same agent name), return undefined
		return { kind: "not-found" };
	}

	private visibleResult(
		definition: AgentDefinition,
		requesterDomain?: string,
	): AgentResolutionResult {
		if (this.isVisible(definition, requesterDomain)) {
			return { kind: "found", definition };
		}

		return definition.domain
			? { kind: "internal", domain: definition.domain, agent: definition.id }
			: { kind: "not-found" };
	}

	private isVisible(
		definition: AgentDefinition,
		requesterDomain?: string,
	): boolean {
		const domain = definition.domain;
		if (!domain || requesterDomain === domain) return true;
		return !(
			this.internalAgentsByDomain.get(domain)?.has(definition.id) ?? false
		);
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
	return new AgentRegistry(allDefs, {
		internalAgentsByDomain: collectInternalAgentsByDomain(domains),
	});
}
