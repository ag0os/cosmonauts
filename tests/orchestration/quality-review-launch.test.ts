import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import {
	indexedQualityReviewReport,
	renderQualityReviewReport,
} from "../../lib/orchestration/quality-review-report.ts";
import * as workspaceModule from "../../lib/orchestration/quality-review-workspace.ts";

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

async function assertDurableTerminalReport(
	projectRoot: string,
	result: Awaited<ReturnType<typeof runDurableChain>>,
	chainEvents: string[],
): Promise<void> {
	expect(result.success).toBe(true);
	expect(chainEvents).toContain("chain_end");
	expect(result.run?.runId).toMatch(/^chain-/);
	const child = result.stageResults[0]?.run;
	expect(child?.runId).toMatch(/^qm-/);
	expect(result.stageResults[0]?.artifacts?.[0]?.id).toBe("qm/final.md");
	const report = await readFile(
		join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			child?.runId ?? "",
			"artifacts",
			"qm",
			"final.md",
		),
		"utf8",
	);
	expect(report).toContain("Verdict: not-ready");
	expect(report).toContain("Analysis audit gate state: not observed");
	expect(report).not.toContain(
		"Run quality gates, review the diff against main",
	);
	const store = new (
		await import("../../lib/durable-runtime/index.ts")
	).FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	const childEvents = (
		await store.readEvents({ scope: "chain", runId: child?.runId ?? "" })
	).events;
	expect(childEvents.some(({ event }) => event.type === "run_completed")).toBe(
		true,
	);
}

async function runDurableWithOperatorNote(
	projectRoot: string,
	registry: AgentRegistry,
): Promise<string | undefined> {
	const callerStages = parseChain("quality-manager", registry);
	const callerStage = callerStages[0];
	if (!callerStage || "stages" in callerStage)
		throw new Error("expected stage");
	callerStage.prompt = "Review the payment boundary only.";
	let operatorNote: string | undefined;
	await runDurableChain({
		steps: callerStages,
		projectRoot,
		registry,
		qualityReview: {
			execute: async ({ operatorNote: note }) => {
				operatorNote = note;
				return {
					markdown: renderQualityReviewReport({
						verdict: "not-ready",
						reason: "finding",
					}),
				};
			},
		},
	});
	return operatorNote;
}

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
	it("reports the first analysis failure before a later base mismatch", () => {
		const events = [
			{
				type: "tool_execution_end" as const,
				sessionId: "manager",
				toolName: "analysis_status",
				toolCallId: "status",
				isError: true,
			},
			{
				type: "tool_execution_start" as const,
				sessionId: "manager",
				toolName: "analysis_audit",
				toolCallId: "audit",
				args: { base: "wrong" },
			},
		];
		expect(() =>
			validateQualityReviewAnalysisCalls(events, "captured"),
		).toThrow("Analysis gate failed: analysis_status");
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
	it("keeps documentation prose out of specialist triage", () => {
		expect(
			triageReviewLenses(
				["README.md"],
				"+ authorization token query cache <form>",
			),
		).toEqual(["reviewer"]);
		expect(
			triageReviewLenses(["lib/auth.ts"], "+// query cache <form> token"),
		).toEqual(["reviewer"]);
		expect(
			triageReviewLenses(["lib/auth.ts"], "+/*\n+filesystem query cache\n+*/"),
		).toEqual(["reviewer"]);
		expect(
			triageReviewLenses(["lib/core.ts"], '+throw new Error("bad state")'),
		).toEqual(["reviewer"]);
	});
	it("triages source directories, removals and behavioral markdown", () => {
		for (const file of [
			"domains/coding/capabilities/reviewer.md",
			"drivers/templates/envelope.md",
			"AGENTS.md",
			"CLAUDE.md",
		])
			expect(
				triageReviewLenses([file], "-Never remove the read-only security rule"),
			).toContain("security-reviewer");
		expect(
			triageReviewLenses(["lib/memory/store.ts"], "+writeFile(path, data)"),
		).toContain("security-reviewer");
		expect(
			triageReviewLenses(["lib/auth.ts"], "-if (authorized) return true"),
		).toContain("security-reviewer");
		expect(
			triageReviewLenses(
				["bundled/coding/prompts/security-reviewer.md"],
				"+Check auth tokens",
			),
		).toContain("security-reviewer");
		expect(
			triageReviewLenses(
				["bundled/coding/skills/review/SKILL.md"],
				"+Check auth tokens",
			),
		).toContain("security-reviewer");
		expect(triageReviewLenses(["docs/guide.md"], "+Check auth tokens")).toEqual(
			["reviewer"],
		);
		expect(
			triageReviewLenses(
				["docs/guide.md", "lib/core.ts"],
				"diff --git a/docs/guide.md b/docs/guide.md\n+Check auth tokens\ndiff --git a/lib/core.ts b/lib/core.ts\n+return 1",
			),
		).toEqual(["reviewer"]);
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

	it("requires an observed audit state even with an injected ready assessment", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-launch-checks-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await (await import("node:fs/promises")).mkdir(
			join(projectRoot, ".cosmonauts"),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
				},
			}),
		);
		git("add", ".gitignore", ".cosmonauts/config.json");
		git("commit", "-qm", "base");
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["model claims pass"],
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
		expect(report).toContain("Analysis audit gate state: not observed");
	});

	it("runs configured checks only after the QM and reviewer evidence complete", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-launch-order-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await (await import("node:fs/promises")).mkdir(
			join(projectRoot, ".cosmonauts"),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "order",
							command: process.execPath,
							args: [
								"-e",
								"const fs=require('node:fs'); if (!fs.existsSync('qm.done') || !fs.existsSync('panel.done')) process.exit(7); console.log('evidence sealed')",
							],
						},
					],
				},
			}),
		);
		git("add", ".gitignore", ".cosmonauts/config.json");
		git("commit", "-qm", "base");
		const result = await launchQualityReview({
			projectRoot,
			execute: async (context) => {
				const fullText = "review complete";
				await context.artifactSink.writeReviewer({
					runId: context.runId,
					lens: "reviewer",
					spawnId: "spawn-one",
					sessionId: "panel-one",
					resolvedRole: "coding/reviewer",
					resolvedModel: { provider: "anthropic", id: "reviewer" },
					outcome: "success",
					digest: createHash("sha256").update(fullText).digest("hex"),
					fullText,
				});
				await writeFile(
					join(context.workspaceRoot ?? "", "panel.done"),
					"done",
				);
				await writeFile(join(context.workspaceRoot ?? "", "qm.done"), "done");
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit pass"],
					}),
					gateState: "completed-bound",
					requiredLenses: ["reviewer"],
				};
			},
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
		expect(report).toContain("Verdict: ready");
		expect(report).toContain("order: argv");
		expect(report).toContain("evidence sealed");
	});

	it("marks checks not run and not-ready when preparation fails after assessment", async () => {
		const projectRoot = await mkdtemp(
			join(tmpdir(), "qm-prepare-after-review-"),
		);
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await (await import("node:fs/promises")).mkdir(
			join(projectRoot, ".cosmonauts"),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					prepare: [
						{
							id: "dependencies",
							command: process.execPath,
							args: ["-e", "process.exit(5)"],
						},
					],
					checks: [
						{
							id: "test",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
				},
			}),
		);
		git("add", ".gitignore", ".cosmonauts/config.json");
		git("commit", "-qm", "base");
		let assessed = false;
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => {
				assessed = true;
				return {
					gateState: "completed-bound",
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit passed"],
					}),
				};
			},
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
		expect(assessed).toBe(true);
		expect(report).toContain("Verdict: not-ready");
		expect(report).toContain("test: not run (preparation failed)");
	});

	it("installs analysis dependencies before assessment without running lifecycle scripts", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-analysis-prepare-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(
			join(projectRoot, ".gitignore"),
			"missions/sessions/\nnode_modules/\n",
		);
		await (await import("node:fs/promises")).mkdir(join(projectRoot, "dep"));
		await writeFile(
			join(projectRoot, "dep", "package.json"),
			JSON.stringify({ name: "fixture", version: "1.0.0" }),
		);
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({
				name: "qm-analysis-prepare",
				version: "1.0.0",
				dependencies: { fixture: "file:./dep" },
				scripts: {
					preinstall:
						"node -e \"require('node:fs').writeFileSync('lifecycle-marker','ran')\"",
				},
			}),
		);
		execFileSync("bun", ["install", "--ignore-scripts"], {
			cwd: projectRoot,
			stdio: "ignore",
		});
		await (await import("node:fs/promises")).mkdir(
			join(projectRoot, ".cosmonauts"),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					analysisPrepare: [
						{
							id: "analysis-dependencies",
							command: "bun",
							args: ["install", "--frozen-lockfile", "--ignore-scripts"],
						},
					],
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
				},
			}),
		);
		git("add", ".");
		git("commit", "-qm", "base");
		let observedDependency = false;
		const result = await launchQualityReview({
			projectRoot,
			execute: async (context) => {
				observedDependency = (
					await readFile(
						join(
							context.workspaceRoot ?? "",
							"node_modules",
							"fixture",
							"package.json",
						),
						"utf8",
					)
				).includes("fixture");
				await expect(
					readFile(join(context.workspaceRoot ?? "", "lifecycle-marker")),
				).rejects.toMatchObject({ code: "ENOENT" });
				return {
					gateState: "completed-bound",
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit passed"],
					}),
				};
			},
		});
		expect(observedDependency).toBe(true);
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
		expect(report).toContain(
			"Analysis preparation analysis-dependencies: passed",
		);
		await expect(
			readFile(join(projectRoot, "lifecycle-marker")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each([
		true,
		false,
	])("blocks ready when analysis preparation is the only blocker (indexed: %s)", async (indexed) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-stale-lock-"));
		roots.push(projectRoot);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(
			join(projectRoot, ".gitignore"),
			"missions/sessions/\nnode_modules/\n",
		);
		await (await import("node:fs/promises")).mkdir(
			join(projectRoot, ".cosmonauts"),
		);
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({
				name: "stale-lock",
				version: "1.0.0",
				dependencies: { fixture: "file:./dep" },
			}),
		);
		await (await import("node:fs/promises")).mkdir(join(projectRoot, "dep"));
		await writeFile(
			join(projectRoot, "dep", "package.json"),
			JSON.stringify({ name: "fixture", version: "1.0.0" }),
		);
		execFileSync("bun", ["install", "--ignore-scripts"], {
			cwd: projectRoot,
			stdio: "ignore",
		});
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					analysisPrepare: [
						{
							id: "dependencies",
							command: "bun",
							args: ["install", "--frozen-lockfile", "--ignore-scripts"],
						},
					],
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
				},
			}),
		);
		git("add", ".");
		git("commit", "-qm", "base");
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({
				name: "stale-lock",
				version: "1.0.0",
				dependencies: { fixture: "file:./dep", fixture2: "file:./dep" },
			}),
		);
		let assessed = false;
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => {
				assessed = true;
				return {
					gateState: "completed-bound",
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit passed"],
					}).replace(indexed ? /$^/ : /<!-- COSMO_QM_REPORT[\s\S]*?-->/, ""),
				};
			},
		});
		const artifacts = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		const report = await readFile(join(artifacts, "final.md"), "utf8");
		expect(assessed).toBe(true);
		expect(report).toContain("Verdict: not-ready");
		expect(report).toContain("Analysis preparation dependencies: failed");
		expect(report).toMatch(/lockfile/i);
		expect(report).toContain("Analysis audit gate state: completed-bound");
		expect(report).toContain("ok: argv");
		expect(report).toContain("exit 0");
		expect(report).toContain(
			"Analysis preparation failed; human decision required.",
		);
		if (indexed)
			expect(indexedQualityReviewReport(report)?.gates).toEqual([
				"Analysis audit gate state: completed-bound",
			]);
		expect(report).not.toContain("Gate-owned file changed:");
		expect(await readFile(join(artifacts, "checks.md"), "utf8")).toContain(
			"Analysis preparation dependencies: failed",
		);
	});

	it.each([
		"deadline",
		"caller",
	] as const)("aborts a slow base export on %s", async (reason) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-slow-export-"));
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
		const controller = new AbortController();
		let observedSignal: AbortSignal | undefined;
		let started!: () => void;
		const startedPromise = new Promise<void>((resolve) => {
			started = resolve;
		});
		const exportSpy = vi
			.spyOn(workspaceModule, "materializeBaseReviewProject")
			.mockImplementation(async (_source, _reserved, _base, signal) => {
				observedSignal = signal;
				started();
				await new Promise<void>((resolve) =>
					signal?.addEventListener("abort", () => resolve(), { once: true }),
				);
				throw new Error("export aborted");
			});
		try {
			const pending = launchQualityReview({
				projectRoot,
				signal: controller.signal,
				assessmentTimeoutMs: reason === "deadline" ? 40 : 10_000,
			});
			await startedPromise;
			if (reason === "caller") controller.abort();
			const result = await pending;
			expect(observedSignal?.aborted).toBe(true);
			const artifacts = join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
			);
			const report = await readFile(join(artifacts, "final.md"), "utf8");
			expect(report).not.toContain("Live work: base runtime setup");
			const { FileRunStore, runStatus } = await import(
				"../../lib/durable-runtime/index.ts"
			);
			expect(
				(
					await runStatus(
						new FileRunStore({
							rootDir: join(projectRoot, "missions", "sessions"),
						}),
						result.ref,
					)
				)?.postTerminalDisposition?.disposition,
			).toBe("removed");
			expect(result.stepResult.outcome).toBe(
				reason === "caller" ? "cancelled" : "failed",
			);
		} finally {
			exportSpy.mockRestore();
		}
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
		let operatorNote: string | undefined = "unexpected";
		const chainEvents: string[] = [];
		const result = await runDurableChain({
			steps: parseChain("quality-manager", registry),
			projectRoot,
			registry,
			onEvent: (event) => chainEvents.push(event.type),
			qualityReview: {
				execute: async (context) => {
					operatorNote = context.operatorNote;
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "clear",
						}),
					};
				},
			},
		});
		expect(operatorNote).toBeUndefined();
		await assertDurableTerminalReport(projectRoot, result, chainEvents);
		expect(await runDurableWithOperatorNote(projectRoot, registry)).toBe(
			"Review the payment boundary only.",
		);
	});
});
