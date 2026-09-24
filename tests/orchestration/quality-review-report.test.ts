import { describe, expect, it } from "vitest";
import {
	assessQualityReviewReport,
	renderQualityReviewReport,
} from "../../lib/orchestration/quality-review-report.ts";

describe("quality review reports", () => {
	it("preserves a verdict when only the index is missing", () => {
		const markdown = renderQualityReviewReport({
			verdict: "not-ready",
			reason: "finding",
		});
		const withoutIndex = markdown.replace(
			/<!-- COSMO_QM_REPORT[\s\S]*?-->/,
			"",
		);
		expect(assessQualityReviewReport(withoutIndex).verdict).toBe("not-ready");
		expect(assessQualityReviewReport(withoutIndex).indexAvailable).toBe(false);
	});

	it("fails integrity when a required section is missing", () => {
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
		});
		expect(
			assessQualityReviewReport(
				markdown.replace("## Human decisions", "## Omitted"),
			).verdict,
		).toBe("failed");
	});

	it("treats incomplete or duplicate indexes as unavailable", () => {
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
		});
		const incomplete = markdown.replace(
			/<!-- COSMO_QM_REPORT[\s\S]*?-->/,
			'<!-- COSMO_QM_REPORT {"verdict":"ready"} -->',
		);
		expect(assessQualityReviewReport(incomplete)).toMatchObject({
			verdict: "ready",
			indexAvailable: false,
		});
		expect(
			assessQualityReviewReport(
				`${markdown}\n${markdown.match(/<!-- COSMO_QM_REPORT[\s\S]*?-->/)?.[0]}`,
			),
		).toMatchObject({ verdict: "ready", indexAvailable: false });
	});
});
