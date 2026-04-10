/**
 * Tests for chain-steps.ts
 * Covers type guards, prompt injection, DSL formatting, and DSL detection.
 */

import { describe, expect, test } from "vitest";
import {
	formatChainSteps,
	getFirstExecutableStages,
	injectUserPrompt,
	isChainDslExpression,
	isChainStage,
	isParallelGroupStep,
	resolveStagePrompt,
} from "../../lib/orchestration/chain-steps.ts";
import type {
	ChainStage,
	ChainStep,
	ParallelGroupStep,
} from "../../lib/orchestration/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

function stage(name: string, prompt?: string): ChainStage {
	return { name, loop: false, ...(prompt !== undefined && { prompt }) };
}

function group(...names: string[]): ParallelGroupStep {
	const stages = names.map((n) => stage(n)) as [
		ChainStage,
		ChainStage,
		...ChainStage[],
	];
	return { kind: "parallel", stages, syntax: { kind: "group" } };
}

function fanout(role: string, count: number): ParallelGroupStep {
	const stages = Array.from({ length: count }, () => stage(role)) as [
		ChainStage,
		ChainStage,
		...ChainStage[],
	];
	return { kind: "parallel", stages, syntax: { kind: "fanout", role, count } };
}

// ============================================================================
// Type guards
// ============================================================================

describe("isParallelGroupStep", () => {
	test("returns true for a ParallelGroupStep", () => {
		const step: ChainStep = group("planner", "reviewer");
		expect(isParallelGroupStep(step)).toBe(true);
	});

	test("returns false for a ChainStage", () => {
		const step: ChainStep = stage("planner");
		expect(isParallelGroupStep(step)).toBe(false);
	});

	test("narrows type to ParallelGroupStep", () => {
		const step: ChainStep = group("planner", "reviewer");
		if (isParallelGroupStep(step)) {
			// TypeScript would error here if type narrowing failed
			expect(step.kind).toBe("parallel");
			expect(step.stages).toHaveLength(2);
		}
	});
});

describe("isChainStage", () => {
	test("returns true for a ChainStage", () => {
		const step: ChainStep = stage("planner");
		expect(isChainStage(step)).toBe(true);
	});

	test("returns false for a ParallelGroupStep", () => {
		const step: ChainStep = group("planner", "reviewer");
		expect(isChainStage(step)).toBe(false);
	});

	test("narrows type to ChainStage", () => {
		const step: ChainStep = stage("coordinator");
		if (isChainStage(step)) {
			// TypeScript would error here if type narrowing failed
			expect(step.name).toBe("coordinator");
		}
	});

	test("isChainStage and isParallelGroupStep are mutually exclusive", () => {
		const sequential: ChainStep = stage("planner");
		const parallel: ChainStep = group("planner", "reviewer");

		expect(isChainStage(sequential)).toBe(true);
		expect(isParallelGroupStep(sequential)).toBe(false);
		expect(isChainStage(parallel)).toBe(false);
		expect(isParallelGroupStep(parallel)).toBe(true);
	});
});

// ============================================================================
// getFirstExecutableStages
// ============================================================================

describe("getFirstExecutableStages", () => {
	test("returns single-element array for a sequential first step", () => {
		const steps: ChainStep[] = [stage("planner"), stage("coordinator")];
		const result = getFirstExecutableStages(steps);
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("planner");
	});

	test("returns all member stages for a parallel first step", () => {
		const steps: ChainStep[] = [
			group("planner", "reviewer"),
			stage("coordinator"),
		];
		const result = getFirstExecutableStages(steps);
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.name)).toEqual(["planner", "reviewer"]);
	});

	test("returns empty array for empty steps", () => {
		expect(getFirstExecutableStages([])).toEqual([]);
	});

	test("returns all fanout members for a fanout first step", () => {
		const steps: ChainStep[] = [fanout("reviewer", 3)];
		const result = getFirstExecutableStages(steps);
		expect(result).toHaveLength(3);
		expect(result.every((s) => s.name === "reviewer")).toBe(true);
	});
});

// ============================================================================
// injectUserPrompt
// ============================================================================

describe("injectUserPrompt", () => {
	test("does nothing when prompt is undefined", () => {
		const s = stage("planner");
		const steps: ChainStep[] = [s];
		injectUserPrompt(steps, undefined);
		expect(s.prompt).toBeUndefined();
	});

	test("does nothing when prompt is empty string", () => {
		const s = stage("planner");
		const steps: ChainStep[] = [s];
		injectUserPrompt(steps, "");
		expect(s.prompt).toBeUndefined();
	});

	test("does nothing for empty steps array", () => {
		expect(() => injectUserPrompt([], "hello")).not.toThrow();
	});

	test("injects into the single stage when first step is sequential", () => {
		const s = stage("planner");
		const steps: ChainStep[] = [s, stage("coordinator")];
		injectUserPrompt(steps, "build an auth system");
		expect(s.prompt).toBe("User request: build an auth system");
	});

	test("does not inject into later sequential stages", () => {
		const second = stage("coordinator");
		const steps: ChainStep[] = [stage("planner"), second];
		injectUserPrompt(steps, "build an auth system");
		expect(second.prompt).toBeUndefined();
	});

	test("appends to existing prompt when sequential stage already has one", () => {
		const s = stage("planner", "Analyze the project.");
		const steps: ChainStep[] = [s];
		injectUserPrompt(steps, "focus on auth");
		expect(s.prompt).toBe(
			"Analyze the project.\n\nUser request: focus on auth",
		);
	});

	test("injects into all members when first step is parallel", () => {
		const s1 = stage("planner");
		const s2 = stage("reviewer");
		const parallelStep: ParallelGroupStep = {
			kind: "parallel",
			stages: [s1, s2],
			syntax: { kind: "group" },
		};
		const steps: ChainStep[] = [parallelStep, stage("coordinator")];
		injectUserPrompt(steps, "design the system");
		expect(s1.prompt).toBe("User request: design the system");
		expect(s2.prompt).toBe("User request: design the system");
	});

	test("does not inject into stages of non-first parallel steps", () => {
		const s1 = stage("planner");
		const later1 = stage("reviewer");
		const later2 = stage("fixer");
		const laterParallel: ParallelGroupStep = {
			kind: "parallel",
			stages: [later1, later2],
			syntax: { kind: "group" },
		};
		const steps: ChainStep[] = [s1, laterParallel];
		injectUserPrompt(steps, "hello");
		expect(later1.prompt).toBeUndefined();
		expect(later2.prompt).toBeUndefined();
	});

	test("appends to existing prompt on each parallel member", () => {
		const s1 = stage("planner", "Plan the work.");
		const s2 = stage("reviewer", "Review the code.");
		const parallelStep: ParallelGroupStep = {
			kind: "parallel",
			stages: [s1, s2],
			syntax: { kind: "group" },
		};
		injectUserPrompt([parallelStep], "focus on security");
		expect(s1.prompt).toBe("Plan the work.\n\nUser request: focus on security");
		expect(s2.prompt).toBe(
			"Review the code.\n\nUser request: focus on security",
		);
	});
});

// ============================================================================
// resolveStagePrompt
// ============================================================================

describe("resolveStagePrompt", () => {
	test("returns default prompt when stage prompt is undefined", () => {
		expect(resolveStagePrompt(undefined, "Default prompt")).toBe(
			"Default prompt",
		);
	});

	test("preserves explicit stage prompt overrides", () => {
		expect(resolveStagePrompt("Custom prompt", "Default prompt")).toBe(
			"Custom prompt",
		);
	});

	test("prepends default prompt for user-request-only stage prompt", () => {
		expect(
			resolveStagePrompt("User request: focus on auth", "Default prompt"),
		).toBe("Default prompt\n\nUser request: focus on auth");
	});
});

// ============================================================================
// formatChainSteps
// ============================================================================

describe("formatChainSteps", () => {
	test("formats a single sequential stage", () => {
		expect(formatChainSteps([stage("planner")])).toBe("planner");
	});

	test("formats multiple sequential stages", () => {
		expect(
			formatChainSteps([
				stage("planner"),
				stage("task-manager"),
				stage("coordinator"),
			]),
		).toBe("planner -> task-manager -> coordinator");
	});

	test("formats a bracket group step", () => {
		expect(formatChainSteps([group("task-manager", "reviewer")])).toBe(
			"[task-manager, reviewer]",
		);
	});

	test("formats a fanout step", () => {
		expect(formatChainSteps([fanout("reviewer", 2)])).toBe("reviewer[2]");
	});

	test("formats a fanout step with count > 2", () => {
		expect(formatChainSteps([fanout("worker", 4)])).toBe("worker[4]");
	});

	test("formats a mixed sequential and group chain", () => {
		expect(
			formatChainSteps([stage("planner"), group("task-manager", "reviewer")]),
		).toBe("planner -> [task-manager, reviewer]");
	});

	test("formats a mixed sequential and fanout chain", () => {
		expect(formatChainSteps([stage("planner"), fanout("reviewer", 3)])).toBe(
			"planner -> reviewer[3]",
		);
	});

	test("formats a bracket group with three members", () => {
		expect(
			formatChainSteps([group("planner", "task-manager", "reviewer")]),
		).toBe("[planner, task-manager, reviewer]");
	});

	test("returns empty string for empty steps", () => {
		expect(formatChainSteps([])).toBe("");
	});
});

// ============================================================================
// isChainDslExpression
// ============================================================================

describe("isChainDslExpression", () => {
	describe("single stage names (true)", () => {
		test("plain agent name", () => {
			expect(isChainDslExpression("planner")).toBe(true);
		});

		test("hyphenated agent name", () => {
			expect(isChainDslExpression("task-manager")).toBe(true);
		});

		test("hyphenated two-part name", () => {
			expect(isChainDslExpression("quality-manager")).toBe(true);
		});

		test("qualified name with domain prefix", () => {
			expect(isChainDslExpression("coding/planner")).toBe(true);
		});

		test("qualified hyphenated name", () => {
			expect(isChainDslExpression("coding/task-manager")).toBe(true);
		});
	});

	describe("fanout expressions (true)", () => {
		test("fanout with count", () => {
			expect(isChainDslExpression("reviewer[2]")).toBe(true);
		});

		test("fanout with larger count", () => {
			expect(isChainDslExpression("worker[5]")).toBe(true);
		});
	});

	describe("bracket groups (true)", () => {
		test("two-member group", () => {
			expect(isChainDslExpression("[planner, reviewer]")).toBe(true);
		});

		test("three-member group", () => {
			expect(isChainDslExpression("[planner, task-manager, reviewer]")).toBe(
				true,
			);
		});
	});

	describe("arrow chains (true)", () => {
		test("two-step chain", () => {
			expect(isChainDslExpression("planner -> coordinator")).toBe(true);
		});

		test("chain with bracket group", () => {
			expect(isChainDslExpression("planner -> [task-manager, reviewer]")).toBe(
				true,
			);
		});

		test("chain with fanout", () => {
			expect(isChainDslExpression("planner -> reviewer[2]")).toBe(true);
		});

		test("three-step chain", () => {
			expect(
				isChainDslExpression("planner -> task-manager -> coordinator"),
			).toBe(true);
		});
	});

	describe("workflow names (false)", () => {
		test("compound workflow name with multiple hyphens", () => {
			expect(isChainDslExpression("plan-and-build")).toBe(false);
		});

		test("another compound workflow name", () => {
			expect(isChainDslExpression("plan-and-run")).toBe(false);
		});
	});

	describe("invalid inputs (false)", () => {
		test("empty string", () => {
			expect(isChainDslExpression("")).toBe(false);
		});

		test("whitespace only", () => {
			expect(isChainDslExpression("   ")).toBe(false);
		});
	});
});
