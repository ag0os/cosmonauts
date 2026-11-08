// Content acceptance retained until the corresponding deletion PR.
import {
	buildStagePrompt,
	deriveStagePromptPurpose,
} from "../../bundled/coding/chain-prompts.ts";
import { withCodingChain } from "../helpers/content-chain.ts";
/**
 * Tests for chain-steps.ts
 * Covers type guards, prompt injection, DSL formatting, and DSL detection.
 */

import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { ResolvedAgentReference } from "../../lib/domains/bindings.ts";
import { runStage } from "../../lib/orchestration/chain-runner.ts";
import { injectUserPrompt } from "../../lib/orchestration/chain-steps.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	REVIEW_REVISION_REPORT_TOKEN,
} from "../../lib/orchestration/review-revision.ts";
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

// ============================================================================
// Stage prompt purposes
// ============================================================================

describe("deriveStagePromptPurpose", () => {
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
				"Assess quality gates and the reviewed diff; produce a durable findings report. Review only: no fixes, commits, or plan completion.",
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
		await runStage(directStage, withCodingChain(directConfig), directSpawner);
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
			`Follow the custom workflow.\n\nRevision purpose: Revise the active plan produced by the earlier "coding/planner" stage. Read the highest-numbered plan-review round, address every high- and medium-severity finding, and do not start a new plan. End with exactly one report line: ${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>,"status":"addressed"}, or report status "unaddressed" with a nonempty reason.`,
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
			`Follow the custom workflow.\n\nPlan-review purpose: End with exactly one report line: ${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>}.`,
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

// ============================================================================
// getFirstExecutableStages
// ============================================================================

// ============================================================================
// injectUserPrompt
// ============================================================================

// ============================================================================
// resolveStagePrompt
// ============================================================================

// ============================================================================
// formatChainSteps
// ============================================================================

// ============================================================================
// Unnamed input topology parsing
// ============================================================================
