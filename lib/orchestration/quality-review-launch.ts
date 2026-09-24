import type { AgentRegistry } from "../agents/resolver.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import {
	type QualityReviewRunOptions,
	runQualityReview,
} from "./quality-review-run.ts";
import { derivePlanSlug } from "./stage-prompts.ts";
import type { ChainStep } from "./types.ts";

export const QUALITY_REVIEW_ROLE = "coding/quality-manager";

/** A conflicting or malformed context cannot own a tracked plan summary. */
export function qualityReviewPlanSlug(options: {
	completionLabel?: string;
	planSlug?: string;
}): string | undefined {
	let fromLabel: string | undefined;
	try {
		fromLabel = derivePlanSlug(options.completionLabel);
	} catch {
		return undefined;
	}
	const fromSession =
		options.planSlug && /^[a-z0-9][a-z0-9-]*$/.test(options.planSlug)
			? options.planSlug
			: undefined;
	if (options.planSlug && !fromSession) return undefined;
	return fromLabel && fromSession && fromLabel !== fromSession
		? undefined
		: (fromLabel ?? fromSession);
}

/** The registry, not definition metadata or caller text, decides the target. */
export function isQualityReviewReference(
	reference: ResolvedAgentReference | undefined,
): boolean {
	return reference?.resolved.qualifiedId === QUALITY_REVIEW_ROLE;
}

export function qualityReviewPlacement(options: {
	steps: readonly ChainStep[];
	registry: AgentRegistry;
	domainContext?: string;
}): "absent" | "terminal" | "refused" {
	let terminal = false;
	for (const [index, step] of options.steps.entries()) {
		const stages = isParallelGroupStep(step) ? step.stages : [step];
		for (const stage of stages) {
			const resolved = options.registry.resolveReference(
				stage.name,
				options.domainContext,
			)?.reference;
			const currentIsQualityReview = isQualityReviewReference(resolved);
			const suppliedIsQualityReview = isQualityReviewReference(
				stage.agentReference,
			);
			if (
				currentIsQualityReview !== suppliedIsQualityReview &&
				stage.agentReference
			)
				return "refused";
			if (!currentIsQualityReview) continue;
			if (
				isParallelGroupStep(step) ||
				index !== options.steps.length - 1 ||
				stage.loop
			)
				return "refused";
			terminal = true;
		}
	}
	return terminal ? "terminal" : "absent";
}

/** Shared framework launch boundary for CLI, spawn and both chain runners. */
export const launchQualityReview = runQualityReview;
export type { QualityReviewRunOptions };
