import { unqualifyRole } from "../agents/qualified-role.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { isParallelGroupStep, resolveStagePrompt } from "./chain-steps.ts";
import type { PlanReviewTarget } from "./review-revision.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	REVIEW_REVISION_REPORT_TOKEN,
} from "./review-revision.ts";
import type { ChainStage, ChainStep } from "./types.ts";

/** Default operational prompts for chain stages (not agent identity prompts). */
const DEFAULT_STAGE_PROMPTS: Record<string, string> = {
	planner: "Analyze the project and design an implementation plan.",
	"task-manager": "Review the plan and create atomic implementation tasks.",
	coordinator: "Check for ready tasks and delegate them to workers.",
	worker: "Pick up the next ready task and implement it.",
	"quality-manager":
		"Run quality gates, review the diff against main, and orchestrate fixes until merge-ready.",
	"integration-verifier":
		"Read the active plan, verify implementation against declared contracts, and write missions/plans/<slug>/integration-report.md.",
	reviewer:
		"Review the current branch changes against main and write actionable findings.",
	"plan-reviewer":
		"Review the active plan and verify its claims against the codebase. Write structured findings.",
	fixer:
		"Apply targeted fixes for review findings and verify they pass checks.",
	refactorer: "Improve code structure while keeping all tests green.",
};

const DEFAULT_PROMPT = "Execute your assigned role.";

export interface StagePromptOptions {
	completionLabel?: string;
	purpose?: StagePromptPurpose;
}

export type StagePromptPurpose =
	| { kind: "default" }
	| { kind: "plan-review"; authorIdentity?: string }
	| {
			kind: "revision";
			reviewKind: "generic" | "plan";
			authorIdentity: string;
	  };

export function deriveStagePromptPurpose(
	steps: readonly ChainStep[],
	topologyIndex: number,
	stage: ChainStage,
): StagePromptPurpose {
	const role = unqualifyRole(stageIdentity(stage));
	if (role === "plan-reviewer") {
		const authorIdentity = findRepeatedAuthorAcrossIndex(steps, topologyIndex);
		if (authorIdentity !== undefined) {
			return { kind: "plan-review", authorIdentity };
		}
		if (hasTaskManagerAtOrAfter(steps, topologyIndex)) {
			return { kind: "plan-review" };
		}
		return { kind: "default" };
	}

	const authorIdentity = stageIdentity(stage);
	const priorAuthorIndex = findPriorIdentityIndex(
		steps,
		topologyIndex,
		authorIdentity,
	);
	if (priorAuthorIndex === undefined) return { kind: "default" };

	const reviewers = steps
		.slice(priorAuthorIndex + 1, topologyIndex)
		.flatMap(stagesInStep)
		.map((candidate) => unqualifyRole(stageIdentity(candidate)))
		.filter(isReviewerRole);
	if (reviewers.length === 0) return { kind: "default" };

	return {
		kind: "revision",
		reviewKind: reviewers.includes("plan-reviewer") ? "plan" : "generic",
		authorIdentity,
	};
}

export function requiresPlanReviewTarget(
	steps: readonly ChainStep[],
	topologyIndex: number,
	stage: ChainStage,
): boolean {
	if (unqualifyRole(stageIdentity(stage)) !== "task-manager") return false;
	return steps
		.slice(0, topologyIndex + 1)
		.flatMap(stagesInStep)
		.some(
			(candidate) =>
				unqualifyRole(stageIdentity(candidate)) === "plan-reviewer",
		);
}

function stageIdentity(stage: ChainStage): string {
	return stage.agentReference?.resolved.qualifiedId ?? stage.name;
}

function stagesInStep(step: ChainStep): readonly ChainStage[] {
	return isParallelGroupStep(step) ? step.stages : [step];
}

function findPriorIdentityIndex(
	steps: readonly ChainStep[],
	topologyIndex: number,
	identity: string,
): number | undefined {
	for (let index = topologyIndex - 1; index >= 0; index--) {
		const step = steps[index];
		if (
			step &&
			stagesInStep(step).some((item) => stageIdentity(item) === identity)
		) {
			return index;
		}
	}
	return undefined;
}

function findRepeatedAuthorAcrossIndex(
	steps: readonly ChainStep[],
	topologyIndex: number,
): string | undefined {
	const priorIdentities = new Set(
		steps.slice(0, topologyIndex).flatMap(stagesInStep).map(stageIdentity),
	);
	for (const step of steps.slice(topologyIndex + 1)) {
		for (const candidate of stagesInStep(step)) {
			const identity = stageIdentity(candidate);
			if (priorIdentities.has(identity)) return identity;
		}
	}
	return undefined;
}

function hasTaskManagerAtOrAfter(
	steps: readonly ChainStep[],
	topologyIndex: number,
): boolean {
	return steps
		.slice(topologyIndex)
		.flatMap(stagesInStep)
		.some(
			(candidate) => unqualifyRole(stageIdentity(candidate)) === "task-manager",
		);
}

function isReviewerRole(role: string): boolean {
	return role === "reviewer" || role.endsWith("-reviewer");
}

export interface PlanSlugOptions {
	completionLabel?: string;
	planSlug?: string;
}

/**
 * Derive planSlug from a completionLabel that follows the `plan:<slug>` pattern.
 * Returns undefined when completionLabel is absent or uses a different format.
 * Throws when a derived slug fails plan slug validation.
 */
export function derivePlanSlug(completionLabel?: string): string | undefined {
	if (!completionLabel?.startsWith("plan:")) return undefined;
	const planSlug = completionLabel.slice("plan:".length);
	if (!planSlug) return undefined;
	validateSlug(planSlug);
	return planSlug;
}

export function resolvePlanSlug(options: PlanSlugOptions): string | undefined {
	if (options.planSlug) {
		validateSlug(options.planSlug);
		return options.planSlug;
	}
	return derivePlanSlug(options.completionLabel);
}

export function getDefaultStagePrompt(role: string): string {
	return DEFAULT_STAGE_PROMPTS[unqualifyRole(role)] ?? DEFAULT_PROMPT;
}

export function buildStagePrompt(
	stage: ChainStage,
	options: StagePromptOptions = {},
): string {
	const basePrompt = resolveStagePrompt(
		stage.prompt,
		getDefaultStagePrompt(stage.name),
	);
	const purposePrompt = appendPurposeInstruction(
		basePrompt,
		options.purpose ?? { kind: "default" },
	);

	// When loop completion is label-scoped, loop coordinators must process only
	// that subset to avoid touching unrelated ready tasks.
	if (unqualifyRole(stage.name) === "coordinator" && options.completionLabel) {
		return `${purposePrompt}\n\nScope constraint: Operate only on tasks labeled "${options.completionLabel}". Filter all task selection to this label and do not modify tasks without it.`;
	}

	return purposePrompt;
}

function appendPurposeInstruction(
	prompt: string,
	purpose: StagePromptPurpose,
): string {
	switch (purpose.kind) {
		case "default":
			return prompt;
		case "plan-review":
			return `${prompt}\n\nPlan-review purpose: End with exactly one report line: ${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>}.`;
		case "revision":
			return purpose.reviewKind === "plan"
				? `${prompt}\n\nRevision purpose: Revise the active plan produced by the earlier "${purpose.authorIdentity}" stage. Read the highest-numbered plan-review round, address every high- and medium-severity finding, and do not start a new plan. End with exactly one report line: ${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>,"status":"addressed"}, or report status "unaddressed" with a nonempty reason.`
				: `${prompt}\n\nRevision purpose: Revise the work produced by the earlier "${purpose.authorIdentity}" stage in response to the intervening review. Do not start the work again from scratch.`;
	}
}

export function appendBoundReviewTarget(
	prompt: string,
	target?: PlanReviewTarget,
): string {
	if (!target) return prompt;
	const boundedTarget = {
		planSlug: target.planSlug,
		reviewRound: target.reviewRound,
	};
	return `${prompt}\n\nBound plan-review target: ${JSON.stringify(boundedTarget)}.`;
}

export function shouldAppendBoundReviewTarget(
	purpose: StagePromptPurpose,
	requiresReviewTarget: boolean,
): boolean {
	return (
		(purpose.kind === "revision" && purpose.reviewKind === "plan") ||
		requiresReviewTarget
	);
}
