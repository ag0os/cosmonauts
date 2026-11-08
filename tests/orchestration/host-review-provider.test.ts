import { expect, test, vi } from "vitest";
import type { ResolvedAgentReference } from "../../lib/domains/bindings.ts";
import { qualityReviewSessionPolicies } from "../../lib/orchestration/quality-review-session-provider.ts";

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("../../lib/orchestration/quality-review-launch.ts", () => ({
	launchQualityReview: mocks.launch,
}));
function reference(id: string): ResolvedAgentReference {
	return {
		requested: {
			role: "alias",
			agentId: "manager",
			qualifiedId: "alias/manager",
		},
		resolved: { role: "coding", agentId: id, qualifiedId: `coding/${id}` },
		binding: { role: "alias", domainId: "coding", source: "default" },
	};
}

for (const outcome of ["success", "cancelled"]) {
	test(`delegated manager launch preserves its summary and reports ${outcome}`, async () => {
		mocks.launch.mockResolvedValue({
			ref: { runId: "captured" },
			stepResult: { outcome, summary: "reviewed" },
		});
		const options = {
			projectRoot: "/consumer",
			operatorNote: "review",
			planSlug: "plan",
			signal: new AbortController().signal,
		};
		await expect(
			qualityReviewSessionPolicies.launchTarget?.(
				reference("quality-manager"),
				options,
			),
		).resolves.toEqual({
			outcome: outcome === "success" ? "success" : "failed",
			summary: "QM run captured: reviewed",
		});
		expect(mocks.launch).toHaveBeenCalledWith(options);
	});
}
test("the host delegates only the actual resolved manager and supplies missing-context admission", () => {
	expect(
		qualityReviewSessionPolicies.launchTarget?.(reference("reviewer"), {
			projectRoot: "/consumer",
			operatorNote: "review",
		}),
	).toBeUndefined();
	expect(
		qualityReviewSessionPolicies.spawnPolicy?.("unbound").authorize({
			callerRole: "coding/quality-manager",
			resolvedTargetRole: "coding/reviewer",
			prompt: "review",
		}),
	).toBe("quality review context missing");
});
