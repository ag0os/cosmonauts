import { unqualifyRole } from "../agents/qualified-role.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { resolveStagePrompt } from "./chain-steps.ts";
import type { ChainStage } from "./types.ts";

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

	// When loop completion is label-scoped, loop coordinators must process only
	// that subset to avoid touching unrelated ready tasks.
	if (unqualifyRole(stage.name) === "coordinator" && options.completionLabel) {
		return `${basePrompt}\n\nScope constraint: Operate only on tasks labeled "${options.completionLabel}". Filter all task selection to this label and do not modify tasks without it.`;
	}

	return basePrompt;
}
