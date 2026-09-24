import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRunStore, runStatus } from "../../lib/durable-runtime/index.ts";
import * as spawnerModule from "../../lib/orchestration/agent-spawner.ts";
import { summarizeAssistantText } from "../../lib/orchestration/assistant-text.ts";
import {
	launchQualityReview,
	qualityReviewAuditFindingLines,
	validateQualityReviewAnalysisCalls,
} from "../../lib/orchestration/quality-review-launch.ts";
import {
	indexedQualityReviewReport,
	renderQualityReviewReport,
} from "../../lib/orchestration/quality-review-report.ts";
import { runQualityReview } from "../../lib/orchestration/quality-review-run.ts";
import * as workspaceModule from "../../lib/orchestration/quality-review-workspace.ts";
import { removePrivateReviewWorkspace } from "../../lib/orchestration/quality-review-workspace.ts";
import type { SpawnEvent } from "../../lib/orchestration/types.ts";
import { writeSyntheticInstallableDomainPackage } from "../helpers/packages.ts";

describe("quality review durable lifecycle", () => {
	it("uses the configured workspace removal timeout on a stalled remover", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { workspaceRemovalTimeoutMs: 25 } }),
		);
		await commitBaseConfig(projectRoot);
		const started = Date.now();
		let retainedRoot = "";
		const result = await runQualityReview({
			projectRoot,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "not-ready",
					reason: "review",
				}),
			}),
			removeWorkspace: async (path) => {
				retainedRoot = path;
				await new Promise(() => {});
			},
		});
		expect(Date.now() - started).toBeLessThan(2000);
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		expect(
			(await runStatus(store, result.ref))?.postTerminalDisposition
				?.disposition,
		).toBe("removal-timed-out");
		await removePrivateReviewWorkspace(retainedRoot);
	});
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	async function root(repository = false): Promise<string> {
		const path = await mkdtemp(join(tmpdir(), "qm-run-"));
		roots.push(path);
		if (repository) {
			const { execFileSync } = await import("node:child_process");
			const git = (...args: string[]) =>
				execFileSync("git", args, { cwd: path });
			git("init", "-q");
			git("config", "user.email", "test@example.com");
			git("config", "user.name", "Test");
			await writeFile(join(path, ".gitignore"), "missions/sessions/\n");
			git("add", ".gitignore");
			git("commit", "-qm", "base");
		}
		return path;
	}
	async function commitBaseConfig(projectRoot: string): Promise<void> {
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "base quality config"], {
			cwd: projectRoot,
		});
	}

	it("runs host checks in the snapshot, persists output and blocks a failed check", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "failure",
							command: process.execPath,
							args: [
								"-e",
								"process.stderr.write('check failed'); process.exit(7)",
							],
						},
					],
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "model said ready",
					findings: ["F-1 P2 high src/a.ts:7 fix the branch; input: null"],
					reviewerModels: ["openai-codex/gpt-6-sol"],
				}),
			}),
		});
		const artifactDir = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		const checks = await readFile(join(artifactDir, "checks.md"), "utf8");
		expect(checks).toContain("# Preparation");
		expect(checks).toContain("# Configured checks");
		expect(checks).toContain("check failed");
		expect(await readFile(join(artifactDir, "final.md"), "utf8")).toContain(
			"Verdict: not-ready",
		);
		expect(await readFile(join(artifactDir, "final.md"), "utf8")).toContain(
			"F-1 P2 high src/a.ts:7 fix the branch; input: null",
		);
		expect(result.stepResult.outcome).toBe("success");
		expect(
			(await readFile(join(artifactDir, "final.md"), "utf8")).trimEnd(),
		).toMatch(/Caller-owned remediation:.*tasks.*Drive.*independent review\.$/);
	});

	it("runs base-owned check argv even when the reviewed config rewrites it", async () => {
		const projectRoot = await root(true);
		const marker = join(projectRoot, "outside-marker");
		const configPath = join(projectRoot, ".cosmonauts", "config.json");
		await mkdir(join(projectRoot, ".cosmonauts"));
		const check = (script: string) => ({
			id: "authority",
			command: process.execPath,
			args: ["-e", script],
		});
		await writeFile(
			configPath,
			JSON.stringify({
				qualityReview: {
					checks: [check("console.log('base check ran')")],
					diverseReviewerModel: "test/other",
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "base config"], { cwd: projectRoot });
		await writeFile(
			configPath,
			JSON.stringify({
				qualityReview: {
					checks: [
						check(
							`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe')`,
						),
					],
					diverseReviewerModel: "test/other",
				},
			}),
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "not-ready",
					reason: "review",
				}),
			}),
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
		expect(await readFile(join(artifacts, "checks.md"), "utf8")).toContain(
			"base check ran",
		);
		await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(join(artifacts, "final.md"), "utf8")).toContain(
			"Gate-owned file changed: .cosmonauts/config.json",
		);
	});

	it("excludes its own plan summary from the captured change", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, "missions", "plans", "example"), {
			recursive: true,
		});
		let captured = "";
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			execute: async ({ materialsRoot }) => {
				captured = await readFile(
					join(materialsRoot ?? "", "changed-files.txt"),
					"utf8",
				);
				return {
					markdown: renderQualityReviewReport({
						verdict: "not-ready",
						reason: "review",
					}),
				};
			},
		});
		expect(result.stepResult.outcome).toBe("success");
		expect(captured).not.toContain(result.ref.runId);
	});

	it("blocks a ready claim when the host observed an unbound audit", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
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
					diverseReviewerModel: "test/model",
				},
			}),
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState: "Analysis audit gate state: unbound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "all gates passed",
					gates: ["analysis_audit passed"],
					humanItems: [
						"Analysis audit gate state: unbound; human decision required.",
					],
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
		expect(report).toContain(
			"Analysis audit gate state: unbound; human decision required.",
		);
		expect(
			indexedQualityReviewReport(report)?.humanItems?.filter((item) =>
				item.startsWith("Analysis audit gate state:"),
			),
		).toEqual(["Analysis audit gate state: unbound; human decision required."]);
	});

	async function hostHumanItemProject(source: string): Promise<string> {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		const check = {
			id: "ok",
			command: process.execPath,
			args: ["-e", "process.exit(0)"],
		};
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: source === "checks not configured" ? [] : [check],
					...(source === "model not configured"
						? {}
						: { diverseReviewerModel: "test/other" }),
					...(source === "gate-owned change"
						? { gateOwnedPaths: ["policy.txt"] }
						: {}),
					...(source === "check preparation failure"
						? {
								prepare: [
									{
										id: "regular",
										command: process.execPath,
										args: ["-e", "process.exit(5)"],
									},
								],
							}
						: {}),
					...(source === "analysis preparation failure"
						? {
								analysisPrepare: [
									{
										id: "analysis",
										command: "bun",
										args: ["install", "--frozen-lockfile", "--ignore-scripts"],
									},
								],
							}
						: {}),
				},
			}),
		);
		if (source === "gate-owned change")
			await writeFile(join(projectRoot, "policy.txt"), "base");
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", "."], { cwd: projectRoot });
		execFileSync("git", ["commit", "-qm", "base config"], { cwd: projectRoot });
		if (source === "gate-owned change")
			await writeFile(join(projectRoot, "policy.txt"), "changed");
		return projectRoot;
	}

	it.each([
		[
			"checks not configured",
			"Not configured: qualityReview.checks; human decision required.",
		],
		[
			"model not configured",
			"Not configured: qualityReview.diverseReviewerModel; human decision required.",
		],
		[
			"gate-owned change",
			"Gate-owned file changed: policy.txt; human decision required.",
		],
		[
			"unbound audit",
			"Analysis audit gate state: unbound; human decision required.",
		],
		[
			"unobserved audit",
			"Analysis audit gate state: not observed; human decision required.",
		],
		[
			"failed-to-run audit",
			"Analysis audit gate state: failed-to-run; human decision required.",
		],
		[
			"missing gate evidence",
			"Gate evidence missing; human decision required.",
		],
		[
			"check preparation failure",
			"Check preparation failed; human decision required.",
		],
		[
			"analysis preparation failure",
			"Analysis preparation failed; human decision required.",
		],
	] as const)("never reports ready with a host human item from %s", async (source, item) => {
		const projectRoot = await hostHumanItemProject(source);
		const prepare =
			source === "analysis preparation failure"
				? vi
						.spyOn(workspaceModule, "preparePrivateReviewWorkspace")
						.mockRejectedValueOnce(
							new workspaceModule.WorkspacePreparationFailure(
								"frozen lockfile mismatch",
								[],
							),
						)
				: undefined;
		try {
			const gateState =
				source === "unobserved audit"
					? undefined
					: source === "unbound audit"
						? "unbound"
						: source === "failed-to-run audit"
							? "failed-to-run"
							: "completed-bound";
			const result = await runQualityReview({
				projectRoot,
				hostChecks: true,
				execute: async () => ({
					gateState,
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: source === "missing gate evidence" ? [] : ["audit passed"],
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
			expect(report).toContain(item);
			expect(report).toContain("Verdict: not-ready");
			expect(indexedQualityReviewReport(report)?.verdict).toBe("not-ready");
		} finally {
			prepare?.mockRestore();
		}
	});

	it("reports a bound failing audit under gates and findings without a human item", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "test/other",
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
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState: "Analysis audit gate state: fail",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["model says pass"],
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
		expect(report).toContain("Analysis audit gate state: fail");
		expect(report).not.toContain(
			"Analysis audit gate state: fail; human decision required",
		);
	});

	it("reports each finding from a bound failing audit envelope", async () => {
		const projectRoot = await root(true);
		const base = "a".repeat(40);
		const end = {
			type: "tool_execution_end" as const,
			sessionId: "qm",
			toolCallId: "call",
			isError: false,
		};
		const events: SpawnEvent[] = [
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
						findings: [
							{
								id: "f1",
								category: "dead-code",
								severity: "error",
								message: "unused export",
								locations: [{ path: "lib/a.ts", line: 17 }],
								actions: [{ description: "remove export" }],
							},
							{
								id: "f2",
								category: "complexity",
								severity: "warning",
								message: "complex branch",
								locations: [{ path: "lib/b.ts", line: 23 }],
								actions: [{ description: "split branch" }],
							},
							{
								id: "f3",
								category: "dead-code",
								severity: "warning",
								message: "unused helper",
								locations: [{ path: "lib/c.ts", line: 9 }],
								actions: [],
							},
						],
					},
				},
			},
		];
		let gateState = "";
		try {
			validateQualityReviewAnalysisCalls(events, base);
		} catch (error) {
			gateState = (error as Error).message;
		}
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState,
				auditFindings: qualityReviewAuditFindingLines(events, base),
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["model says pass"],
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
		const indexed = indexedQualityReviewReport(report);
		expect(indexed?.verdict).toBe("not-ready");
		expect(indexed?.findings).toEqual([
			"f1 P1 lib/a.ts:17 dead-code error: unused export; fix: remove export",
			"f2 P2 lib/b.ts:23 complexity warning: complex branch; fix: split branch",
			"f3 P2 lib/c.ts:9 dead-code warning: unused helper; fix: Address dead-code finding.",
		]);
		expect(
			indexed?.humanItems?.some((item) => item.includes("Analysis audit")),
		).toBe(false);
	});

	it.each([
		"unbound",
		"unconsented",
		"missing",
	])("uses one prefix for real %s validator state", async (state) => {
		const projectRoot = await root(true);
		const base = "a".repeat(40);
		const end = {
			type: "tool_execution_end" as const,
			sessionId: "qm",
			toolCallId: "call",
			isError: false,
		};
		const status =
			state === "missing"
				? []
				: [
						{
							...end,
							toolName: "analysis_status",
							result: {
								details: {
									capabilities: [
										{
											capability: "changed-scope-audit",
											state: state === "unbound" ? "unbound" : "bound",
										},
									],
								},
							},
						},
					];
		const audit = {
			...end,
			toolName: "analysis_audit",
			result: {
				details: { kind: "unbound", reason: "execution-not-consented" },
			},
		};
		let gateState = "";
		try {
			validateQualityReviewAnalysisCalls([...status, audit], base);
		} catch (error) {
			gateState = (error as Error).message;
		}
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState,
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["model says pass"],
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
		const items = indexedQualityReviewReport(report)?.humanItems ?? [];
		const expectedPrefix =
			state === "missing"
				? `Analysis audit gate state: ${gateState}`
				: gateState;
		expect(
			items.filter((item) => item.startsWith(expectedPrefix)),
		).toHaveLength(1);
		expect(items.join(" ")).not.toContain(
			"Analysis audit gate state: Analysis audit",
		);
	});

	it("does not call an unrelated config edit gate-owned", async () => {
		const projectRoot = await root(true);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		await mkdir(join(projectRoot, ".cosmonauts"));
		const qualityReview = {
			checks: [
				{
					id: "ok",
					command: process.execPath,
					args: ["-e", "process.exit(0)"],
				},
			],
			diverseReviewerModel: "test/model",
		};
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview, unrelated: "before" }),
		);
		git("add", ".cosmonauts/config.json");
		git("commit", "-qm", "configure review");
		git("branch", "-M", "main");
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview, unrelated: "after" }),
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState: "completed-bound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clean",
					gates: ["analysis_audit passed"],
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
		expect(report).toContain("Verdict: ready");
		expect(report).not.toContain(
			"Gate-owned file changed: .cosmonauts/config.json",
		);
	});

	it("ignores a gate-owned change made only on the advanced base branch", async () => {
		const projectRoot = await root(true);
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
		await mkdir(join(projectRoot, ".cosmonauts"));
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
					diverseReviewerModel: "test/model",
				},
			}),
		);
		await writeFile(join(projectRoot, "feature.txt"), "base\n");
		git("add", ".cosmonauts/config.json", "feature.txt");
		git("commit", "-qm", "fork point");
		git("branch", "-M", "main");
		const fork = git("rev-parse", "HEAD");
		git("checkout", "-qb", "feature");
		await writeFile(join(projectRoot, "feature.txt"), "feature\n");
		git("add", "feature.txt");
		git("commit", "-qm", "feature change");
		git("checkout", "main");
		await mkdir(join(projectRoot, ".fallow-baselines"));
		await writeFile(
			join(projectRoot, ".fallow-baselines", "dupes.json"),
			"main only\n",
		);
		git("add", ".fallow-baselines/dupes.json");
		git("commit", "-qm", "base gate file");
		git("checkout", "feature");
		let seenBase = "";
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ base }) => {
				seenBase = base ?? "";
				return {
					gateState: "completed-bound",
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clean",
						gates: ["passed"],
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
		expect(seenBase).toBe(fork);
		expect(report).toContain("Verdict: ready");
		expect(report).not.toContain(
			"Gate-owned file changed: .fallow-baselines/dupes.json",
		);
	});

	it("keeps a completed not-ready verdict when workspace removal fails", async () => {
		const projectRoot = await root(true);
		let retainedRoot = "";
		try {
			const result = await runQualityReview({
				projectRoot,
				execute: async ({ workspaceRoot }) => {
					retainedRoot = resolve(workspaceRoot ?? "", "..");
					return {
						markdown: renderQualityReviewReport({
							verdict: "not-ready",
							reason: "finding",
							findings: ["P1 issue"],
						}),
					};
				},
				removeWorkspace: async () => {
					throw new Error("simulated removal failure");
				},
			});
			const qmRoot = join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
			);
			const report = await readFile(join(qmRoot, "final.md"), "utf8");
			const lifecycle = await readFile(join(qmRoot, "lifecycle.jsonl"), "utf8");
			expect(result.stepResult.outcome).toBe("success");
			expect(report).toContain("Verdict: not-ready");
			expect(lifecycle).toContain('"disposition":"removal-failed"');
			const terminal = lifecycle
				.split("\n")
				.filter(Boolean)
				.map(
					(line) =>
						JSON.parse(line) as {
							phase: string;
							disposition: string;
							artifactDigests: string[];
						},
				)
				.filter((event) => ["finalized", "retained"].includes(event.phase));
			expect(terminal).toHaveLength(1);
			expect(terminal[0]?.disposition).toBe("pending-removal");
			expect(terminal[0]?.artifactDigests).toContain(
				createHash("sha256").update(report).digest("hex"),
			);
		} finally {
			if (retainedRoot) await removePrivateReviewWorkspace(retainedRoot);
		}
	});
	it("persists the terminal report and status before a stalled remover", async () => {
		const projectRoot = await root(true);
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		let observedStatus: string | undefined;
		let observedReport = "";
		let observedSummary = "";
		let removedRoot = "";
		const started = Date.now();
		const result = await runQualityReview({
			projectRoot,
			store,
			planSlug: "example",
			workspaceRemovalTimeoutMs: 50,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "not-ready",
					reason: "finding",
					findings: ["issue"],
				}),
			}),
			removeWorkspace: async (path) => {
				removedRoot = path;
				const runs = await store.listRecentRuns({ scope: "chain" });
				const run = runs[0];
				if (!run) throw new Error("run missing");
				observedStatus = (
					await runStatus(store, { scope: "chain", runId: run.runId })
				)?.status;
				observedReport = await readFile(
					join(run.artifactsDir, "qm", "final.md"),
					"utf8",
				);
				observedSummary = await readFile(
					join(
						projectRoot,
						"missions",
						"plans",
						"example",
						"qm-runs",
						`${run.runId}.md`,
					),
					"utf8",
				);
				await new Promise(() => {});
			},
		});
		expect(Date.now() - started).toBeLessThan(2000);
		expect(observedStatus).toBe("running");
		expect((await runStatus(store, result.ref))?.status).toBe("completed");
		expect(
			(await runStatus(store, result.ref))?.postTerminalDisposition
				?.disposition,
		).toBe("removal-timed-out");
		expect(observedReport).toContain("Verdict: not-ready");
		expect(observedSummary).toContain("Verdict: not-ready");
		const lifecycle = (
			await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"lifecycle.jsonl",
				),
				"utf8",
			)
		)
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as {
						phase?: string;
						kind?: string;
						disposition?: string;
					},
			);
		expect(
			lifecycle.filter((event) => event.phase === "finalized"),
		).toHaveLength(1);
		expect(lifecycle.at(-1)).toMatchObject({
			kind: "artifact-disposition",
			disposition: "removal-timed-out",
		});
		if (removedRoot) await removePrivateReviewWorkspace(removedRoot);
	});
	it("finalizes with a named integrity failure when a reviewer store write never settles", async () => {
		const projectRoot = await root(true);
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		const originalLoad = store.loadRun.bind(store);
		let stall = false;
		vi.spyOn(store, "loadRun").mockImplementation((ref) =>
			stall ? new Promise(() => {}) : originalLoad(ref),
		);
		const result = await runQualityReview({
			projectRoot,
			store,
			planSlug: "example",
			reviewerSealGraceMs: 30,
			execute: async ({ artifactSink, runId }) => {
				stall = true;
				void artifactSink
					.writeReviewer({
						runId,
						lens: "security-reviewer",
						spawnId: "spawn",
						sessionId: "session",
						resolvedRole: "coding/security-reviewer",
						resolvedModel: { provider: "test", id: "model" },
						outcome: "success",
						fullText: "review",
						digest: createHash("sha256").update("review").digest("hex"),
					})
					.catch(() => {});
				stall = false;
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						checks: ["unit check passed"],
						gates: ["audit passed"],
						findings: ["F-1 P1 lib/a.ts:7 security fix the issue"],
						humanItems: ["Approve external access"],
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
		expect(report).toContain(
			"Report integrity: reviewer writes abandoned after sealing grace: security-reviewer",
		);
		for (const item of [
			"unit check passed",
			"audit passed",
			"F-1 P1 lib/a.ts:7 security fix the issue",
			"Approve external access",
		])
			expect(report).toContain(item);
		const summary = await readFile(
			join(
				projectRoot,
				"missions",
				"plans",
				"example",
				"qm-runs",
				`${result.ref.runId}.md`,
			),
			"utf8",
		);
		expect(summary).toContain("F-1 P1 lib/a.ts:7 security fix the issue");
		expect(summary).toContain("Approve external access");
		expect((await runStatus(store, result.ref))?.status).toBe("failed");
	});

	it("waits several seconds by default for an aborting QM tool to settle", async () => {
		const projectRoot = await root(true);
		const started = Date.now();
		const result = await runQualityReview({
			projectRoot,
			assessmentTimeoutMs: 30,
			execute: async ({ signal }) => {
				await new Promise<void>((resolve) =>
					signal?.addEventListener("abort", () => setTimeout(resolve, 400), {
						once: true,
					}),
				);
				return { markdown: "" };
			},
		});
		expect(Date.now() - started).toBeGreaterThanOrEqual(400);
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
		expect(report).not.toContain("Live work: QM session did not settle");
	});
	it("uses the configured QM settle grace", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { qmSettleGraceMs: 40 } }),
		);
		await commitBaseConfig(projectRoot);
		const started = Date.now();
		const result = await runQualityReview({
			projectRoot,
			assessmentTimeoutMs: 20,
			execute: async () => new Promise<never>(() => {}),
		});
		expect(Date.now() - started).toBeLessThan(1500);
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
		expect(report).toContain("Live work: QM session did not settle");
		const lifecycle = (
			await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"lifecycle.jsonl",
				),
				"utf8",
			)
		)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { phase: string; workspace?: string });
		const reserved = lifecycle.find(
			(event) => event.phase === "workspace-reserved",
		)?.workspace;
		if (reserved) await removePrivateReviewWorkspace(reserved);
	});

	it("reports empty checks and gate-owned changes as human decisions", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { checks: [] } }),
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "model said ready",
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
		expect(report).toContain(
			"Gate-owned file changed: .cosmonauts/config.json",
		);
	});

	// @cosmo-behavior plan:qm-chain-safety#B-005
	it("includes passing host check details even when the model omits them", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.stdout.write('passed')"],
						},
					],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "configured checks"], {
			cwd: projectRoot,
		});
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
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
		expect(report).toContain("ok: argv");
		expect(report).toContain("exit 0");
		expect(report).toContain("passed");
		expect(report).toContain(
			"Not configured: qualityReview.diverseReviewerModel",
		);
		expect(report).toContain("Gate evidence missing; human decision required.");
		expect(report).toContain("Verdict: not-ready");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-003
	it("reports reviewer models from run-owned evidence", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				await artifactSink.writeReviewer({
					runId,
					lens: "reviewer",
					spawnId: "spawn-one",
					sessionId: "session-one",
					resolvedRole: "coding/reviewer",
					resolvedModel: { provider: "test", id: "actual" },
					outcome: "success",
					digest: createHash("sha256").update("review complete").digest("hex"),
					fullText: "review complete",
				});
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						reviewerModels: ["test/claimed"],
					}),
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
		expect(report).toContain("test/actual");
		expect(report).not.toContain("test/claimed");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-010
	// The non-sentinel cases kill the host Findings condition -> false mutation.
	it.each(
		(
			[
				["numbered", "1. F-1 P2 null input crashes"],
				["star", "* F-1 P2 null input crashes"],
				["plus", "+ F-1 P2 null input crashes"],
				["prose", "F-1 P2 null input crashes"],
				[
					"before bullet",
					"F-1 P2 null input crashes\n- F-2 dismissed; closureEvidence: fixed in lib/a.ts",
				],
				[
					"after dismissal",
					"- F-2 dismissed; closureEvidence: fixed in lib/a.ts\nF-1 P2 null input crashes",
				],
				[
					"after blank line",
					"- F-2 dismissed; closureEvidence: fixed in lib/a.ts\n\n  F-1 P2 null input crashes",
				],
				["ID-less bullet", "- P2 null input crashes"],
				["dismissal", "- F-1 dismissed; closureEvidence: fixed in lib/a.ts"],
				["sub-finding", "- F-1 dismissed\n  - F-2 P2 null input crashes"],
				["still open", "- F-1 P2 still open, security dismissed it"],
				["not resolved", "- F-1 P2 not resolved"],
				["closed prematurely", "- F-1 P2 closed prematurely"],
				["blank line", "- F-1 dismissed\n\n  F-2 P2 null input crashes"],
				["subheading", "### F-1\n\nP2 null input crashes"],
				["extra heading", "- None recorded.\n\n## Extra\n\nunexpected"],
				["empty", "", "ready"],
				["plain sentinel", "None recorded.", "ready"],
				["case-insensitive bullet sentinel", "- nOnE ReCoRdEd.", "ready"],
			] as const
		).map((entry) => [entry[0], entry[1], entry.at(2) ?? "not-ready"] as const),
	)("calibrates Findings shape %s", async (_shape, body, expected) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "anthropic/reviewer",
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
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				for (const [lens, provider] of [
					["reviewer", "anthropic"],
					["security-reviewer", "openai-codex"],
				] as const) {
					const fullText = "No findings";
					await artifactSink.writeReviewer({
						runId,
						lens,
						spawnId: `spawn-${lens}`,
						sessionId: `session-${lens}`,
						resolvedRole: `coding/${lens}`,
						resolvedModel: { provider, id: lens },
						outcome: "success",
						digest: createHash("sha256").update(fullText).digest("hex"),
						fullText,
					});
				}
				const markdown = renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
				}).replace("## Findings\n\n- None recorded.", `## Findings\n\n${body}`);
				return {
					markdown,
					gateState: "completed-bound",
					implementerModel: { provider: "openai-codex", id: "worker" },
					requiredLenses: ["reviewer", "security-reviewer"],
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
		expect(report).toContain(`Verdict: ${expected ?? "not-ready"}`);
	});

	// @cosmo-behavior plan:qm-chain-safety#B-010
	it.each([
		["out-of-range finding", "F-1 P2 pre-existing issue", false],
		[
			"out-of-range dismissal",
			"F-1 dismissed; closureEvidence: fixed in lib/a.ts",
			false,
		],
		[
			"in-range dismissal",
			"F-1 dismissed; closureEvidence: fixed in lib/a.ts",
			true,
		],
		[
			"dismissal with a trailing paragraph",
			"F-1 dismissed; closureEvidence: fixed in lib/a.ts\n\n  F-2 P2 null input crashes",
			true,
		],
	] as const)("calibrates %s", async (_case, entry, inFindings) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "anthropic/reviewer",
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
		await commitBaseConfig(projectRoot);
		await mkdir(join(projectRoot, "lib"));
		await writeFile(join(projectRoot, "lib", "a.ts"), "// fixed in lib/a.ts\n");
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				for (const [lens, fullText, provider] of [
					["reviewer", "- id: F-1\n  priority: P2", "anthropic"],
					[
						"security-reviewer",
						"- id: F-1\n  closureEvidence: fixed in lib/a.ts",
						"openai-codex",
					],
				] as const)
					await artifactSink.writeReviewer({
						runId,
						lens,
						spawnId: `spawn-${lens}`,
						sessionId: `session-${lens}`,
						resolvedRole: `coding/${lens}`,
						resolvedModel: { provider, id: lens },
						outcome: "success",
						digest: createHash("sha256").update(fullText).digest("hex"),
						fullText,
					});
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit passed"],
						findings: inFindings ? [entry] : [],
						observations: inFindings ? [] : [entry],
					}),
					gateState: "completed-bound",
					implementerModel: { provider: "openai-codex", id: "worker" },
					requiredLenses: ["reviewer", "security-reviewer"],
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
		expect(report).toContain(
			inFindings ? "Verdict: not-ready" : "Verdict: ready",
		);
		expect(report).toContain(`- ${entry}`);
		expect(report).not.toContain("carried forward as open");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-010
	it.each([
		[
			"base alias",
			{ provider: "openai-codex", id: "worker" },
			"custom/reviewer",
			{ anthropic: ["custom"] },
			"Diversity: attested",
		],
		[
			"missing implementer",
			undefined,
			"anthropic/reviewer",
			undefined,
			"Default implementer model identity missing (INV-002)",
		],
		[
			"unconfigured diverse reviewer",
			{ provider: "openai-codex", id: "worker" },
			undefined,
			undefined,
			"Not configured: qualityReview.diverseReviewerModel; human decision required.",
		],
	] as const)("enforces diversity with %s", async (_name, implementerModel, diverseReviewerModel, modelFamilies, expected) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel,
					checks: [],
					...(modelFamilies ? { modelFamilies } : {}),
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				const fullText = "No findings";
				await artifactSink.writeReviewer({
					runId,
					lens: "reviewer",
					spawnId: "spawn-reviewer",
					sessionId: "session-reviewer",
					resolvedRole: "coding/reviewer",
					resolvedModel: {
						provider: modelFamilies ? "custom" : "anthropic",
						id: "reviewer",
					},
					outcome: "success",
					digest: createHash("sha256").update(fullText).digest("hex"),
					fullText,
				});
				const markdown = renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
				});
				return {
					markdown:
						_name === "unconfigured diverse reviewer"
							? markdown.replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "")
							: markdown,
					gateState: "completed-bound",
					implementerModel,
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
		expect(report).toContain(expected);
		if (_name === "unconfigured diverse reviewer") {
			const summary = await readFile(
				join(
					projectRoot,
					"missions",
					"plans",
					"example",
					"qm-runs",
					`${result.ref.runId}.md`,
				),
				"utf8",
			);
			for (const text of [report, summary])
				expect(text.split(`- ${expected}`).length - 1).toBe(1);
		}
		expect(report).toContain(
			implementerModel ? "Verdict: not-ready" : "Verdict: failed",
		);
	});

	// @cosmo-behavior plan:qm-chain-safety#B-010
	it.each([
		[
			"renumbered",
			"PF-99 P1 slow path",
			true,
			"PF-99 P1",
			"unmapped P1",
			undefined,
		],
		["raised", "PF-2 P1 slow path", true, "PF-2 P2", "capped at P2", undefined],
		["P0", "PF-2 P0 slow path", true, "PF-2 P2", "capped at P2", undefined],
		[
			"unindexed",
			"PF-2 P1 slow path",
			false,
			"PF-2 P2",
			"capped at P2",
			undefined,
		],
		["omitted", "", true, "PF-2 open", "carried forward as open", undefined],
		[
			"irregular bullet",
			" PF-2 P1 slow path",
			true,
			"could not be capped in place",
			"human decision required",
			undefined,
		],
		[
			"duplicate observation",
			"PF-2 P2 main path",
			true,
			"- PF-2 unsupported performance priority capped at P2.",
			"human decision required",
			"PF-2 P0 older path",
		],
	] as const)("calibrates %s performance findings in the final report", async (_name, finding, indexed, visible, evidence, observation) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "anthropic/reviewer",
					checks: [],
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				for (const [lens, fullText, provider] of [
					["reviewer", "No findings", "anthropic"],
					[
						"performance-reviewer",
						"- id: PF-2\n  priority: P2",
						"openai-codex",
					],
				] as const)
					await artifactSink.writeReviewer({
						runId,
						lens,
						spawnId: `spawn-${lens}`,
						sessionId: `session-${lens}`,
						resolvedRole: `coding/${lens}`,
						resolvedModel: {
							provider,
							id: lens === "reviewer" ? "reviewer" : "performance",
						},
						outcome: "success",
						digest: createHash("sha256").update(fullText).digest("hex"),
						fullText,
					});
				const report = renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
					findings: finding ? [finding] : [],
					observations: observation ? [observation] : [],
				});
				return {
					markdown: indexed
						? report
						: report.replace(/<!-- COSMO_QM_REPORT [\s\S]*? -->/, ""),
					gateState: "completed-bound",
					implementerModel: { provider: "openai-codex", id: "worker" },
					requiredLenses: ["reviewer", "performance-reviewer"],
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
		expect(report).toContain("Verdict: not-ready");
		expect(report).toContain(visible);
		expect(report).toContain(evidence);
		if (observation) {
			expect(report).toContain(`- ${observation.replace("P0", "P2")}`);
			expect(report).toContain(
				"Finding PF-2 has unsupported performance priority above P2 in observations; human decision required.",
			);
			expect(
				report.match(/## Findings\n\n([\s\S]*?)\n\n## Human decisions/)?.[1],
			).not.toContain("capped at P2");
		}
	});

	// @cosmo-behavior plan:qm-chain-safety#B-010
	it("caps unsupported performance P1 and blocks lens-only closure in the completed report", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "anthropic/reviewer",
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
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({ runId, artifactSink }) => {
				for (const [lens, fullText] of [
					[
						"reviewer",
						"- id: F-1\n  status: resolved\n  evidence: my own assertion",
					],
					[
						"performance-reviewer",
						"- id: PF-1\n  priority: P1\n  measuredCost: asserted 20 ms",
					],
				] as const) {
					await artifactSink.writeReviewer({
						runId,
						lens,
						spawnId: `spawn-${lens}`,
						sessionId: `session-${lens}`,
						resolvedRole: `coding/${lens}`,
						resolvedModel:
							lens === "reviewer"
								? { provider: "anthropic", id: "reviewer" }
								: { provider: "openai-codex", id: "performance" },
						outcome: "success",
						digest: createHash("sha256").update(fullText).digest("hex"),
						fullText,
					});
				}
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
						gates: ["audit passed"],
						findings: ["PF-1 priority: P1 costly path"],
					}),
					gateState: "completed-bound",
					implementerModel: { provider: "openai-codex", id: "worker" },
					requiredLenses: ["reviewer", "performance-reviewer"],
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
		expect(report).toContain("Verdict: not-ready");
		expect(report).toContain("PF-1 priority: P2 costly path");
		expect(report).toContain(
			"Finding F-1 was omitted from the QM report; carried forward as open.",
		);
		expect(report).toContain("Diversity: attested");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-008
	it("fails the configured suppression check for an unregistered directive", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await mkdir(join(projectRoot, "lib"));
		await writeFile(
			join(projectRoot, "lib", "a.ts"),
			"export const value = 1;\n",
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "suppression-exceptions.json"),
			'{"version":1,"entries":[]}\n',
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "suppressions",
							command: "bun",
							args: [
								resolve("scripts/check-new-suppressions.ts"),
								"--base",
								"{base}",
							],
						},
					],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", "."], { cwd: projectRoot });
		execFileSync("git", ["commit", "-qm", "base files"], { cwd: projectRoot });
		await writeFile(
			join(projectRoot, "lib", "a.ts"),
			"// @ts-expect-error intentional\nunsafe();\n",
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
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
		expect(report).toContain("suppressions: argv");
		expect(report).toContain("exit 1");
		expect(report).toContain("lib/a.ts:1");
	});

	it("retains the private workspace while a timed-out reviewer is still live", async () => {
		const projectRoot = await root(true);
		let retainedWorkspace = "";
		try {
			const result = await runQualityReview({
				projectRoot,
				execute: async ({ workspaceRoot, activeChildIds }) => {
					retainedWorkspace = workspaceRoot ?? "";
					activeChildIds.add("live-reviewer");
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "clear",
						}),
						requiredLenses: ["reviewer"],
					};
				},
			});
			expect(result.stepResult.outcome).toBe("failed");
			expect((await stat(retainedWorkspace)).isDirectory()).toBe(true);
			const lifecycle = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"lifecycle.jsonl",
				),
				"utf8",
			);
			expect(lifecycle).toContain('"activeChildIds":["live-reviewer"]');
		} finally {
			if (retainedWorkspace)
				await removePrivateReviewWorkspace(retainedWorkspace);
		}
	});

	it("does not substitute a reviewer artifact that settles after the failed assessment", async () => {
		const projectRoot = await root(true);
		let retainedWorkspace = "";
		let lateSink:
			| Parameters<
					NonNullable<Parameters<typeof runQualityReview>[0]["execute"]>
			  >[0]["artifactSink"]
			| undefined;
		try {
			const result = await runQualityReview({
				projectRoot,
				execute: async ({ workspaceRoot, activeChildIds, artifactSink }) => {
					retainedWorkspace = workspaceRoot ?? "";
					lateSink = artifactSink;
					activeChildIds.add("live-reviewer");
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "clear",
						}),
						requiredLenses: ["reviewer"],
					};
				},
			});
			const reportPath = join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
				"final.md",
			);
			const before = await readFile(reportPath);
			const fullText = "late review";
			expect(() =>
				lateSink?.writeReviewer({
					runId: result.ref.runId,
					lens: "reviewer",
					spawnId: "live-reviewer",
					sessionId: "late-session",
					resolvedRole: "coding/reviewer",
					resolvedModel: { provider: "test", id: "late" },
					outcome: "success",
					digest: createHash("sha256").update(fullText).digest("hex"),
					fullText,
				}),
			).toThrow("Reviewer evidence window is closed");
			await expect(
				stat(
					join(
						projectRoot,
						"missions",
						"sessions",
						"chain",
						"runs",
						result.ref.runId,
						"artifacts",
						"qm",
						"reviewers",
						"reviewer.md",
					),
				),
			).rejects.toMatchObject({ code: "ENOENT" });
			expect(await readFile(reportPath)).toEqual(before);
			expect(before.toString()).toContain("Verdict: failed");
		} finally {
			if (retainedWorkspace)
				await removePrivateReviewWorkspace(retainedWorkspace);
		}
	});

	it.each([
		"missing",
		"empty",
		"duplicate",
		"foreign",
	] as const)("fails the assessment for %s reviewer evidence", async (scenario) => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ runId, artifactSink }) => {
				const fullText = scenario === "empty" ? "" : "reviewed";
				const evidence = {
					runId: scenario === "foreign" ? "other-run" : runId,
					lens: "reviewer",
					spawnId: "spawn-one",
					sessionId: "session-one",
					resolvedRole: "coding/reviewer",
					resolvedModel: { provider: "test", id: "model" },
					outcome: "success" as const,
					digest: createHash("sha256").update(fullText).digest("hex"),
					fullText,
				};
				if (scenario !== "missing") await artifactSink.writeReviewer(evidence);
				if (scenario === "duplicate")
					await artifactSink.writeReviewer(evidence);
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
					requiredLenses: ["reviewer"],
				};
			},
		});
		expect(result.stepResult.outcome).toBe("failed");
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
		expect(report).toContain("Verdict: failed");
	});

	it("fails a report returned while a panel child is still live", async () => {
		const projectRoot = await root(true);
		let retainedWorkspace = "";
		try {
			const result = await runQualityReview({
				projectRoot,
				execute: async ({ workspaceRoot, activeChildIds }) => {
					retainedWorkspace = workspaceRoot ?? "";
					activeChildIds.add("live-reviewer");
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "clear",
						}),
					};
				},
			});
			expect(result.stepResult.outcome).toBe("failed");
			expect((await stat(retainedWorkspace)).isDirectory()).toBe(true);
		} finally {
			if (retainedWorkspace)
				await removePrivateReviewWorkspace(retainedWorkspace);
		}
	});

	it("does not run host checks after a failed assessment", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.stdout.write('passed')"],
						},
					],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "configured checks"], {
			cwd: projectRoot,
		});
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => {
				throw new Error("panel failed");
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
		expect(report).toContain("Verdict: failed");
		expect(report).toContain("panel failed");
		expect(report).not.toContain("ok: argv");
		const checks = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
				"checks.md",
			),
			"utf8",
		);
		expect(checks).toContain(
			"Not run: review evidence did not seal or assessment failed",
		);
	});

	it("keeps visible findings when reviewer correlation fails after assessment", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "not-ready",
					reason: "finding",
					findings: [
						"F-1 P2 severity high src/a.ts:7; suggested fix: guard nil; failing input: null",
					],
				}),
				requiredLenses: ["reviewer"],
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
		expect(result.stepResult.outcome).toBe("failed");
		expect(report).toContain("Verdict: failed");
		expect(report).toContain("F-1 P2 severity high src/a.ts:7");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-005
	it("keeps actionable report sections in both the full report and plan summary", async () => {
		const projectRoot = await root(true);
		const markdown = renderQualityReviewReport({
			verdict: "not-ready",
			reason: "one finding",
			checks: [
				'test: argv ["bun","run","test"], exit 1, duration 25 ms, output failed',
			],
			gates: ["changed-scope: failed; introduced finding at src/a.ts:7"],
			findings: [
				"F-1 P2 severity high src/a.ts:7; suggested fix: guard nil; failing input: null",
			],
			humanItems: ["Gate-owned file changed: .cosmonauts/config.json"],
			observations: [
				"Pre-existing: src/old.ts:2",
				"Out-of-range: docs/old.md:3",
			],
			reviewed: ["Reviewed full captured diff and neighboring test"],
			reviewerModels: ["reviewer: test/observed"],
		});
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			execute: async () => ({ markdown }),
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
		const summary = await readFile(
			join(
				projectRoot,
				"missions",
				"plans",
				"example",
				"qm-runs",
				`${result.ref.runId}.md`,
			),
			"utf8",
		);
		for (const evidence of [
			"Verdict: not-ready",
			"argv",
			"exit 1",
			"duration 25 ms",
			"changed-scope: failed",
			"F-1 P2 severity high src/a.ts:7",
			"failing input: null",
			"Gate-owned file changed",
			"Pre-existing:",
			"Out-of-range:",
			"Reviewed full captured diff",
			"reviewer: test/observed",
		])
			for (const output of [report, summary])
				expect(output).toContain(evidence);
	});

	it("does not accept a ready verdict with reported findings", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "test/other",
					checks: [{ id: "ok", command: process.execPath, args: ["-e", ""] }],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "configured review"], {
			cwd: projectRoot,
		});
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					findings: ["F-1 P2 high src/a.ts:1 fix it"],
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
		expect(report).toContain("F-1 P2 high src/a.ts:1 fix it");
	});

	// @cosmo-behavior plan:qm-chain-safety#B-002
	it("launches assessment from a private snapshot containing untracked work", async () => {
		const projectRoot = await root();
		const git = async (...args: string[]) => {
			const { execFileSync } = await import("node:child_process");
			return execFileSync("git", args, {
				cwd: projectRoot,
				encoding: "utf8",
			}).trim();
		};
		await git("init", "-q");
		await git("config", "user.email", "test@example.com");
		await git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await writeFile(join(projectRoot, "tracked.txt"), "base\n");
		await git("add", "tracked.txt", ".gitignore");
		await git("commit", "-qm", "base");
		await writeFile(join(projectRoot, "tracked.txt"), "changed\n");
		await writeFile(join(projectRoot, "untracked.txt"), "added\n");
		let observed = false;
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ workspaceRoot, materialsRoot }) => {
				observed =
					workspaceRoot !== projectRoot &&
					materialsRoot !== workspaceRoot &&
					((await stat(materialsRoot ?? "")).mode & 0o222) === 0 &&
					(await readFile(join(workspaceRoot ?? "", "tracked.txt"), "utf8")) ===
						"changed\n" &&
					(await readFile(
						join(workspaceRoot ?? "", "untracked.txt"),
						"utf8",
					)) === "added\n";
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
				};
			},
		});
		expect({ outcome: result.stepResult.outcome, observed }).toEqual({
			outcome: "success",
			observed: true,
		});
	});

	it("preserves staged deletion and source index while building review materials", async () => {
		const projectRoot = await root();
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await writeFile(join(projectRoot, "gone.txt"), "original\n");
		git("add", "gone.txt", ".gitignore");
		git("commit", "-qm", "base");
		await rm(join(projectRoot, "gone.txt"));
		git("add", "-A");
		await writeFile(join(projectRoot, "added.txt"), "new\n");
		const indexBefore = await readFile(join(projectRoot, ".git", "index"));
		let observed = false;
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ workspaceRoot, materialsRoot }) => {
				const diff = await readFile(
					join(materialsRoot ?? "", "full.diff"),
					"utf8",
				);
				observed =
					diff.includes("gone.txt") &&
					diff.includes("added.txt") &&
					(await readFile(
						join(materialsRoot ?? "", "base", "gone.txt"),
						"utf8",
					)) === "original\n";
				await expect(
					readFile(join(workspaceRoot ?? "", "gone.txt")),
				).rejects.toMatchObject({ code: "ENOENT" });
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
				};
			},
		});
		expect({
			outcome: result.stepResult.outcome,
			observed,
			indexUnchanged: (
				await readFile(join(projectRoot, ".git", "index"))
			).equals(indexBefore),
		}).toEqual({ outcome: "success", observed: true, indexUnchanged: true });
	});

	it("captures a same-size edit with a stale Git stat cache without refreshing the source index", async () => {
		const projectRoot = await root();
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		const trackedPath = join(projectRoot, "tracked.txt");
		await writeFile(trackedPath, "before\n");
		git("add", "tracked.txt", ".gitignore");
		git("commit", "-qm", "base");
		const original = await stat(trackedPath);
		await writeFile(trackedPath, "after!\n");
		await utimes(trackedPath, original.atime, original.mtime);
		const indexBefore = await readFile(join(projectRoot, ".git", "index"));
		const headBefore = git("rev-parse", "HEAD");
		const refsBefore = git("for-each-ref", "--format=%(refname) %(objectname)");
		let observed = false;
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ workspaceRoot, materialsRoot }) => {
				observed =
					(await readFile(join(workspaceRoot ?? "", "tracked.txt"), "utf8")) ===
						"after!\n" &&
					(
						await readFile(join(materialsRoot ?? "", "full.diff"), "utf8")
					).includes("after!");
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
				};
			},
		});
		expect(result.stepResult.outcome).toBe("success");
		expect(observed).toBe(true);
		expect(await readFile(trackedPath, "utf8")).toBe("after!\n");
		expect(await readFile(join(projectRoot, ".git", "index"))).toEqual(
			indexBefore,
		);
		expect(git("rev-parse", "HEAD")).toBe(headBefore);
		expect(git("for-each-ref", "--format=%(refname) %(objectname)")).toBe(
			refsBefore,
		);
	});

	it.each([
		"exit",
		"timeout",
	] as const)("persists a preparation %s and removes its private workspace", async (failure) => {
		const projectRoot = await root();
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					prepare: [
						{
							id: "dependencies",
							command: process.execPath,
							args: [
								"-e",
								failure === "exit"
									? "process.exit(5)"
									: "setInterval(() => {}, 1000)",
							],
							timeoutMs: failure === "timeout" ? 100 : 5000,
						},
					],
				},
			}),
		);
		git("add", ".cosmonauts/config.json", ".gitignore");
		git("commit", "-qm", "base");
		const result = await runQualityReview({
			projectRoot,
			execute: async () => ({ markdown: "" }),
		});
		const artifactsRoot = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		const report = await readFile(join(artifactsRoot, "final.md"), "utf8");
		const checks = await readFile(join(artifactsRoot, "checks.md"), "utf8");
		const lifecycle = (
			await readFile(join(artifactsRoot, "lifecycle.jsonl"), "utf8")
		)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { phase: string; workspace?: string });
		const workspace = lifecycle.find(
			(event) => event.phase === "workspace-reserved",
		)?.workspace;
		expect({
			outcome: result.stepResult.outcome,
			named: report.includes("dependencies"),
			timeoutNamed: failure === "exit" || report.includes("timed out"),
			checks: checks.includes("dependencies"),
			removed:
				typeof workspace === "string" &&
				!(await import("node:fs")).existsSync(workspace),
		}).toEqual({
			outcome: "failed",
			named: true,
			timeoutNamed: true,
			checks: true,
			removed: true,
		});
	});

	it("refuses an escaping symlink before assessment and removes the reserved path", async () => {
		const projectRoot = await root();
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, "base.txt"), "base\n");
		git("add", "base.txt");
		git("commit", "-qm", "base");
		await symlink("../outside", join(projectRoot, "escape"));
		let executed = false;
		const result = await runQualityReview({
			projectRoot,
			execute: async () => {
				executed = true;
				return { markdown: "" };
			},
		});
		const artifactsRoot = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		const report = await readFile(join(artifactsRoot, "final.md"), "utf8");
		const lifecycle = (
			await readFile(join(artifactsRoot, "lifecycle.jsonl"), "utf8")
		)
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as {
						phase: string;
						workspace?: string;
						disposition: string;
						artifactDigests: string[];
					},
			);
		const reserved = lifecycle.find(
			(event) => event.phase === "workspace-reserved",
		)?.workspace;
		expect({
			outcome: result.stepResult.outcome,
			executed,
			named: report.includes("Unsafe symlink"),
			removed: reserved && !(await import("node:fs")).existsSync(reserved),
		}).toEqual({
			outcome: "blocked",
			executed: false,
			named: true,
			removed: true,
		});
	});

	it.each([
		["ready", "completed"],
		["not-ready", "completed"],
		["refused", "failed"],
		["failed", "failed"],
	] as const)("persists %s before the %s terminal event", async (verdict, status) => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			execute: async () => ({
				markdown: renderQualityReviewReport({ verdict, reason: "test" }),
			}),
		});
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		const normalized = await runStatus(store, result.ref);
		expect(normalized?.status).toBe(status);
		const lifecycle = (
			await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"lifecycle.jsonl",
				),
				"utf8",
			)
		)
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as {
						phase: string;
						workspace?: string;
						disposition: string;
						artifactDigests: string[];
					},
			);
		const reserved = lifecycle.find(
			(event) => event.phase === "workspace-reserved",
		)?.workspace;
		expect(reserved).toBeTruthy();
		expect((await import("node:fs")).existsSync(reserved ?? "")).toBe(false);
		expect(
			normalized?.artifacts?.some((artifact) => artifact.id === "qm/final.md"),
		).toBe(true);
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
		const terminalPhases = lifecycle.filter((event) =>
			["finalized", "retained"].includes(event.phase),
		);
		expect(terminalPhases).toHaveLength(1);
		expect(terminalPhases[0]?.disposition).toBe("pending-removal");
		expect(lifecycle.at(-1)?.disposition).toBe("removed");
		expect(terminalPhases[0]?.artifactDigests).toContain(
			createHash("sha256").update(report).digest("hex"),
		);
		expect(report).toContain(
			`Verdict: ${verdict === "refused" ? "failed" : verdict}`,
		);
		const summary = await readFile(
			join(
				projectRoot,
				"missions",
				"plans",
				"example",
				"qm-runs",
				`${result.ref.runId}.md`,
			),
			"utf8",
		);
		expect(summary).toContain(
			`Verdict: ${verdict === "refused" ? "failed" : verdict}`,
		);
		const events = (await store.readEvents(result.ref)).events;
		const finalWrite = events.findLastIndex(
			({ event }) =>
				event.type === "artifact_written" &&
				event.artifact.id === "qm/final.md",
		);
		const terminal = events.findIndex(
			({ event }) =>
				event.type === "run_activity" &&
				typeof event.details === "object" &&
				event.details !== null &&
				"phase" in event.details &&
				["finalized", "retained"].includes(String(event.details.phase)),
		);
		expect(finalWrite).toBeLessThan(terminal);
	});

	it("does not write a plan summary without explicit plan identity", async () => {
		const projectRoot = await root();
		await runQualityReview({ projectRoot });
		await expect(
			readdir(join(projectRoot, "missions", "plans")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("persists a failed setup verdict when assessment is not attached", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({ projectRoot });
		expect(result.stepResult.outcome).toBe("failed");
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
		expect(report).toContain("Verdict: failed");
		expect(report).toContain("Quality review assessment is not attached.");
	});

	it("refuses an assessment callback when private workspace capture fails", async () => {
		const projectRoot = await root();
		let called = false;
		const result = await runQualityReview({
			projectRoot,
			execute: async () => {
				called = true;
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "unsafe",
					}),
				};
			},
		});
		expect(result.stepResult.outcome).toBe("blocked");
		expect(called).toBe(false);
	});

	it("cancels with a failed report verdict naming caller cancellation", async () => {
		const projectRoot = await root();
		const controller = new AbortController();
		controller.abort();
		const result = await runQualityReview({
			projectRoot,
			signal: controller.signal,
		});
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		expect((await runStatus(store, result.ref))?.status).toBe("cancelled");
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
		expect(report).toContain("Verdict: failed");
		expect(report).toContain("Caller cancellation");
	});

	it.each([
		"prepare",
		"checks",
		"assessment",
	] as const)("cancels promptly during %s", async (stage) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		const marker = join(projectRoot, `${stage}.started`);
		const slow = {
			id: "slow",
			command: process.execPath,
			args: [
				"-e",
				"require('node:fs').writeFileSync(process.argv[1], 'started'); setInterval(() => {}, 1000)",
				marker,
			],
			timeoutMs: 10_000,
		};
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					prepare: stage === "prepare" ? [slow] : [],
					checks: stage === "checks" ? [slow] : [],
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		const controller = new AbortController();
		const started = Date.now();
		let assessmentSignalAborted = false;
		const pending = runQualityReview({
			projectRoot,
			signal: controller.signal,
			hostChecks: stage === "checks",
			execute: async ({ signal }) => {
				if (stage !== "assessment")
					return {
						markdown: renderQualityReviewReport({
							verdict: "not-ready",
							reason: "review complete",
						}),
					};
				signal?.addEventListener(
					"abort",
					() => {
						assessmentSignalAborted = true;
					},
					{ once: true },
				);
				await writeFile(marker, "started");
				await new Promise(() => {});
				return { markdown: "" };
			},
		});
		try {
			let reached = false;
			for (let attempt = 0; attempt < 150; attempt++) {
				try {
					await readFile(marker);
					reached = true;
					break;
				} catch {
					await new Promise((resolve) => setTimeout(resolve, 20));
				}
			}
			expect(reached).toBe(true);
		} finally {
			controller.abort();
		}
		const result = await pending;
		if (stage === "assessment") expect(assessmentSignalAborted).toBe(true);
		expect(result.stepResult.outcome).toBe("cancelled");
		expect(Date.now() - started).toBeLessThan(
			stage === "assessment" ? 5000 : 3000,
		);
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
		expect(report).toContain("Caller cancellation");
		expect(report).toContain("Verdict: failed");
	});

	it("ends a stalled assessment at its configured deadline and retains live child workspace", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { assessmentTimeoutMs: 100 } }),
		);
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ activeChildIds }) => {
				activeChildIds.add("live-reviewer");
				await new Promise(() => {});
				return { markdown: "" };
			},
		});
		expect(result.stepResult.outcome).toBe("failed");
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
		expect(await readFile(join(artifacts, "final.md"), "utf8")).toContain(
			"QM assessment deadline exceeded after 100ms",
		);
		const lifecycle = await readFile(
			join(artifacts, "lifecycle.jsonl"),
			"utf8",
		);
		expect(lifecycle).toContain('"phase":"retained"');
		expect(lifecycle).toContain("live-reviewer");
		const reserved = lifecycle
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as { phase: string; workspace?: string })
			.find((event) => event.phase === "workspace-reserved")?.workspace;
		if (reserved) await removePrivateReviewWorkspace(reserved);
	});

	it("retains the workspace when the QM itself ignores abort without a panel child", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			assessmentTimeoutMs: 50,
			execute: async () => new Promise<never>(() => {}),
		});
		const qmRoot = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		const report = await readFile(join(qmRoot, "final.md"), "utf8");
		const lifecycle = (await readFile(join(qmRoot, "lifecycle.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as {
						phase: string;
						workspace?: string;
						liveSession?: string;
					},
			);
		const terminal = lifecycle.filter((event) =>
			["finalized", "retained"].includes(event.phase),
		);
		expect(terminal).toHaveLength(1);
		expect(terminal[0]).toMatchObject({
			phase: "retained",
			liveSession: "quality-manager",
		});
		expect(report).toContain("QM session did not settle");
		const reserved = lifecycle.find(
			(event) => event.phase === "workspace-reserved",
		)?.workspace;
		expect(reserved).toBeDefined();
		if (reserved) {
			expect((await stat(reserved)).isDirectory()).toBe(true);
			await removePrivateReviewWorkspace(reserved);
		}
	});

	it("records the configured panel completion timeout in the final report", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ qualityReview: { panelTimeoutMs: 1234 } }),
		);
		await commitBaseConfig(projectRoot);
		const result = await runQualityReview({
			projectRoot,
			execute: async () => {
				throw new Error("reviewer completion timed out");
			},
		});
		expect(result.stepResult.outcome).toBe("failed");
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
		expect(report).toContain("Panel completion timeout: 1234 ms");
	});
	it("records omitted skill locations and the non-authoritative operator note", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			operatorNote: "review only src/a.ts",
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "not-ready",
					reason: "review",
				}),
				omittedSkillPaths: ["/source/node_modules/cosmonauts/skills/security"],
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
		expect(report).toContain(
			"Omitted skill locations: /source/node_modules/cosmonauts/skills/security",
		);
		expect(report).toContain(
			'Operator note (non-authoritative): "review only src/a.ts"',
		);
	});

	it("redacts source, real source and host store paths before the quality prompt and report", async () => {
		const source = await root(true);
		const alias = join(tmpdir(), `qm-source-alias-${Date.now()}`);
		await symlink(source, alias);
		roots.push(alias);
		const hostStore = join(alias, "missions", "sessions");
		const note = `Review ${alias}/lib/a.ts, ${await (await import("node:fs/promises")).realpath(source)}/lib/b.ts and ${hostStore}/chain`;
		let received = "";
		const result = await runQualityReview({
			projectRoot: alias,
			operatorNote: note,
			execute: async ({ operatorNote }) => {
				received = operatorNote ?? "";
				return {
					markdown: renderQualityReviewReport({
						verdict: "not-ready",
						reason: "finding",
					}),
				};
			},
		});
		const report = await readFile(
			join(
				alias,
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
		for (const path of [alias, source, hostStore]) {
			expect(received).not.toContain(path);
			expect(report).not.toContain(path);
		}
		expect(received).toContain("[private path]");
	});
	it("records omitted skills when the QM session fails before returning an assessment", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			execute: async ({ omittedSkillPaths }) => {
				omittedSkillPaths.push(
					"/source/node_modules/cosmonauts/skills/security",
				);
				throw new Error("session failed");
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
		expect(report).toContain(
			"Omitted skill locations: /source/node_modules/cosmonauts/skills/security",
		);
	});

	it("records a grandchild check timeout in checks.md", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "tree",
							command: process.execPath,
							args: [
								"-e",
								"require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 'inherit', 'inherit']}); setInterval(() => {}, 1000)",
							],
							timeoutMs: 200,
						},
					],
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		const started = Date.now();
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
				}),
			}),
		});
		expect(Date.now() - started).toBeLessThan(3000);
		const checks = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
				"checks.md",
			),
			"utf8",
		);
		expect(checks).toContain("## tree");
		expect(checks).toContain("timed out: true");
	});

	it("retains malformed raw output and fails report integrity", async () => {
		const projectRoot = await root(true);
		const result = await runQualityReview({
			projectRoot,
			execute: async () => ({ markdown: "Verdict: ready\nNo sections" }),
		});
		expect(
			result.stepResult.artifacts.map((artifact) => artifact.id).sort(),
		).toEqual(["qm/checks.md", "qm/final.md", "qm/raw-final.md"]);
		const base = join(
			projectRoot,
			"missions",
			"sessions",
			"chain",
			"runs",
			result.ref.runId,
			"artifacts",
			"qm",
		);
		expect(await readFile(join(base, "raw-final.md"), "utf8")).toBe(
			"Verdict: ready\nNo sections",
		);
		expect(await readFile(join(base, "final.md"), "utf8")).toContain(
			"Verdict: failed",
		);
	});

	it("keeps a ready verdict when only the index is unavailable", async () => {
		const projectRoot = await root(true);
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
			checks: ["unit: pass"],
			observations: ["Pre-existing: src/old.ts:2"],
			reviewed: ["Reviewed captured diff against base"],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			execute: async () => ({ markdown }),
		});
		expect(result.stepResult.outcome).toBe("success");
		expect(result.stepResult.summary).toBe(
			summarizeAssistantText(markdown, "quality-manager"),
		);
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
		expect(report).toContain("Index unavailable.");
		const summary = await readFile(
			join(
				projectRoot,
				"missions",
				"plans",
				"example",
				"qm-runs",
				`${result.ref.runId}.md`,
			),
			"utf8",
		);
		expect(summary).toContain("Pre-existing: src/old.ts:2");
		expect(summary).toContain("Reviewed captured diff against base");
		expect(summary).toContain("unit: pass");
	});

	it("preserves an unindexed report when host checks are configured", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "test/other",
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.stdout.write('passed')"],
						},
					],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "configured checks"], {
			cwd: projectRoot,
		});
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
			gates: ["changed-scope: pass from direct audit"],
			observations: ["Pre-existing src/a.ts:7 branch"],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({ markdown }),
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
		expect(report).toContain("Pre-existing src/a.ts:7 branch");
		expect(report).toContain("ok: argv");
		expect(report).toContain("Index unavailable");
	});

	it("isolates concurrent run IDs, reports and plan summaries", async () => {
		const projectRoot = await root(true);
		const [first, second] = await Promise.all([
			runQualityReview({
				projectRoot,
				planSlug: "example",
				execute: async () => ({
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "first",
					}),
				}),
			}),
			runQualityReview({
				projectRoot,
				planSlug: "example",
				execute: async () => ({
					markdown: renderQualityReviewReport({
						verdict: "not-ready",
						reason: "second",
					}),
				}),
			}),
		]);
		expect(first.ref.runId).not.toBe(second.ref.runId);
		const summaries = await readdir(
			join(projectRoot, "missions", "plans", "example", "qm-runs"),
		);
		expect(summaries).toHaveLength(2);
	});

	it("records the reserved workspace before failed capture and removes it on refusal", async () => {
		const projectRoot = await root();
		const result = await runQualityReview({ projectRoot });
		const lifecycle = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
				"lifecycle.jsonl",
			),
			"utf8",
		);
		const reserved = join(tmpdir(), `cosmonauts-qm-${result.ref.runId}`);
		expect(lifecycle).toContain('"phase":"workspace-reserved"');
		expect(lifecycle).toContain('"previousPhase":"allocated"');
		expect(lifecycle).toContain(reserved);
		expect(result.stepResult.outcome).toBe("blocked");
		await expect(readFile(reserved, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("keeps the conservative report when atomic replacement cannot write", async () => {
		const projectRoot = await root(true);
		let artifactDir = "";
		try {
			const result = await runQualityReview({
				projectRoot,
				planSlug: "example",
				execute: async ({ runId }) => {
					artifactDir = join(
						projectRoot,
						"missions",
						"sessions",
						"chain",
						"runs",
						runId,
						"artifacts",
						"qm",
					);
					await chmod(artifactDir, 0o500);
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "test",
						}),
					};
				},
			});
			expect(result.stepResult.outcome).toBe("failed");
			expect(await readFile(join(artifactDir, "final.md"), "utf8")).toContain(
				"Verdict: failed",
			);
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"plans",
						"example",
						"qm-runs",
						`${result.ref.runId}.md`,
					),
					"utf8",
				),
			).toContain("Verdict: failed");
		} finally {
			if (artifactDir) await chmod(artifactDir, 0o700);
		}
	});

	it("fails visibly if the plan summary directory escapes through a symlink", async () => {
		const projectRoot = await root();
		await mkdir(join(projectRoot, "missions", "plans"), { recursive: true });
		await symlink(tmpdir(), join(projectRoot, "missions", "plans", "example"));
		const result = await runQualityReview({ projectRoot, planSlug: "example" });
		expect(result.stepResult.outcome).toBe("failed");
		expect(result.stepResult.summary).toContain(
			"Plan summary initialization failed",
		);
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		expect((await runStatus(store, result.ref))?.status).toBe("failed");
	});

	it("leaves the reached lifecycle phase and conservative report after host death", async () => {
		const projectRoot = await root(true);
		const modulePath = fileURLToPath(
			new URL("../../lib/orchestration/quality-review-run.ts", import.meta.url),
		);
		const script = `import { runQualityReview } from ${JSON.stringify(modulePath)}; setInterval(() => {}, 1000); await runQualityReview({ projectRoot: ${JSON.stringify(projectRoot)}, execute: async ({ runId }) => { process.stdout.write(runId + "\\n"); await new Promise(() => {}); return { markdown: "" }; } });`;
		const child = spawn("bun", ["-e", script], {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let errorText = "";
		let reservedRoot: string | undefined;
		child.stderr?.on("data", (chunk: Buffer) => {
			errorText += chunk.toString();
		});
		try {
			const runId = await new Promise<string>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error(`QM child did not start: ${errorText}`)),
					15_000,
				);
				child.stdout?.once("data", (chunk: Buffer) => {
					clearTimeout(timeout);
					resolve(chunk.toString().trim());
				});
				child.once("exit", (code) => {
					clearTimeout(timeout);
					reject(new Error(`QM child exited ${code}: ${errorText}`));
				});
			});
			reservedRoot = join(tmpdir(), `cosmonauts-qm-${runId}`);
			child.kill("SIGKILL");
			await new Promise((resolve) => child.once("exit", resolve));
			const base = join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				runId,
				"artifacts",
				"qm",
			);
			const lifecycle = await readFile(join(base, "lifecycle.jsonl"), "utf8");
			expect(lifecycle).toContain('"phase":"assessing"');
			expect(lifecycle).toContain('"previousPhase":"snapshot-ready"');
			expect(await readFile(join(base, "final.md"), "utf8")).toContain(
				"Verdict: failed",
			);
			const store = new FileRunStore({
				rootDir: join(projectRoot, "missions", "sessions"),
			});
			expect(
				(await runStatus(store, { scope: "chain", runId }))?.artifacts?.[0]?.id,
			).toBe("qm/final.md");
		} finally {
			if (!child.killed) child.kill("SIGKILL");
			if (reservedRoot) await removePrivateReviewWorkspace(reservedRoot);
		}
	}, 25_000);

	it("makes a new pretest script a human decision item", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ scripts: { test: "node -e \"console.log('base')\"" } }),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					diverseReviewerModel: "test/other",
					checks: [{ id: "test", command: "bun", args: ["run", "test"] }],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", "package.json", ".cosmonauts/config.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "base scripts"], {
			cwd: projectRoot,
		});
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({
				scripts: {
					test: "node -e \"console.log('base')\"",
					pretest: 'node -e "process.exit(0)"',
				},
			}),
		);
		const result = await launchQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState: "completed-bound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
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
		expect(report).toContain(
			"Gate-owned file changed: package.json; human decision required.",
		);
	});

	it("uses the base gateOwnedPaths when the reviewed change edits a runner", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await mkdir(join(projectRoot, "scripts"));
		await writeFile(
			join(projectRoot, "scripts", "runner.mjs"),
			"console.log('base');\n",
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					gateOwnedPaths: ["scripts/runner.mjs"],
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
					diverseReviewerModel: "test/other",
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync(
			"git",
			["add", "scripts/runner.mjs", ".cosmonauts/config.json"],
			{ cwd: projectRoot },
		);
		execFileSync("git", ["commit", "-qm", "base gate paths"], {
			cwd: projectRoot,
		});
		await writeFile(
			join(projectRoot, "scripts", "runner.mjs"),
			"console.log('changed');\n",
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					gateOwnedPaths: [],
					checks: [
						{
							id: "ok",
							command: process.execPath,
							args: ["-e", "process.exit(0)"],
						},
					],
					diverseReviewerModel: "test/other",
				},
			}),
		);
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => ({
				gateState: "completed-bound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
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
		expect(report).toContain(
			"Gate-owned file changed: scripts/runner.mjs; human decision required.",
		);
	});

	it("flags a removed Biome rule from this repository's base-owned gate paths", async () => {
		const projectRoot = await root(true);
		const configured = JSON.parse(
			await readFile(
				resolve(
					fileURLToPath(import.meta.url),
					"..",
					"..",
					"..",
					".cosmonauts",
					"config.json",
				),
				"utf8",
			),
		) as { qualityReview: { gateOwnedPaths: string[] } };
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					gateOwnedPaths: configured.qualityReview.gateOwnedPaths,
					diverseReviewerModel: "test/other",
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
		await writeFile(
			join(projectRoot, "biome.json"),
			JSON.stringify({
				linter: { rules: { suspicious: { noExplicitAny: "error" } } },
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json", "biome.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "base gate"], { cwd: projectRoot });
		await writeFile(
			join(projectRoot, "biome.json"),
			JSON.stringify({ linter: { rules: {} } }),
		);
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => ({
				gateState: "completed-bound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
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
		expect(indexedQualityReviewReport(report)?.humanItems).toContain(
			"Gate-owned file changed: biome.json; human decision required.",
		);
	});

	it("lists an executable package script change once even when package.json is gate-owned", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ scripts: { test: "node -e 'process.exit(0)'" } }),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					gateOwnedPaths: ["package.json"],
					diverseReviewerModel: "test/other",
					checks: [{ id: "test", command: "bun", args: ["run", "test"] }],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts/config.json", "package.json"], {
			cwd: projectRoot,
		});
		execFileSync("git", ["commit", "-qm", "base scripts"], {
			cwd: projectRoot,
		});
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ scripts: { test: "node -e 'console.log(1)'" } }),
		);
		const result = await launchQualityReview({
			projectRoot,
			execute: async () => ({
				gateState: "completed-bound",
				markdown: renderQualityReviewReport({
					verdict: "ready",
					reason: "clear",
					gates: ["audit passed"],
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
		expect(
			indexedQualityReviewReport(report)?.humanItems?.filter((item) =>
				item.includes("Gate-owned file changed: package.json"),
			),
		).toHaveLength(1);
	});

	it("does not let a later check rewrite change sealed review evidence", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [
						{
							id: "rewrite",
							command: process.execPath,
							args: [
								"-e",
								"const fs = require('node:fs'); fs.writeFileSync('changed.ts', 'check rewrite'); fs.writeFileSync('late-marker', 'go'); for (let i = 0; i < 200 && !fs.existsSync('late-ack'); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); if (!fs.existsSync('late-ack')) process.exit(1)",
							],
						},
					],
				},
			}),
		);
		await commitBaseConfig(projectRoot);
		await writeFile(
			join(projectRoot, "changed.ts"),
			"export const changed = true;\n",
		);
		let assessed = false;
		let originalReviewer = "";
		let originalMaterials = "";
		let postCheckMaterials = "";
		let postCheckWorkspace = "";
		let lateWrite: Promise<void> | undefined;
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async ({
				artifactSink,
				runId,
				workspaceRoot,
				materialsRoot,
			}) => {
				assessed = true;
				const fullText = "reviewer evidence before checks";
				const reviewer = await artifactSink.writeReviewer({
					runId,
					lens: "reviewer",
					spawnId: "reviewer-spawn",
					sessionId: "reviewer-session",
					resolvedRole: "coding/reviewer",
					resolvedModel: { provider: "test", id: "model" },
					outcome: "success",
					fullText,
					digest: createHash("sha256").update(fullText).digest("hex"),
				});
				originalReviewer = await readFile(reviewer.path, "utf8");
				originalMaterials = await readFile(
					join(materialsRoot ?? "", "full.diff"),
					"utf8",
				);
				lateWrite = (async () => {
					const checkout = workspaceRoot ?? "";
					for (let attempt = 0; attempt < 200; attempt++) {
						if (
							await stat(join(checkout, "late-marker")).then(
								() => true,
								() => false,
							)
						)
							break;
						await new Promise((resolve) => setTimeout(resolve, 5));
					}
					postCheckWorkspace = await readFile(
						join(checkout, "changed.ts"),
						"utf8",
					);
					postCheckMaterials = await readFile(
						join(materialsRoot ?? "", "full.diff"),
						"utf8",
					);
					try {
						const lateText = "late reviewer rewrite";
						await artifactSink.writeReviewer({
							runId,
							lens: "late-reviewer",
							spawnId: "late-spawn",
							sessionId: "late-session",
							resolvedRole: "coding/reviewer",
							resolvedModel: { provider: "test", id: "model" },
							outcome: "success",
							fullText: lateText,
							digest: createHash("sha256").update(lateText).digest("hex"),
						});
					} catch {
						// The reviewer window is closed before the check starts.
					} finally {
						await writeFile(join(checkout, "late-ack"), "done");
					}
				})();
				return {
					markdown: renderQualityReviewReport({
						verdict: "ready",
						reason: "clear",
					}),
				};
			},
		});
		await lateWrite;
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
		expect(
			await readFile(join(artifacts, "reviewers", "reviewer.md"), "utf8"),
		).toBe(originalReviewer);
		await expect(
			readFile(join(artifacts, "reviewers", "late-reviewer.md")),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(postCheckWorkspace).toBe("check rewrite");
		expect(postCheckMaterials).toBe(originalMaterials);
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
		expect(report).not.toContain(
			"Report integrity: materials/full.diff changed before assessment",
		);
		expect(report).toContain("rewrite: argv");
	});

	it("records successful analysis preparation when the assessment fails", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, "package.json"),
			JSON.stringify({ name: "prep-failure-report", version: "1.0.0" }),
		);
		const { execFileSync } = await import("node:child_process");
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
					diverseReviewerModel: "test/other",
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
		const { execFileSync: git } = await import("node:child_process");
		git("git", ["add", "."], { cwd: projectRoot });
		git("git", ["commit", "-qm", "base"], { cwd: projectRoot });
		const result = await runQualityReview({
			projectRoot,
			hostChecks: true,
			execute: async () => {
				throw new Error("session initialization failed");
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
		expect(await readFile(join(artifacts, "checks.md"), "utf8")).toContain(
			"Analysis preparation dependencies: passed",
		);
		const report = await readFile(join(artifacts, "final.md"), "utf8");
		expect(report).toContain("Analysis preparation dependencies: passed");
		expect(report).toContain("session initialization failed");
	});

	it("records earlier analysis preparation successes before a later failure", async () => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				qualityReview: {
					analysisPrepare: ["first", "second"].map((id) => ({
						id,
						command: "bun",
						args: ["install", "--frozen-lockfile", "--ignore-scripts"],
					})),
					diverseReviewerModel: "test/other",
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
		await commitBaseConfig(projectRoot);
		const prepare = vi
			.spyOn(workspaceModule, "preparePrivateReviewWorkspace")
			.mockImplementation(async (_workspace, _signal, config) => {
				if (config?.prepare?.[0]?.id === "first")
					throw new workspaceModule.WorkspacePreparationFailure(
						"Preparation step second failed: frozen lockfile mismatch",
						[{ id: "first", durationMs: 2 }],
					);
				return [];
			});
		let assessed = false;
		try {
			const result = await runQualityReview({
				projectRoot,
				hostChecks: true,
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
			for (const name of ["checks.md", "final.md"]) {
				const contents = await readFile(join(artifacts, name), "utf8");
				expect(contents).toContain("Analysis preparation first: passed");
				expect(contents).toContain("Analysis preparation second: failed");
			}
			expect(assessed).toBe(true);
		} finally {
			prepare.mockRestore();
		}
	});

	it.each([
		true,
		false,
	])("keeps an observed failing audit after analysis preparation fails (indexed: %s)", async (indexed) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, ".cosmonauts"));
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
					diverseReviewerModel: "test/other",
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
		await commitBaseConfig(projectRoot);
		const prepare = vi
			.spyOn(workspaceModule, "preparePrivateReviewWorkspace")
			.mockRejectedValue(
				new workspaceModule.WorkspacePreparationFailure(
					"frozen lockfile mismatch",
					[],
				),
			);
		try {
			const markdown = renderQualityReviewReport({
				verdict: "ready",
				reason: "clear",
				gates: ["QM claimed audit passed"],
			});
			const result = await runQualityReview({
				projectRoot,
				hostChecks: true,
				execute: async () => ({
					gateState: "Analysis audit gate state: fail",
					auditFindings: [
						"f1 P1 lib/a.ts:17 dead-code error: unused export; fix: remove export",
					],
					markdown: indexed
						? markdown
						: markdown.replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, ""),
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
			expect(report).toContain("Analysis audit gate state: fail");
			expect(report).toContain(
				"f1 P1 lib/a.ts:17 dead-code error: unused export; fix: remove export",
			);
			expect(report).toContain("Analysis preparation dependencies: failed");
			expect(report).toContain(
				"Analysis preparation failed; human decision required.",
			);
			const gates =
				report.split("## Gates\n")[1]?.split("## Findings\n")[0] ?? "";
			expect(gates).not.toContain("QM claimed audit passed");
			expect(gates).not.toContain("failed-to-run");
		} finally {
			prepare.mockRestore();
		}
	});

	it("clears the setup settle-grace timer when setup settles promptly", async () => {
		const projectRoot = await root(true);
		const controller = new AbortController();
		let started!: () => void;
		const setupStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const timers = new Set<ReturnType<typeof setTimeout>>();
		const timeout = globalThis.setTimeout;
		const clear = globalThis.clearTimeout;
		const setSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: Parameters<typeof setTimeout>[0],
			delay?: number,
		) => {
			const timer = timeout(handler, delay);
			if (delay === 60_000) timers.add(timer);
			return timer;
		}) as typeof setTimeout);
		const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((
			timer: ReturnType<typeof setTimeout>,
		) => {
			timers.delete(timer);
			clear(timer);
		}) as typeof clearTimeout);
		try {
			const startedAt = Date.now();
			const resultPromise = runQualityReview({
				projectRoot,
				signal: controller.signal,
				qmSettleGraceMs: 60_000,
				prepareRuntime: async ({ signal }) => {
					started();
					await new Promise<void>((resolve) =>
						signal.addEventListener("abort", () => setTimeout(resolve, 5), {
							once: true,
						}),
					);
					throw new Error("setup cancelled");
				},
			});
			await setupStarted;
			controller.abort();
			await resultPromise;
			expect(Date.now() - startedAt).toBeLessThan(5000);
			expect(timers.size).toBe(0);
		} finally {
			for (const timer of timers) clear(timer);
			setSpy.mockRestore();
			clearSpy.mockRestore();
		}
	});

	it.each([
		"abort",
		"deadline",
	] as const)("removes a base runtime whose setup settles after %s", async (cause) => {
		const projectRoot = await root(true);
		const controller = new AbortController();
		let started!: () => void;
		const setupStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const resultPromise = runQualityReview({
			projectRoot,
			signal: controller.signal,
			assessmentTimeoutMs: cause === "deadline" ? 40 : 10_000,
			qmSettleGraceMs: 100,
			prepareRuntime: async ({ signal }) => {
				started();
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => setTimeout(resolve, 15), {
						once: true,
					}),
				);
				throw new Error("setup cancelled");
			},
		});
		await setupStarted;
		if (cause === "abort") controller.abort();
		const result = await resultPromise;
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
		expect(report).not.toContain("Live work: base runtime setup");
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		expect(
			(await runStatus(store, result.ref))?.postTerminalDisposition
				?.disposition,
		).toBe("removed");
	});

	it.each([
		"ready",
		"not-ready",
		"failed",
		"refused",
	] as const)("discloses operator authority on a %s exit and plan summary", async (exit) => {
		const projectRoot = await root(true);
		await mkdir(join(projectRoot, "missions", "plans", "example"), {
			recursive: true,
		});
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			...(exit === "refused" ? { refusalReason: "unsupported" } : {}),
			execute: async () => {
				if (exit === "failed") throw new Error("assessment failed");
				return {
					markdown: renderQualityReviewReport({
						verdict: exit,
						reason: "review",
					}),
				};
			},
		});
		const disclosure =
			"Host-run preparation and checks execute the reviewed change's code with the operator's authority, unsandboxed.";
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
		const summary = await readFile(
			join(
				projectRoot,
				"missions",
				"plans",
				"example",
				"qm-runs",
				`${result.ref.runId}.md`,
			),
			"utf8",
		);
		expect(report).toContain(disclosure);
		expect(summary).toContain(disclosure);
	});

	it("redacts tilde paths for a source and an external store root", async () => {
		const source = await mkdtemp(join(homedir(), "qm-source-"));
		const storeRoot = await mkdtemp(join(homedir(), "qm-store-"));
		roots.push(source, storeRoot);
		const { execFileSync } = await import("node:child_process");
		for (const args of [
			["init", "-q"],
			["config", "user.email", "test@example.com"],
			["config", "user.name", "Test"],
		])
			execFileSync("git", args, { cwd: source });
		await writeFile(join(source, ".gitignore"), "missions/sessions/\n");
		execFileSync("git", ["add", ".gitignore"], { cwd: source });
		execFileSync("git", ["commit", "-qm", "base"], { cwd: source });
		const note = `Review ~/${source.slice(homedir().length + 1)}/file and ~/${storeRoot.slice(homedir().length + 1)}/chain`;
		let received = "";
		await runQualityReview({
			projectRoot: source,
			store: new FileRunStore({ rootDir: storeRoot }),
			operatorNote: note,
			execute: async ({ operatorNote }) => {
				received = operatorNote ?? "";
				return {
					markdown: renderQualityReviewReport({
						verdict: "not-ready",
						reason: "review",
					}),
				};
			},
		});
		expect(received).not.toContain(`~/${source.slice(homedir().length + 1)}`);
		expect(received).not.toContain(
			`~/${storeRoot.slice(homedir().length + 1)}`,
		);
		expect(received).toContain("[private path]");
	});

	it("retains the deadline reason when a reviewer write is abandoned", async () => {
		const projectRoot = await root(true);
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		let retainedRoot = "";
		const result = await runQualityReview({
			projectRoot,
			store,
			assessmentTimeoutMs: 40,
			qmSettleGraceMs: 10,
			reviewerSealGraceMs: 20,
			execute: async ({ artifactSink, runId, workspaceRoot }) => {
				if (workspaceRoot) retainedRoot = resolve(workspaceRoot, "..");
				vi.spyOn(store, "loadRun").mockImplementationOnce(
					() => new Promise(() => {}),
				);
				void artifactSink
					.writeReviewer({
						runId,
						lens: "reviewer",
						spawnId: "s",
						sessionId: "s",
						resolvedRole: "coding/reviewer",
						resolvedModel: { provider: "test", id: "model" },
						outcome: "success",
						fullText: "review",
						digest: createHash("sha256").update("review").digest("hex"),
					})
					.catch(() => {});
				await new Promise(() => {});
				return { markdown: "" };
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
		expect(report).toContain("QM assessment deadline exceeded");
		expect(report).toContain(
			"reviewer writes abandoned after sealing grace: reviewer",
		);
		await removePrivateReviewWorkspace(retainedRoot);
	});

	it("uses the bundled quality manager when a user package overrides coding", async () => {
		const projectRoot = await root(true);
		const syntheticHome = await root();
		const previousHome = process.env.HOME;
		process.env.HOME = syntheticHome;
		await writeSyntheticInstallableDomainPackage(
			join(syntheticHome, ".cosmonauts", "packages", "coding"),
			{
				packageName: "coding",
				domainId: "coding",
				agents: [
					{
						id: "quality-manager",
						description: "USER-OVERRIDE",
						model: "test/model",
						tools: "none",
					},
				],
			},
		);
		let selectedDescription: string | undefined;
		const spawned = vi
			.spyOn(spawnerModule, "createPiSpawner")
			.mockImplementation((registry) => {
				selectedDescription = registry.resolve(
					"coding/quality-manager",
				)?.description;
				throw new Error("Stop after registry assertion");
			});
		try {
			await launchQualityReview({ projectRoot });
			expect(spawned).toHaveBeenCalled();
			expect(selectedDescription).toBe(
				"Runs one review-only quality pass and reports findings for caller-owned remediation.",
			);
		} finally {
			spawned.mockRestore();
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
		}
	});

	it("loads base project domains without importing reviewed domains", async () => {
		const projectRoot = await root(true);
		const securityDir = join(projectRoot, ".cosmonauts", "domains", "coding");
		await mkdir(join(securityDir, "agents"), { recursive: true });
		await writeFile(
			join(securityDir, "domain.ts"),
			"export const manifest = { id: 'coding', description: 'base coding' };\n",
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["base-skill"] }),
		);
		const definition = (description: string) =>
			`export default ${JSON.stringify({ id: "security-reviewer", description, capabilities: [], model: "test/model", tools: "none", extensions: [], skills: [], projectContext: false, session: "ephemeral", loop: false })};\n`;
		await writeFile(
			join(securityDir, "agents", "security-reviewer.ts"),
			definition("BASE-OWNED"),
		);
		const baseBlob = definition("BASE-OWNED");
		const blobHash = createHash("sha1")
			.update(`blob ${Buffer.byteLength(baseBlob)}\0`)
			.update(baseBlob)
			.digest("hex");
		const attackMarker = join(projectRoot, "detached-attack-ran");
		const lateMarker = join(projectRoot, "late-import-marker");
		const lateScript = `const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'); setTimeout(()=>{const body=${JSON.stringify(definition("CHANGE-CHOSEN"))}; const blob=z.deflateSync(Buffer.from('blob '+Buffer.byteLength(body)+'\\0'+body)); const obj=path.join('.git','objects',${JSON.stringify(blobHash.slice(0, 2))},${JSON.stringify(blobHash.slice(2))}); fs.mkdirSync(path.dirname(obj),{recursive:true}); fs.writeFileSync(obj,blob); const domain=path.join('..','base-runtime','.cosmonauts','domains','coding','domain.ts'); fs.writeFileSync(domain,${JSON.stringify(`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(lateMarker)}, 'late'); export const manifest = { id: 'coding', description: 'late' };`)}); fs.chmodSync('../materials/full.diff',0o600); fs.writeFileSync('../materials/full.diff','late diff'); fs.writeFileSync(${JSON.stringify(attackMarker)},'done');},100);`;
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({
				skills: ["base-skill"],
				qualityReview: {
					diverseReviewerModel: "anthropic/reviewer",
					checks: [
						{
							id: "tamper",
							command: process.execPath,
							args: [
								"-e",
								`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(lateScript)}],{detached:true,stdio:'ignore'}).unref();`,
							],
						},
					],
				},
			}),
		);
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["add", ".cosmonauts"], { cwd: projectRoot });
		execFileSync("git", ["commit", "-qm", "base domain"], { cwd: projectRoot });
		await writeFile(
			join(securityDir, "agents", "security-reviewer.ts"),
			definition("CHANGE-CHOSEN"),
		);
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["change-skill"] }),
		);
		const evilDir = join(projectRoot, ".cosmonauts", "domains", "evil");
		await mkdir(evilDir, { recursive: true });
		const marker = join(projectRoot, "evil-import-marker");
		await writeFile(
			join(evilDir, "domain.ts"),
			`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'imported'); export const manifest = { id: 'evil', description: 'evil' };\n`,
		);
		const spawned = vi
			.spyOn(spawnerModule, "createPiSpawner")
			.mockImplementation((registry) => {
				expect(registry.resolve("coding/security-reviewer")?.description).toBe(
					"BASE-OWNED",
				);
				return {
					spawn: async (config) => {
						const context = config.qualityReviewContext;
						if (!context) throw new Error("missing quality context");
						expect(context.diverseReviewerModel).toBe("anthropic/reviewer");
						for (const lens of ["reviewer", "security-reviewer"]) {
							const fullText = `${lens} completed`;
							context.attemptedLenses.add(lens);
							await context.artifactSink.writeReviewer({
								runId: context.runId,
								lens,
								spawnId: `spawn-${lens}`,
								sessionId: `session-${lens}`,
								resolvedRole: `coding/${lens}`,
								resolvedModel:
									lens === "reviewer"
										? { provider: "anthropic", id: "reviewer" }
										: { provider: "openai-codex", id: "security" },
								outcome: "success",
								digest: createHash("sha256").update(fullText).digest("hex"),
								fullText,
							});
						}
						return {
							success: true,
							messages: [
								{
									role: "assistant",
									content: [
										{
											type: "text",
											text: renderQualityReviewReport({
												verdict: "ready",
												reason: "clear",
												gates: ["audit passed"],
											}),
										},
									],
								},
							],
							sessionId: "qm-test",
						};
					},
					dispose: () => {},
				} as ReturnType<typeof spawnerModule.createPiSpawner>;
			});
		try {
			const result = await launchQualityReview({
				projectRoot,
				removeWorkspace: async (path) => {
					await new Promise((resolve) => setTimeout(resolve, 400));
					await removePrivateReviewWorkspace(path);
				},
			});
			expect(spawned).toHaveBeenCalled();
			expect(await readFile(attackMarker, "utf8")).toBe("done");
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
			expect(report).toContain("tamper: argv");
			expect(report).toContain("Diversity: attested");
			expect(report).not.toContain("Report integrity: materials/full.diff");
			await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(stat(lateMarker)).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			spawned.mockRestore();
		}
	});
});
