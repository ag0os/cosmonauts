import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import {
	launchQualityReview,
	qualityReviewPlanSlug,
	requiredReviewLenses,
	triageReviewLenses,
	validateQualityReviewAnalysisCalls,
} from "../../lib/orchestration/quality-review-launch.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";

const agent = (id: string): AgentDefinition => ({
	id,
	domain: "coding",
	description: id,
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
});

describe("quality review launch policy", () => {
	it("fails when the QM skips or repeats direct analysis status", () => {
		expect(() => validateQualityReviewAnalysisCalls([])).toThrow(
			/analysis_status/,
		);
		const status = {
			type: "tool_execution_end" as const,
			sessionId: "manager",
			toolName: "analysis_status",
			toolCallId: "one",
			isError: false,
		};
		const audit = {
			...status,
			toolName: "analysis_audit",
			toolCallId: "audit",
		};
		expect(() =>
			validateQualityReviewAnalysisCalls([
				status,
				{ ...status, toolCallId: "two" },
				audit,
			]),
		).toThrow(/analysis_status/);
		expect(() => validateQualityReviewAnalysisCalls([status])).toThrow(
			/analysis_audit/,
		);
		expect(() =>
			validateQualityReviewAnalysisCalls([status, audit]),
		).not.toThrow();
	});
	it("rejects a model-selected base for the direct changed-scope gate", () => {
		const base = "a".repeat(40);
		const events = [
			{
				type: "tool_execution_start" as const,
				sessionId: "manager",
				toolName: "analysis_audit",
				toolCallId: "audit",
				args: { base: "b".repeat(40) },
			},
			{
				type: "tool_execution_end" as const,
				sessionId: "manager",
				toolName: "analysis_status",
				toolCallId: "status",
				isError: false,
			},
		];
		expect(() => validateQualityReviewAnalysisCalls(events, base)).toThrow(
			/captured base/,
		);
	});
	it("rejects an unbound audit completion despite a non-error tool event", () => {
		const base = "a".repeat(40);
		const end = {
			type: "tool_execution_end" as const,
			sessionId: "manager",
			toolCallId: "call",
			isError: false,
		};
		expect(() =>
			validateQualityReviewAnalysisCalls(
				[
					{
						...end,
						toolName: "analysis_status",
						result: {
							details: {
								capabilities: [
									{ capability: "changed-scope-audit", state: "bound" },
								],
							},
						},
					},
					{
						...end,
						toolName: "analysis_audit",
						result: {
							details: { kind: "unbound", reason: "execution-not-consented" },
						},
					},
				],
				base,
			),
		).toThrow(/unbound/);
	});
	it("rejects a completed audit with a failing verdict", () => {
		const base = "a".repeat(40);
		const end = {
			type: "tool_execution_end" as const,
			sessionId: "manager",
			toolCallId: "call",
			isError: false,
		};
		expect(() =>
			validateQualityReviewAnalysisCalls(
				[
					{
						...end,
						toolName: "analysis_status",
						result: {
							details: {
								capabilities: [
									{ capability: "changed-scope-audit", state: "bound" },
								],
							},
						},
					},
					{
						...end,
						toolName: "analysis_audit",
						result: {
							details: {
								kind: "findings",
								capability: "changed-scope-audit",
								scope: { base },
								verdict: "fail",
							},
						},
					},
				],
				base,
			),
		).toThrow(/fail/);
	});
	it("triages applicable lenses from the captured diff as well as filenames", () => {
		expect(
			triageReviewLenses(
				["README.md"],
				"+ authorization token query cache <form>",
			),
		).toEqual([
			"reviewer",
			"security-reviewer",
			"performance-reviewer",
			"ux-reviewer",
		]);
	});
	it("requires UX for CLI help and security for dependency changes", () => {
		expect(triageReviewLenses(["cli/help.ts"], "+Show command usage")).toEqual([
			"reviewer",
			"ux-reviewer",
		]);
		expect(triageReviewLenses(["package.json"], "+new-library")).toContain(
			"security-reviewer",
		);
		expect(
			triageReviewLenses(["lib/file-path.ts"], "+resolve(input)"),
		).toContain("security-reviewer");
		expect(
			triageReviewLenses(["lib/api/result.ts"], "+status: success"),
		).toContain("ux-reviewer");
	});
	it("keeps host-required and QM-added lenses as required evidence", () => {
		expect(
			requiredReviewLenses(
				["reviewer", "security-reviewer"],
				new Set(["reviewer", "ux-reviewer"]),
			),
		).toEqual(["reviewer", "security-reviewer", "ux-reviewer"]);
	});
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it.each([
		"quality-manager -> planner",
		"[quality-manager, planner]",
	])("refuses %s before a durable chain session", async (expression) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-placement-"));
		roots.push(projectRoot);
		const registry = new AgentRegistry([
			agent("quality-manager"),
			agent("planner"),
		]);
		const result = await runDurableChain({
			steps: parseChain(expression, registry),
			projectRoot,
			registry,
		});
		expect(result.success).toBe(false);
		expect(result.run?.runId).toMatch(/^qm-/);
		const report = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.run?.runId ?? "",
				"artifacts",
				"qm",
				"final.md",
			),
			"utf8",
		);
		expect(report).toContain("Verdict: refused");
	});

	it("treats conflicting plan identity as planless", () => {
		expect(
			qualityReviewPlanSlug({
				completionLabel: "plan:first",
				planSlug: "second",
			}),
		).toBeUndefined();
		expect(qualityReviewPlanSlug({ completionLabel: "plan:first" })).toBe(
			"first",
		);
	});

	it("runs host check policy even with an injected assessment", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-launch-checks-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		git("add", ".gitignore");
		git("commit", "-qm", "base");
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
				}),
			}),
		});
		const report = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
				"final.md",
			),
			"utf8",
		);
		expect(report).toContain("Verdict: not-ready");
		expect(report).toContain("Not configured: qualityReview.checks");
	});

	it("delegates a durable terminal QM into a child run with a complete report", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-durable-terminal-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		git("add", ".gitignore");
		git("commit", "-qm", "base");
		const registry = new AgentRegistry([agent("quality-manager")]);
		const result = await runDurableChain({
			steps: parseChain("quality-manager", registry),
			projectRoot,
			registry,
			qualityReview: {
				execute: async () => ({
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
				}),
			},
		});
		expect(result.success).toBe(true);
		expect(result.run?.runId).toMatch(/^chain-/);
		const child = result.stageResults[0]?.run;
		expect(child?.runId).toMatch(/^qm-/);
		expect(result.stageResults[0]?.artifacts?.[0]?.id).toBe("qm/final.md");
	});
});
