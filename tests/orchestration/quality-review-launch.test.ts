import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import { qualityReviewPlanSlug } from "../../lib/orchestration/quality-review-launch.ts";
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

	it("delegates a durable terminal QM into a child run with a complete report", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-durable-terminal-"));
		roots.push(projectRoot);
		const registry = new AgentRegistry([agent("quality-manager")]);
		const result = await runDurableChain({
			steps: parseChain("quality-manager", registry),
			projectRoot,
			registry,
			qualityReview: {
				prepareWorkspace: async ({ workspaceRoot }) => {
					await mkdir(workspaceRoot);
				},
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
