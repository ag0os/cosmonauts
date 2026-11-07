/** Parse chain topology only: `author -> [critic, editor] -> executor` or `critic[3]`.
 * Binding, visibility, lifecycle and execution policy belong to normalization.
 */
import { validateAgentId } from "../agents/declaration.ts";
import type { ChainStage, ChainStep, ParallelGroupStep } from "./types.ts";

// ============================================================================
// Internal helpers
// ============================================================================

const FAN_OUT_RE = /^([^[\]\s]+)\[(\d+)\]$/;

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
			if (depth === 0) {
				throw new Error('Unmatched closing bracket "]" in chain expression');
			}
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

	if (depth !== 0) {
		throw new Error('Unmatched opening bracket "[" in chain expression');
	}

	parts.push(expression.slice(start));
	return parts;
}

function topologyStage(name: string): ChainStage {
	validateAgentId(name, "Chain stage");
	return { name };
}

/** Validate and parse a single sequential token into a ChainStage. */
function parseSequentialToken(raw: string): ChainStage {
	const name = raw.trim().toLowerCase();

	if (!name) {
		throw new Error("Stage name cannot be empty");
	}

	if (name.includes(":")) {
		throw new Error(
			`Invalid stage name "${name}": the "role:count" syntax is no longer supported. Use maxTotalIterations in chain config instead.`,
		);
	}

	return topologyStage(name);
}

/** Parse a bracket-group token `[a, b, c]` into a ParallelGroupStep. */
function parseBracketGroup(token: string): ParallelGroupStep {
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

		const stage = topologyStage(name);

		return stage;
	});

	if (stages.length < 2) {
		throw new Error(
			`Parallel group must have at least 2 members, got ${stages.length}: "${token}"`,
		);
	}

	return {
		kind: "parallel",
		stages: stages as [ChainStage, ...ChainStage[]],
		syntax: { kind: "group" },
	};
}

/** Parse a fan-out token `role[n]` into a ParallelGroupStep. */
function parseFanOut(match: RegExpMatchArray): ParallelGroupStep {
	const [, rawRole = "", rawCount = "0"] = match;
	const role = rawRole.toLowerCase();
	const count = Number(rawCount);

	if (count < 1 || count > 10) {
		throw new Error(
			`Fan-out count for "${role}" must be between 1 and 10, got ${count}`,
		);
	}

	const stage = topologyStage(role);

	const stages = Array.from({ length: count }, () => ({
		...stage,
	})) as [ChainStage, ...ChainStage[]];

	return {
		kind: "parallel",
		stages,
		syntax: { kind: "fanout", role, count },
	};
}

// ============================================================================
// Parser
// ============================================================================

/** Parse a sequence, bracket group or fan-out without reading declarations. */
export function parseChain(expression: string): ChainStep[] {
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
			steps.push(parseBracketGroup(token));
			continue;
		}

		const fanOutMatch = token.match(FAN_OUT_RE);
		if (fanOutMatch) {
			steps.push(parseFanOut(fanOutMatch));
			continue;
		}

		steps.push(parseSequentialToken(token));
	}

	return steps;
}
