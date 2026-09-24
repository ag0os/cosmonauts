import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { SpawnConfig } from "../../lib/orchestration/types.ts";

const mocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	createPiSpawner: vi.fn(),
}));

vi.mock("../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: mocks.runtimeCreate },
}));
vi.mock("../../lib/packages/dev-bundled.ts", () => ({
	discoverFrameworkBundledPackageDirs: vi.fn(async () => []),
}));
vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: mocks.createPiSpawner,
}));

import { launchQualityReview } from "../../lib/orchestration/quality-review-launch.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";

const roots: string[] = [];
afterEach(async () => {
	vi.clearAllMocks();
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

// @cosmo-behavior plan:qm-chain-safety#B-006
it("runs configured checks and one triaged panel in a single QM pass", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "qm-one-pass-"));
	roots.push(projectRoot);
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	await mkdir(join(projectRoot, ".cosmonauts"));
	await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
	await writeFile(
		join(projectRoot, "auth.ts"),
		"export const authorized = true;\n",
	);
	await writeFile(
		join(projectRoot, ".cosmonauts", "config.json"),
		JSON.stringify({
			qualityReview: {
				diverseReviewerModel: "test/other",
				checks: [
					{
						id: "one",
						command: process.execPath,
						args: [
							"-e",
							"require('node:fs').appendFileSync('check-count','x'); process.stdout.write('ok')",
						],
					},
				],
			},
		}),
	);
	git("add", ".");
	git("commit", "-qm", "base");
	await writeFile(
		join(projectRoot, "auth.ts"),
		"export const authorized = false;\n",
	);
	mocks.runtimeCreate.mockResolvedValue({
		agentRegistry: {},
		domainsDir: "/tmp/domains",
		domainResolver: {},
		projectSkills: [],
		skillPaths: [],
	});
	const spawns: string[] = [];
	mocks.createPiSpawner.mockReturnValue({
		spawn: async (config: SpawnConfig) => {
			spawns.push(config.role);
			const context = config.qualityReviewContext;
			if (!context) throw new Error("missing quality context");
			expect(await readFile(join(config.cwd, "check-count"), "utf8")).toBe("x");
			expect([...context.allowedLenses]).toEqual([
				"reviewer",
				"security-reviewer",
			]);
			for (const lens of context.allowedLenses) {
				const fullText = `${lens} checked captured diff`;
				await context.artifactSink.writeReviewer({
					runId: context.runId,
					lens,
					spawnId: `spawn-${lens}`,
					sessionId: `session-${lens}`,
					resolvedRole: `coding/${lens}`,
					resolvedModel: { provider: "test", id: lens },
					outcome: "success",
					digest: createHash("sha256").update(fullText).digest("hex"),
					fullText,
				});
			}
			config.onEvent?.({
				type: "tool_execution_start",
				sessionId: "manager",
				toolName: "analysis_audit",
				toolCallId: "audit",
				args: { base: context.base },
			});
			config.onEvent?.({
				type: "tool_execution_end",
				sessionId: "manager",
				toolName: "analysis_audit",
				toolCallId: "audit",
				isError: false,
			});
			config.onEvent?.({
				type: "tool_execution_end",
				sessionId: "manager",
				toolName: "analysis_status",
				toolCallId: "status",
				isError: false,
			});
			return {
				success: true,
				sessionId: "manager",
				messages: [
					{
						role: "assistant",
						content: [
							{
								type: "text",
								text: renderQualityReviewReport({
									verdict: "ready",
									reason: "clear",
									gates: ["changed-scope: passed against literal base"],
									reviewed: ["Reviewed full captured diff"],
								}),
							},
						],
					},
				],
			};
		},
		dispose: vi.fn(),
	});
	const result = await launchQualityReview({ projectRoot });
	expect(result.stepResult.outcome).toBe("success");
	expect(spawns).toEqual(["quality-manager"]);
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
	expect(report).toContain("Verdict: ready");
	expect(report).toContain("one: argv");
	expect(report).toContain("reviewer: test/reviewer");
	expect(report).toContain("security-reviewer: test/security-reviewer");
});
