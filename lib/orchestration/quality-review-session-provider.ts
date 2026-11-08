import { qualifyAgentId } from "../agents/runtime-identity.ts";
import type { SessionPolicyProvider } from "../agents/session-policy.ts";
import { qualityReviewPolicyFor } from "./quality-review-profile.ts";
import { qualityReviewSpawnPolicy } from "./quality-review-spawn-policy.ts";

export const qualityReviewSessionPolicies: SessionPolicyProvider = {
	forAgent: qualityReviewPolicyFor,
	spawnPolicy: () => qualityReviewSpawnPolicy(),
	launchTarget: (reference, options) => {
		if (reference.resolved.qualifiedId !== "coding/quality-manager")
			return undefined;
		return import("./quality-review-launch.ts").then(
			async ({ launchQualityReview }) => {
				const review = await launchQualityReview(options);
				return {
					outcome:
						review.stepResult.outcome === "success"
							? ("success" as const)
							: ("failed" as const),
					summary: `QM run ${review.ref.runId}: ${review.stepResult.summary}`,
				};
			},
		);
	},
	interactiveDenial: (def) =>
		qualifyAgentId(def.id, def.domain) === "coding/quality-manager"
			? "Interactive /agent quality-manager is unavailable: use the quality review launcher to create a private snapshot."
			: undefined,
};
