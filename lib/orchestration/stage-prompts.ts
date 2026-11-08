import { validateSlug } from "../plans/plan-manager.ts";
import type { PlanReviewTarget } from "./review-revision.ts";
import type { StagePromptPurpose } from "./types.ts";

export type { StagePromptPurpose } from "./types.ts";

interface PlanSlugOptions {
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
	return purpose.kind === "plan-revision" || requiresReviewTarget;
}
