/**
 * Shared helpers for working with ChainStep values.
 * Imported by parser, runner, CLI dispatch, and renderers.
 * No imports beyond types.ts — no circular dependencies.
 */

import type { ChainStage, ChainStep, ParallelGroupStep } from "./types.ts";

// ============================================================================
// Type guards
// ============================================================================

/** Returns true and narrows to ParallelGroupStep when the step is a parallel group. */
export function isParallelGroupStep(
	step: ChainStep,
): step is ParallelGroupStep {
	return (step as ParallelGroupStep).kind === "parallel";
}

/** Returns true and narrows to ChainStage when the step is a sequential stage. */
export function isChainStage(step: ChainStep): step is ChainStage {
	return (step as ParallelGroupStep).kind !== "parallel";
}

// ============================================================================
// Prompt injection
// ============================================================================

/**
 * Returns all leaf ChainStage values that will execute first.
 * For a sequential stage this is a single-element array.
 * For a parallel group it is all member stages.
 */
export function getFirstExecutableStages(steps: ChainStep[]): ChainStage[] {
	const first = steps[0];
	if (!first) return [];
	if (isParallelGroupStep(first)) return [...first.stages];
	return [first];
}

/**
 * Mutates the first step to carry the user prompt.
 * Sequential first step: injects into that single stage.
 * Parallel first step: appends to every member stage.
 *
 * When the stage already has a prompt, the user request is appended.
 * When it has none, only a `User request:` suffix is stored so runtime
 * prompt building can preserve the role default instructions.
 */
export function injectUserPrompt(steps: ChainStep[], prompt?: string): void {
	if (!prompt) return;
	const first = steps[0];
	if (!first) return;

	if (isParallelGroupStep(first)) {
		for (const stage of first.stages) {
			injectIntoStage(stage, prompt);
		}
		return;
	}

	injectIntoStage(first, prompt);
}

function injectIntoStage(stage: ChainStage, prompt: string): void {
	stage.prompt = stage.prompt
		? `${stage.prompt}\n\nUser request: ${prompt}`
		: `User request: ${prompt}`;
}

/**
 * Resolves a stage prompt against a role default prompt.
 *
 * A prompt that starts with `User request:` is treated as user-request-only
 * content and appended to the default role prompt.
 */
export function resolveStagePrompt(
	stagePrompt: string | undefined,
	defaultPrompt: string,
): string {
	if (!stagePrompt) return defaultPrompt;
	return stagePrompt.startsWith("User request:")
		? `${defaultPrompt}\n\n${stagePrompt}`
		: stagePrompt;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Produces a DSL string representation of a chain step array.
 *
 * - Sequential stage → `name`
 * - Fanout group     → `role[count]`
 * - Bracket group    → `[a, b, c]`
 * - Multiple steps   → joined with ` -> `
 *
 * @example
 * formatChainSteps([
 *   { name: "planner", loop: false },
 *   { kind: "parallel", stages: [...], syntax: { kind: "group" } }
 * ])
 * // => "planner -> [task-manager, reviewer]"
 */
export function formatChainSteps(steps: ChainStep[]): string {
	return steps.map(formatStep).join(" -> ");
}

function formatStep(step: ChainStep): string {
	if (!isParallelGroupStep(step)) {
		return step.name;
	}

	if (step.syntax.kind === "fanout") {
		return `${step.syntax.role}[${step.syntax.count}]`;
	}

	// group
	return `[${step.stages.map((s) => s.name).join(", ")}]`;
}

// ============================================================================
// DSL detection
// ============================================================================

/**
 * Returns true for any structurally valid chain DSL expression:
 * - A multi-step chain:      `planner -> coordinator`
 * - A bracket group:         `[planner, reviewer]`
 * - A fanout expression:     `reviewer[2]`
 * - A single stage name:     `planner` or `task-manager` or `coding/planner`
 *
 * Returns false for compound workflow-style names (`plan-and-build`) and
 * empty / whitespace-only input.
 *
 * Stage names follow the pattern `word` or `word-word` (at most one hyphen
 * per path segment), optionally qualified with a `/` domain prefix.
 * Compound names with two or more hyphens are treated as workflow names,
 * not DSL expressions.
 */
export function isChainDslExpression(expression: string): boolean {
	const trimmed = expression.trim();
	if (!trimmed) return false;

	// Arrow separator → definitely a chain
	if (trimmed.includes("->")) return true;

	// Bracket syntax → parallel group or fanout count
	if (trimmed.includes("[") || trimmed.includes("]")) return true;

	// Single stage name: each path segment may have at most one hyphen.
	// Valid:   planner, task-manager, coding/planner, coding/task-manager
	// Invalid: plan-and-build (two hyphens → compound workflow name)
	const STAGE_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)?";
	const STAGE_NAME = new RegExp(
		`^${STAGE_SEGMENT}(?:\\/${STAGE_SEGMENT})?$`,
		"i",
	);
	return STAGE_NAME.test(trimmed);
}
