/**
 * Tests for chain-steps.ts
 * Covers type guards, prompt injection, DSL formatting, and DSL detection.
 */

import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { ResolvedAgentReference } from "../../lib/domains/bindings.ts";
import { runStage } from "../../lib/orchestration/chain-runner.ts";
import {
	formatChainSteps,
	getFirstExecutableStages,
	injectUserPrompt,
	isChainDslExpression,
	isChainStage,
	isParallelGroupStep,
	resolveStagePrompt,
} from "../../lib/orchestration/chain-steps.ts";
import {
	buildStagePrompt,
	deriveStagePromptPurpose,
} from "../../lib/orchestration/stage-prompts.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainStage,
	ChainStep,
	ParallelGroupStep,
	SpawnConfig,
} from "../../lib/orchestration/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

function stage(name: string, prompt?: string): ChainStage {
	return { name, loop: false, ...(prompt !== undefined && { prompt }) };
}

function resolvedStage(name: string, qualifiedId: string): ChainStage {
	const [role, agentId] = qualifiedId.split("/");
	if (!role || !agentId) throw new Error("Expected a qualified agent identity");
	const agentReference = {
		requested: { role, agentId, qualifiedId },
		resolved: { role, agentId, qualifiedId },
		binding: { role, domainId: role, source: "default" },
	} satisfies ResolvedAgentReference;
	return { name, loop: false, agentReference };
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
// Stage prompt purposes
// ============================================================================

describe("deriveStagePromptPurpose", () => {
	// @cosmo-behavior plan:chain-stage-context#B-002
	test("derives review purpose from resolved identity and zero-based strict topology order", () => {
		const planner = stage("planner");
		const planReviewer = stage("plan-reviewer");
		const revisingPlanner = stage("planner");
		const planCycle = [planner, planReviewer, revisingPlanner];

		expect(deriveStagePromptPurpose(planCycle, 0, planner)).toEqual({
			kind: "default",
		});
		expect(deriveStagePromptPurpose(planCycle, 1, planReviewer)).toEqual({
			kind: "plan-review",
			authorIdentity: "planner",
		});
		expect(deriveStagePromptPurpose(planCycle, 2, revisingPlanner)).toEqual({
			kind: "revision",
			reviewKind: "plan",
			authorIdentity: "planner",
		});

		const genericReviser = stage("worker");
		const genericCycle = [stage("worker"), stage("reviewer"), genericReviser];
		expect(deriveStagePromptPurpose(genericCycle, 2, genericReviser)).toEqual({
			kind: "revision",
			reviewKind: "generic",
			authorIdentity: "worker",
		});

		const suffixReviser = stage("planner");
		const suffixCycle = [
			stage("planner"),
			stage("behavior-reviewer"),
			suffixReviser,
		];
		expect(deriveStagePromptPurpose(suffixCycle, 2, suffixReviser)).toEqual({
			kind: "revision",
			reviewKind: "generic",
			authorIdentity: "planner",
		});

		const reviewerLookalikes = ["reviewer-summary", "review", "reviewerish"];
		for (const reviewerName of reviewerLookalikes) {
			const reviser = stage("planner");
			const steps = [stage("planner"), stage(reviewerName), reviser];
			expect(deriveStagePromptPurpose(steps, 2, reviser)).toEqual({
				kind: "default",
			});
		}

		const productPlanner = resolvedStage("planner", "product/planner");
		const crossDomain = [
			resolvedStage("planner", "coding/planner"),
			stage("plan-reviewer"),
			productPlanner,
		];
		expect(deriveStagePromptPurpose(crossDomain, 2, productPlanner)).toEqual({
			kind: "default",
		});
		const resolvedReviser = resolvedStage("product/planner", "coding/planner");
		const resolvedIdentityCycle = [
			resolvedStage("coding/planner", "coding/planner"),
			resolvedStage("review-summary", "coding/reviewer"),
			resolvedReviser,
		];
		expect(
			deriveStagePromptPurpose(resolvedIdentityCycle, 2, resolvedReviser),
		).toEqual({
			kind: "revision",
			reviewKind: "generic",
			authorIdentity: "coding/planner",
		});

		const staleReviewerReviser = stage("planner");
		const staleReviewer = [
			stage("planner"),
			stage("reviewer"),
			stage("planner"),
			staleReviewerReviser,
		];
		expect(
			deriveStagePromptPurpose(staleReviewer, 3, staleReviewerReviser),
		).toEqual({ kind: "default" });

		const priorUnordered: ChainStep[] = [
			group("planner", "plan-reviewer"),
			stage("planner"),
		];
		expect(
			deriveStagePromptPurpose(
				priorUnordered,
				1,
				priorUnordered[1] as ChainStage,
			),
		).toEqual({ kind: "default" });
		const unorderedReviser = stage("planner");
		const currentGroup: ParallelGroupStep = {
			kind: "parallel",
			stages: [stage("plan-reviewer"), unorderedReviser],
			syntax: { kind: "group" },
		};
		const currentUnordered: ChainStep[] = [stage("planner"), currentGroup];
		expect(
			deriveStagePromptPurpose(currentUnordered, 1, unorderedReviser),
		).toEqual({ kind: "default" });

		for (const reviewers of [
			[stage("plan-reviewer"), stage("behavior-reviewer")],
			[stage("behavior-reviewer"), stage("plan-reviewer")],
		]) {
			const steps: ChainStep[] = [
				stage("planner"),
				{
					kind: "parallel",
					stages: reviewers as [ChainStage, ChainStage],
					syntax: { kind: "group" },
				},
				stage("planner"),
			];
			expect(
				deriveStagePromptPurpose(steps, 2, steps[2] as ChainStage),
			).toEqual({
				kind: "revision",
				reviewKind: "plan",
				authorIdentity: "planner",
			});
		}

		const taskGuardReviewer = stage("plan-reviewer");
		const taskGuard = [taskGuardReviewer, stage("task-manager")];
		expect(deriveStagePromptPurpose(taskGuard, 0, taskGuardReviewer)).toEqual({
			kind: "plan-review",
		});
		const sameStepTaskGuard: ChainStep[] = [
			group("plan-reviewer", "task-manager"),
		];
		expect(
			deriveStagePromptPurpose(
				sameStepTaskGuard,
				0,
				(sameStepTaskGuard[0] as ParallelGroupStep).stages[0],
			),
		).toEqual({ kind: "plan-review" });

		expect(
			deriveStagePromptPurpose(
				[stage("plan-reviewer")],
				0,
				stage("plan-reviewer"),
			),
		).toEqual({ kind: "default" });
		expect(
			deriveStagePromptPurpose(
				[stage("reviewer"), stage("task-manager")],
				0,
				stage("reviewer"),
			),
		).toEqual({ kind: "default" });
		expect(
			deriveStagePromptPurpose(
				[stage("task-manager"), stage("plan-reviewer")],
				1,
				stage("plan-reviewer"),
			),
		).toEqual({ kind: "default" });
	});

	// @cosmo-behavior plan:chain-stage-context#B-004
	test("keeps non-cycle prompts and step-zero injection byte-identical", async () => {
		const expectedDefaults = new Map([
			["planner", "Analyze the project and design an implementation plan."],
			[
				"task-manager",
				"Review the plan and create atomic implementation tasks.",
			],
			["coordinator", "Check for ready tasks and delegate them to workers."],
			["worker", "Pick up the next ready task and implement it."],
			[
				"quality-manager",
				"Run quality gates, review the diff against main, and orchestrate fixes until merge-ready.",
			],
			[
				"integration-verifier",
				"Read the active plan, verify implementation against declared contracts, and write missions/plans/<slug>/integration-report.md.",
			],
			[
				"reviewer",
				"Review the current branch changes against main and write actionable findings.",
			],
			[
				"plan-reviewer",
				"Review the active plan and verify its claims against the codebase. Write structured findings.",
			],
			[
				"fixer",
				"Apply targeted fixes for review findings and verify they pass checks.",
			],
			["refactorer", "Improve code structure while keeping all tests green."],
		]);
		for (const [role, expected] of expectedDefaults) {
			expect(
				buildStagePrompt(stage(role), { purpose: { kind: "default" } }),
			).toBe(expected);
		}

		const unchangedChains: ChainStep[][] = [
			[
				stage("task-manager"),
				stage("coordinator"),
				stage("integration-verifier"),
				stage("quality-manager"),
			],
			[stage("quality-manager")],
			[
				stage("planner"),
				stage("task-manager"),
				stage("coordinator"),
				stage("integration-verifier"),
				stage("quality-manager"),
			],
		];
		for (const steps of unchangedChains) {
			for (const [topologyIndex, step] of steps.entries()) {
				const currentStage = step as ChainStage;
				expect(
					deriveStagePromptPurpose(steps, topologyIndex, currentStage),
				).toEqual({ kind: "default" });
				expect(buildStagePrompt(currentStage)).toBe(
					expectedDefaults.get(currentStage.name),
				);
			}
		}

		const qualifiedNonRepeat = [
			resolvedStage("planner", "coding/planner"),
			stage("plan-reviewer"),
			resolvedStage("planner", "product/planner"),
		];
		for (const [topologyIndex, currentStage] of qualifiedNonRepeat.entries()) {
			expect(
				deriveStagePromptPurpose(
					qualifiedNonRepeat,
					topologyIndex,
					currentStage,
				),
			).toEqual({ kind: "default" });
		}

		const unordered = group("planner", "plan-reviewer");
		for (const currentStage of unordered.stages) {
			expect(deriveStagePromptPurpose([unordered], 0, currentStage)).toEqual({
				kind: "default",
			});
		}

		const injectedPlanner = stage("planner");
		const injectedTaskManager = stage("task-manager");
		const injected = [injectedPlanner, injectedTaskManager];
		injectUserPrompt(injected, "build auth");
		expect(buildStagePrompt(injectedPlanner)).toBe(
			"Analyze the project and design an implementation plan.\n\nUser request: build auth",
		);
		expect(buildStagePrompt(injectedTaskManager)).toBe(
			"Review the plan and create atomic implementation tasks.",
		);
		expect(injectedTaskManager.prompt).toBeUndefined();

		const injectedGroup = group("planner", "reviewer");
		injectUserPrompt([injectedGroup, stage("task-manager")], "secure it");
		expect(injectedGroup.stages.map((item) => item.prompt)).toEqual([
			"User request: secure it",
			"User request: secure it",
		]);

		let directRunPrompt: string | undefined;
		const directStage = stage("planner");
		const directSpawner: AgentSpawner = {
			async spawn(config: SpawnConfig) {
				directRunPrompt = config.prompt;
				return { success: true, sessionId: "test", messages: [] };
			},
			dispose() {},
		};
		const directConfig: ChainConfig = {
			steps: [directStage],
			projectRoot: "/tmp/cosmonauts-stage-prompt-test",
			registry: new AgentRegistry([plannerDefinition()]),
		};
		await runStage(directStage, directConfig, directSpawner);
		expect(directRunPrompt).toBe(
			"Analyze the project and design an implementation plan.",
		);

		expect(
			buildStagePrompt(stage("planner", "Follow the custom workflow."), {
				purpose: {
					kind: "revision",
					reviewKind: "plan",
					authorIdentity: "coding/planner",
				},
			}),
		).toBe(
			'Follow the custom workflow.\n\nRevision purpose: Revise the active plan produced by the earlier "coding/planner" stage. Read the highest-numbered plan-review round, address every high- and medium-severity finding, and do not start a new plan. End with exactly one report line: COSMO_REVIEW_REVISION: {"planSlug":"<slug>","reviewRound":<positive integer>,"status":"addressed"}, or report status "unaddressed" with a nonempty reason.',
		);
		expect(
			buildStagePrompt(stage("worker", "Follow the custom workflow."), {
				purpose: {
					kind: "revision",
					reviewKind: "generic",
					authorIdentity: "coding/worker",
				},
			}),
		).toBe(
			'Follow the custom workflow.\n\nRevision purpose: Revise the work produced by the earlier "coding/worker" stage in response to the intervening review. Do not start the work again from scratch.',
		);
		expect(
			buildStagePrompt(stage("plan-reviewer", "Follow the custom workflow."), {
				purpose: { kind: "plan-review", authorIdentity: "coding/planner" },
			}),
		).toBe(
			'Follow the custom workflow.\n\nPlan-review purpose: End with exactly one report line: COSMO_PLAN_REVIEW: {"planSlug":"<slug>","reviewRound":<positive integer>}.',
		);

		expect(
			buildStagePrompt(stage("coordinator"), {
				completionLabel: "plan:chain-stage-context",
				purpose: { kind: "default" },
			}),
		).toBe(
			'Check for ready tasks and delegate them to workers.\n\nScope constraint: Operate only on tasks labeled "plan:chain-stage-context". Filter all task selection to this label and do not modify tasks without it.',
		);
	});
});

function plannerDefinition(): AgentDefinition {
	return {
		id: "planner",
		description: "Test planner",
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain: "coding",
	};
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
