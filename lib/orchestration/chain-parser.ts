/**
 * Chain DSL parser for orchestration pipelines.
 * Parses chain expressions into ChainStage arrays.
 *
 * DSL syntax:
 *   Pipeline:  "planner -> task-manager -> coordinator"
 *   Qualified: "coding/planner -> coding/worker"
 *   Single:    "planner"
 *
 * Loop behavior is determined by the role's lifecycle, not the DSL.
 * The parser just extracts stage names.
 */

import type { AgentRegistry } from "../agents/index.ts";
import { createDefaultRegistry } from "../agents/index.ts";
import type { ChainStage } from "./types.ts";

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a chain DSL expression into an array of ChainStage objects.
 *
 * Stage names are split on `->`, trimmed, and lowercased. Each stage's
 * `loop` property is determined by the role's lifecycle (e.g. coordinator
 * loops, planner does not).
 *
 * Qualified names like "coding/planner" are preserved — the "/" separator
 * is not treated specially by the parser.
 *
 * @param expression - The chain DSL expression to parse
 * @param registry - Optional agent registry for loop property resolution (defaults to built-in registry)
 * @param domainContext - Optional default domain for resolving unqualified stage names
 * @returns Array of parsed ChainStage objects
 * @throws Error if the expression is empty or contains empty stage names
 *
 * @example
 * parseChain("planner -> task-manager -> coordinator")
 * // => [
 * //   { name: "planner", loop: false },
 * //   { name: "task-manager", loop: false },
 * //   { name: "coordinator", loop: true },
 * // ]
 *
 * @example
 * parseChain("coding/planner -> coding/worker")
 * // => [
 * //   { name: "coding/planner", loop: false },
 * //   { name: "coding/worker", loop: false },
 * // ]
 */
export function parseChain(
	expression: string,
	registry?: AgentRegistry,
	domainContext?: string,
): ChainStage[] {
	const reg = registry ?? createDefaultRegistry();
	const trimmed = expression.trim();

	if (!trimmed) {
		throw new Error("Chain expression cannot be empty");
	}

	const parts = trimmed.split("->");
	const stages: ChainStage[] = [];

	for (const part of parts) {
		const name = part.trim().toLowerCase();

		if (!name) {
			throw new Error("Stage name cannot be empty");
		}

		if (name.includes(":")) {
			throw new Error(
				`Invalid stage name "${name}": the "role:count" syntax is no longer supported. Use maxTotalIterations in chain config instead.`,
			);
		}

		stages.push({ name, loop: reg.get(name, domainContext)?.loop ?? false });
	}

	return stages;
}
