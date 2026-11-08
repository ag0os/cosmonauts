import {
	launchQualityReview,
	qualityReviewPlacement,
	qualityReviewPlanSlug,
} from "./quality-review-launch.ts";
import type { QualityReviewRunOptions } from "./quality-review-run.ts";
import type { ChainConfig, ChainResult } from "./types.ts";

/** Refuse a Quality Manager stage that cannot run terminally. */
export async function misplacedQualityReviewResult(
	config: ChainConfig,
	hostOptions?: Pick<QualityReviewRunOptions, "execute">,
): Promise<ChainResult | undefined> {
	if (
		qualityReviewPlacement({
			steps: config.steps,
			registry: config.registry,
			domainContext: config.domainContext,
		}) !== "refused"
	)
		return undefined;
	const refusal = await launchQualityReview({
		...hostOptions,
		projectRoot: config.projectRoot,
		planSlug: qualityReviewPlanSlug(config),
		refusalReason: "Quality Manager must be a terminal sequential stage.",
	});
	return {
		success: false,
		stageResults: [],
		totalDurationMs: 0,
		errors: [refusal.stepResult.summary],
		run: refusal.ref,
	};
}
