/**
 * Chain DSL parser for orchestration pipelines.
 * Parses chain expressions into ChainStage arrays.
 *
 * DSL syntax:
 *   Pipeline:  "planner -> task-manager -> coordinator"
 *   Loop:      "coordinator:20"
 *   Combined:  "planner -> task-manager -> coordinator:20"
 *   Single:    "planner"
 */

import type { ChainStage } from "./types.ts";

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a chain DSL expression into an array of ChainStage objects.
 *
 * @param expression - The chain DSL expression to parse
 * @returns Array of parsed ChainStage objects
 * @throws Error if the expression is empty or contains invalid stages
 *
 * @example
 * parseChain("planner -> task-manager -> coordinator")
 * // => [
 * //   { name: "planner", maxIterations: 1 },
 * //   { name: "task-manager", maxIterations: 1 },
 * //   { name: "coordinator", maxIterations: 1 },
 * // ]
 *
 * @example
 * parseChain("coordinator:20")
 * // => [{ name: "coordinator", maxIterations: 20 }]
 *
 * @example
 * parseChain("planner -> coordinator:5")
 * // => [
 * //   { name: "planner", maxIterations: 1 },
 * //   { name: "coordinator", maxIterations: 5 },
 * // ]
 */
export function parseChain(expression: string): ChainStage[] {
	const trimmed = expression.trim();

	if (!trimmed) {
		throw new Error("Chain expression cannot be empty");
	}

	const parts = trimmed.split("->");
	const stages: ChainStage[] = [];

	for (const part of parts) {
		stages.push(parseStage(part));
	}

	return stages;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a single stage segment from the DSL.
 *
 * Accepts formats:
 *   "planner"       => { name: "planner", maxIterations: 1 }
 *   "coordinator:5" => { name: "coordinator", maxIterations: 5 }
 *
 * @param segment - A single stage segment (already split from the pipeline)
 * @returns A parsed ChainStage
 * @throws Error if the stage name is empty or the iteration count is invalid
 */
function parseStage(segment: string): ChainStage {
	const trimmed = segment.trim();

	if (!trimmed) {
		throw new Error("Stage name cannot be empty");
	}

	const colonIndex = trimmed.indexOf(":");

	// No colon — simple stage with default iterations
	if (colonIndex === -1) {
		const name = trimmed.toLowerCase();
		if (!name) {
			throw new Error("Stage name cannot be empty");
		}
		return { name, maxIterations: 1 };
	}

	// Has colon — extract name and iteration count
	const name = trimmed.slice(0, colonIndex).trim().toLowerCase();
	const iterPart = trimmed.slice(colonIndex + 1).trim();

	if (!name) {
		throw new Error("Stage name cannot be empty");
	}

	const maxIterations = Number.parseInt(iterPart, 10);

	if (Number.isNaN(maxIterations)) {
		throw new Error(
			`Invalid iteration count "${iterPart}" for stage "${name}"`,
		);
	}

	if (maxIterations < 1) {
		throw new Error(
			`Iteration count must be a positive integer, got ${maxIterations} for stage "${name}"`,
		);
	}

	if (!Number.isInteger(maxIterations)) {
		throw new Error(
			`Iteration count must be an integer, got ${maxIterations} for stage "${name}"`,
		);
	}

	return { name, maxIterations };
}
