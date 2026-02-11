/**
 * Agent registry — resolves agent IDs to their definitions.
 *
 * The registry is a Map-backed class seeded with built-in definitions.
 * It supports runtime registration for future user-defined agents.
 */

import { BUILTIN_DEFINITIONS } from "./definitions.ts";
import type { AgentDefinition } from "./types.ts";

export class AgentRegistry {
	private readonly definitions: Map<string, AgentDefinition>;

	constructor(builtins: readonly AgentDefinition[] = BUILTIN_DEFINITIONS) {
		this.definitions = new Map();
		for (const def of builtins) {
			this.definitions.set(def.id, def);
		}
	}

	/** Returns the definition for the given ID, or undefined if not found. */
	get(id: string): AgentDefinition | undefined {
		return this.definitions.get(id);
	}

	/** Returns the definition for the given ID, or throws with available IDs. */
	resolve(id: string): AgentDefinition {
		const def = this.definitions.get(id);
		if (!def) {
			const available = [...this.definitions.keys()].join(", ");
			throw new Error(
				`Unknown agent ID "${id}". Available agents: ${available}`,
			);
		}
		return def;
	}

	/** Returns true if an agent with the given ID exists. */
	has(id: string): boolean {
		return this.definitions.has(id);
	}

	/** Returns all registered agent IDs. */
	listIds(): string[] {
		return [...this.definitions.keys()];
	}

	/** Returns all registered definitions. */
	listAll(): AgentDefinition[] {
		return [...this.definitions.values()];
	}

	/** Adds or overwrites a definition. */
	register(def: AgentDefinition): void {
		this.definitions.set(def.id, def);
	}
}

/** Create an AgentRegistry pre-loaded with all built-in definitions. */
export function createDefaultRegistry(): AgentRegistry {
	return new AgentRegistry();
}

/** One-shot convenience: resolve an agent ID using the default registry. */
export function resolveAgent(id: string): AgentDefinition {
	return createDefaultRegistry().resolve(id);
}
