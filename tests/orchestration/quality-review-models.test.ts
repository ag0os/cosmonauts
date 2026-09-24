import { describe, expect, it } from "vitest";
import {
	assessReviewerDiversity,
	calibrateReviewerFindings,
	modelFamily,
	qualityReviewPanelModel,
} from "../../lib/orchestration/quality-review-models.ts";
import {
	qualityReviewFindingLines,
	renderQualityReviewReport,
} from "../../lib/orchestration/quality-review-report.ts";

describe("quality review model policy", () => {
	it("normalizes shipped aliases and project extensions", () => {
		expect(modelFamily("openai-codex")).toBe("openai");
		expect(modelFamily("custom", { anthropic: ["custom"] })).toBe("anthropic");
	});

	it("overrides only the always-present generalist", () => {
		expect(qualityReviewPanelModel("coding/reviewer", "anthropic/model")).toBe(
			"anthropic/model",
		);
		expect(
			qualityReviewPanelModel("coding/security-reviewer", "anthropic/model"),
		).toBeUndefined();
	});

	it("accepts a different observed generalist family", () => {
		expect(
			assessReviewerDiversity({
				implementer: { provider: "openai-codex", id: "worker" },
				configured: "anthropic/reviewer",
				reviewers: [
					{
						lens: "reviewer",
						model: { provider: "anthropic", id: "reviewer" },
					},
				],
			}).issue,
		).toBeUndefined();
	});

	it.each([
		["substituted", { provider: "anthropic", id: "other" }],
		["unresolvable", { provider: "unknown", id: "reviewer" }],
	])("rejects %s generalist", (_name, model) => {
		expect(
			assessReviewerDiversity({
				implementer: { provider: "openai-codex", id: "worker" },
				configured: "anthropic/reviewer",
				reviewers: [{ lens: "reviewer", model }],
			}).issue,
		).toBeDefined();
	});

	it("rejects an observed generalist that matches its configured model but shares the implementer family", () => {
		expect(
			assessReviewerDiversity({
				implementer: { provider: "openai-codex", id: "worker" },
				configured: "openai/reviewer",
				reviewers: [
					{ lens: "reviewer", model: { provider: "openai", id: "reviewer" } },
				],
			}).issue,
		).toContain("share family openai");
	});

	it("reports an absent generalist as missing", () => {
		expect(
			assessReviewerDiversity({
				implementer: { provider: "openai", id: "worker" },
				configured: "anthropic/reviewer",
				reviewers: [],
			}).issue,
		).toContain("missing");
	});

	it("reports an unconfigured reviewer model as a human decision", () => {
		expect(
			assessReviewerDiversity({
				implementer: { provider: "openai", id: "worker" },
				reviewers: [],
			}).humanItem,
		).toContain("qualityReview.diverseReviewerModel");
	});

	it("demotes a performance P1 without cost cited from materials", () => {
		const result = calibrateReviewerFindings({
			materials: "function grow(items) { return items.map(x => x); }",
			reviewers: [
				{
					lens: "performance-reviewer",
					text: "- id: PF-1\n  priority: P1\n  measuredCost: assertion only",
				},
			],
			findings: ["PF-1 priority: P1 costly loop"],
		});
		expect(result.findings).toEqual(["PF-1 priority: P2 costly loop"]);
		expect(result.issues).toContain(
			"Performance PF-1 lacked measured or reproduced cost cited from captured materials; capped at P2.",
		);
	});

	it("demotes a report that upgrades an unsupported performance finding", () => {
		const result = calibrateReviewerFindings({
			materials: "No benchmark is present.",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-2\n  priority: P2" },
			],
			findings: ["PF-2 priority: P1"],
		});
		expect(result.findings).toEqual(["PF-2 priority: P2"]);
	});

	it("requires independent evidence for a closed finding", () => {
		const result = calibrateReviewerFindings({
			materials: "fixed in lib/a.ts",
			reviewers: [
				{
					lens: "reviewer",
					text: "- id: F-1\n  status: resolved\n  evidence: fixed in lib/a.ts",
				},
			],
			findings: [],
		});
		expect(result.issues[0]).toContain("F-1");
	});

	it("keeps finding IDs distinct when capping priority", () => {
		const result = calibrateReviewerFindings({
			materials: "Input 100 items measured 20 ms in benchmark run.",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-1\n  priority: P1" },
				{
					lens: "performance-reviewer",
					text: "- id: PF-10\n  priority: P1\n  measuredCost: Input 100 items measured 20 ms in benchmark run.",
				},
			],
			findings: ["PF-1 P1 slow", "PF-10 P1 measured"],
		});
		expect(result.findings).toContain("PF-10 P1 measured");
		expect(result.findings).toContain("PF-1 P2 slow");
	});

	it.each([
		"for (let i = 0; i < 10; i++)",
		"const BATCH_SIZE = 100000;",
	])("rejects a numeric code quote as measured cost: %s", (quote) => {
		const result = calibrateReviewerFindings({
			materials: quote,
			reviewers: [
				{
					lens: "performance-reviewer",
					text: `- id: PF-1\n  priority: P1\n  measuredCost: ${quote}`,
				},
			],
			findings: ["PF-1 P1 costly"],
		});
		expect(result.findings).toContain("PF-1 P2 costly");
	});

	it("accepts a measured quantity and cost unit cited from materials", () => {
		const quote = "At 100 items, benchmark measured 20 ms per operation.";
		const result = calibrateReviewerFindings({
			materials: quote,
			reviewers: [
				{
					lens: "performance-reviewer",
					text: `- id: PF-1\n  priority: P1\n  measuredCost: ${quote}`,
				},
			],
			findings: ["PF-1 P1 costly"],
		});
		expect(result.findings).toContain("PF-1 P1 costly");
	});

	it("blocks an unrecognized P1 and carries an omitted reviewer finding", () => {
		const result = calibrateReviewerFindings({
			materials: "no measurement",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-2\n  priority: P2" },
			],
			findings: ["PF-99 P1 renamed"],
		});
		expect(result.issues.join(" ")).toContain("PF-99");
		expect(result.findings.join(" ")).toContain("PF-2");
	});

	it("does not accept a same-lens dismissal in QM synthesis", () => {
		const result = calibrateReviewerFindings({
			materials: "fixed in lib/a.ts",
			reviewers: [
				{
					lens: "reviewer",
					text: "- id: F-1\n  priority: P2\n  closureEvidence: fixed in lib/a.ts",
				},
			],
			findings: ["F-1 dismissed by reviewer"],
		});
		expect(result.issues.join(" ")).toContain("F-1");
	});

	it("calibrates a continuation priority without losing finding details", () => {
		const entry =
			"PF-2\n  priority: P1\n  file: lib/a.ts:12\n  fix: bound the scan";
		const result = calibrateReviewerFindings({
			materials: "no measurement",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-2\n  priority: P2" },
			],
			findings: qualityReviewFindingLines(
				renderQualityReviewReport({
					verdict: "not-ready",
					reason: "review",
					findings: [entry],
				}),
			),
		});
		expect(result.findings).toEqual([entry.replace("P1", "P2")]);
		expect(result.issues.join(" ")).toContain("capped at P2");
	});

	it("carries a finding whose ID appears only in another entry", () => {
		const result = calibrateReviewerFindings({
			materials: "",
			reviewers: [{ lens: "reviewer", text: "- id: F-1\n  priority: P2" }],
			findings: ["F-2 P2: similar to F-1"],
		});
		expect(result.findings).toContain(
			"F-1 open: reviewer finding omitted from QM report.",
		);
	});

	it("ignores a task token before an incidental finding ID", () => {
		const result = calibrateReviewerFindings({
			materials: "",
			reviewers: [],
			findings: ["TASK-747 regression: F-001 [P1]"],
		});
		expect(result.issues).toEqual([]);
	});

	it("accepts out-of-range entries and independently evidenced dismissals", () => {
		const result = calibrateReviewerFindings({
			materials: "fixed in lib/a.ts",
			reviewers: [
				{ lens: "reviewer", text: "- id: F-1\n  priority: P2" },
				{
					lens: "security-reviewer",
					text: "- id: F-1\n  closureEvidence: fixed in lib/a.ts",
				},
			],
			findings: [],
			observations: ["F-1 dismissed; closureEvidence: fixed in lib/a.ts"],
		});
		expect(result.findings).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it("caps unsupported performance P0", () => {
		const result = calibrateReviewerFindings({
			materials: "no measurement",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-1\n  priority: P0" },
			],
			findings: ["PF-1 P0 costly path"],
		});
		expect(result.findings).toEqual(["PF-1 P2 costly path"]);
	});

	it("raises an unsupported out-of-range performance P0 for a human decision", () => {
		const result = calibrateReviewerFindings({
			materials: "no measurement",
			reviewers: [
				{ lens: "performance-reviewer", text: "- id: PF-1\n  priority: P0" },
			],
			findings: [],
			observations: ["PF-1 P0 pre-existing slow path"],
		});
		expect(result.issues.join(" ")).toContain("human decision required");
	});
});
