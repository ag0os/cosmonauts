import { describe, expect, it } from "vitest";
import { calibrateReviewerFindings } from "../../lib/orchestration/quality-review-models.ts";
import {
	applyReviewerCalibration,
	assessQualityReviewReport,
	indexedQualityReviewReport,
	qualityReviewFindingLines,
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

	it.each([
		true,
		false,
	])("rewrites every line of a capped entry (indexed: %s)", (indexed) => {
		const entry =
			"PF-2\n  priority: P1\n  file: lib/a.ts:12\n  fix: bound the scan";
		const rendered = renderQualityReviewReport({
			verdict: "not-ready",
			reason: "finding",
			findings: [entry],
		});
		const markdown = indexed
			? rendered
			: rendered.replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const calibrated = calibrateReviewerFindings({
			materials: "no measurement",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-2\n  priority: P2" },
			],
			findings: qualityReviewFindingLines(markdown),
		});
		const amended = applyReviewerCalibration(
			markdown,
			calibrated.findings,
			calibrated.issues,
		);
		expect(amended).toContain(
			"- PF-2\n  priority: P2\n  file: lib/a.ts:12\n  fix: bound the scan",
		);
		expect(amended).not.toContain("priority: P1");
	});

	it.each([
		"$$",
		"$&",
		"$`",
		"$'",
	])("rewrites a capped entry with literal %s", (token) => {
		const original = `PF-2 P1 costs ${token} per call`;
		const markdown = renderQualityReviewReport({
			verdict: "not-ready",
			reason: "finding",
			findings: [original],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const amended = applyReviewerCalibration(
			markdown,
			[`PF-2 P2 costs ${token} per call`],
			["Performance PF-2 capped at P2."],
		);
		expect(amended).toContain(`- PF-2 P2 costs ${token} per call`);
		expect(amended).not.toContain(`- ${original}`);
	});

	it("caps two Findings copies and an observation without rewriting a Gates duplicate", () => {
		const original = "PF-1 P0 slow path";
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
			gates: [original],
			findings: [original, original],
			observations: [original],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const amended = applyReviewerCalibration(
			markdown,
			["PF-1 P2 slow path", "PF-1 P2 slow path"],
			["Performance PF-1 capped at P2."],
			["PF-1 P2 slow path"],
		);
		expect(amended.match(/PF-1 P2 slow path/g)).toHaveLength(3);
		expect(amended).toContain("## Gates\n\n- PF-1 P0 slow path");
	});

	it("reports an irregular bullet whose unsupported priority cannot be capped in place", () => {
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
			findings: ["PF-1 P1 slow"],
		})
			.replace("- PF-1 P1 slow", "-  PF-1 P1 slow")
			.replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const unreplaced: string[] = [];
		const amended = applyReviewerCalibration(
			markdown,
			["PF-1 P2 slow"],
			["Performance PF-1 capped at P2."],
			[],
			unreplaced,
		);
		expect(unreplaced).toEqual(["PF-1 P1 slow"]);
		expect(amended).toContain("-  PF-1 P1 slow");
	});
});
