import { describe, expect, it } from "vitest";
import {
	applyReviewerCalibration,
	assessQualityReviewReport,
	indexedQualityReviewReport,
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

	it("does not let an index replace a visible finding", () => {
		const indexed = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
		});
		const changed = indexed.replace(
			"## Findings\n\n- None recorded.",
			"## Findings\n\n- F-001: high, error, src/auth.ts:4; reject missing token (input: empty token).",
		);
		expect(indexedQualityReviewReport(changed)).toBeUndefined();
	});

	it("caps PF-1 in an unindexed report without changing PF-10", () => {
		const markdown = renderQualityReviewReport({
			verdict: "not-ready",
			reason: "findings",
			findings: ["PF-1 P1 unsupported", "PF-10 P1 measured"],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const result = applyReviewerCalibration(
			markdown,
			["PF-1 P2 unsupported", "PF-10 P1 measured"],
			["Performance PF-1 lacked measured cost; capped at P2."],
		);
		expect(result).toContain("PF-1 P2 unsupported");
		expect(result).toContain("PF-10 P1 measured");
	});
});
