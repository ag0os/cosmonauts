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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRunStore, runStatus } from "../../lib/durable-runtime/index.ts";
import { summarizeAssistantText } from "../../lib/orchestration/assistant-text.ts";
import {
	qualityReviewAuditFindingLines,
	validateQualityReviewAnalysisCalls,
} from "../../lib/orchestration/quality-review-launch.ts";
import {
	indexedQualityReviewReport,
	renderQualityReviewReport,
} from "../../lib/orchestration/quality-review-report.ts";
import {
	DEFAULT_WORKSPACE_REMOVAL_TIMEOUT_MS,
	runQualityReview,
} from "../../lib/orchestration/quality-review-run.ts";
import { removePrivateReviewWorkspace } from "../../lib/orchestration/quality-review-workspace.ts";
import type { SpawnEvent } from "../../lib/orchestration/types.ts";

describe("quality review durable lifecycle", () => {
	it("allows at least a minute for default workspace removal", () => {
		expect(DEFAULT_WORKSPACE_REMOVAL_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
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
			kind: "workspace-disposition",
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

	it("keeps completed host check evidence in a failed assessment report", async () => {
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
		expect(report).toContain("ok: argv");
		expect(report).toContain("passed");
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
});
