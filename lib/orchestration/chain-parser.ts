/**
 * Chain DSL parser for orchestration pipelines.
 * Parses chain expressions into ChainStep arrays.
 *
 * DSL syntax:
 *   Sequential:   "planner -> task-manager -> coordinator"
 *   Bracket group: "planner -> [task-manager, reviewer] -> coordinator"
 *   Fan-out:       "coordinator -> reviewer[3]"
 *   Qualified:    "coding/planner -> coding/worker"
 *   Single:       "planner"
 *
 * Loop behavior is determined by the role's lifecycle, not the DSL.
 */

import type { AgentRegistry } from "../agents/index.ts";
import type { ChainStage, ChainStep, ParallelGroupStep } from "./types.ts";

// ============================================================================
// Internal helpers
// ============================================================================

const FAN_OUT_RE = /^([a-zA-Z][a-zA-Z0-9\-/]*)\[(\d+)\]$/;

/** Split a chain expression on top-level `->` arrows (not inside brackets). */
function splitOnTopLevelArrows(expression: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	let i = 0;

	while (i < expression.length) {
		const ch = expression[i];
		if (ch === "[") {
			depth++;
			i++;
		} else if (ch === "]") {
			depth--;
			i++;
		} else if (depth === 0 && expression.startsWith("->", i)) {
			parts.push(expression.slice(start, i));
			start = i + 2;
			i = start;
		} else {
			i++;
		}
	}
	parts.push(expression.slice(start));
	return parts;
}

/** Resolve a stage name to a ChainStage using the registry. */
function resolveStage(
	name: string,
	registry: AgentRegistry,
	domainContext: string | undefined,
): ChainStage {
	return { name, loop: registry.get(name, domainContext)?.loop ?? false };
}

/** Validate and parse a single sequential token into a ChainStage. */
function parseSequentialToken(
	raw: string,
	registry: AgentRegistry,
	domainContext: string | undefined,
): ChainStage {
	const name = raw.trim().toLowerCase();

	if (!name) {
		throw new Error("Stage name cannot be empty");
	}

	if (name.includes(":")) {
		throw new Error(
			`Invalid stage name "${name}": the "role:count" syntax is no longer supported. Use maxTotalIterations in chain config instead.`,
		);
	}

	return resolveStage(name, registry, domainContext);
}

/** Parse a bracket-group token `[a, b, c]` into a ParallelGroupStep. */
function parseBracketGroup(
	token: string,
	registry: AgentRegistry,
	domainContext: string | undefined,
): ParallelGroupStep {
	const inner = token.slice(1, -1).trim();

	if (!inner) {
		throw new Error("Empty parallel group [] is not allowed");
	}

	const memberTokens = inner.split(",").map((s) => s.trim());

	const stages = memberTokens.map((member) => {
		if (!member) {
			throw new Error("Empty member name in parallel group");
		}

		if (member.startsWith("[")) {
			throw new Error(
				`Nested bracket groups are not allowed inside a parallel group: "${member}"`,
			);
		}

		if (FAN_OUT_RE.test(member)) {
			throw new Error(
				`Fan-out notation is not allowed inside a bracket group: "${member}"`,
			);
		}

		const name = member.toLowerCase();

		if (name.includes(":")) {
			throw new Error(
				`Invalid stage name "${name}": the "role:count" syntax is no longer supported. Use maxTotalIterations in chain config instead.`,
			);
		}

		const stage = resolveStage(name, registry, domainContext);

		if (stage.loop) {
			throw new Error(
				`Loop stage "${name}" cannot be used inside a parallel group. Loop stages must run sequentially.`,
			);
		}

		return stage;
	});

	if (stages.length < 2) {
		throw new Error(
			`Parallel group must have at least 2 members, got ${stages.length}: "${token}"`,
		);
	}

	return {
		kind: "parallel",
		stages: stages as [ChainStage, ChainStage, ...ChainStage[]],
		syntax: { kind: "group" },
	};
}

/** Parse a fan-out token `role[n]` into a ParallelGroupStep. */
function parseFanOut(
	token: string,
	match: RegExpMatchArray,
	registry: AgentRegistry,
	domainContext: string | undefined,
): ParallelGroupStep {
	const role = match[1]!.toLowerCase();
	const count = Number(match[2]);

	if (count < 1 || count > 10) {
		throw new Error(
			`Fan-out count for "${role}" must be between 1 and 10, got ${count}`,
		);
	}

	const stage = resolveStage(role, registry, domainContext);

	if (stage.loop) {
		throw new Error(
			`Loop stage "${role}" cannot be used in a fan-out. Loop stages must run sequentially.`,
		);
	}

	const stages = Array.from({ length: count }, () => ({
		...stage,
	})) as [ChainStage, ChainStage, ...ChainStage[]];

	return {
		kind: "parallel",
		stages,
		syntax: { kind: "fanout", role, count },
	};
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a chain DSL expression into an array of ChainStep objects.
 *
 * Supports sequential stages, bracket groups, and fan-out notation.
 * Arrows inside bracket groups are not treated as separators.
 *
 * @param expression - The chain DSL expression to parse
 * @param registry - Agent registry for loop property resolution
 * @param domainContext - Optional default domain for resolving unqualified stage names
 * @returns Array of parsed ChainStep objects
 * @throws Error if the expression is invalid
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
 * parseChain("coordinator -> reviewer[3]")
 * // => [
 * //   { name: "coordinator", loop: true },
 * //   { kind: "parallel", stages: [{ name: "reviewer", loop: false }, ...], syntax: { kind: "fanout", role: "reviewer", count: 3 } },
 * // ]
 *
 * @example
 * parseChain("planner -> [task-manager, reviewer]")
 * // => [
 * //   { name: "planner", loop: false },
 * //   { kind: "parallel", stages: [{ name: "task-manager", loop: false }, { name: "reviewer", loop: false }], syntax: { kind: "group" } },
 * // ]
 */
export function parseChain(
	expression: string,
	registry: AgentRegistry,
	domainContext?: string,
): ChainStep[] {
	const trimmed = expression.trim();

	if (!trimmed) {
		throw new Error("Chain expression cannot be empty");
	}

	const rawTokens = splitOnTopLevelArrows(trimmed);
	const steps: ChainStep[] = [];

	for (const rawToken of rawTokens) {
		const token = rawToken.trim();

		if (!token) {
			throw new Error("Stage name cannot be empty");
		}

		if (token.startsWith("[")) {
			steps.push(parseBracketGroup(token, registry, domainContext));
			continue;
		}

		const fanOutMatch = token.match(FAN_OUT_RE);
		if (fanOutMatch) {
			steps.push(parseFanOut(token, fanOutMatch, registry, domainContext));
			continue;
		}

		steps.push(parseSequentialToken(token, registry, domainContext));
	}

	return steps;
}
