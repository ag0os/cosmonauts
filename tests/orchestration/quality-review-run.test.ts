import { spawn } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FileRunStore, runStatus } from "../../lib/durable-runtime/index.ts";
import { summarizeAssistantText } from "../../lib/orchestration/assistant-text.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";
import { runQualityReview } from "../../lib/orchestration/quality-review-run.ts";

describe("quality review durable lifecycle", () => {
	const roots: string[] = [];
	const prepareWorkspace = async ({
		workspaceRoot,
	}: {
		workspaceRoot: string;
	}) => {
		await mkdir(workspaceRoot);
	};
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	async function root(): Promise<string> {
		const path = await mkdtemp(join(tmpdir(), "qm-run-"));
		roots.push(path);
		return path;
	}

	it.each([
		["ready", "completed"],
		["not-ready", "completed"],
		["refused", "blocked"],
		["failed", "failed"],
	] as const)("persists %s before the %s terminal event", async (verdict, status) => {
		const projectRoot = await root();
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			prepareWorkspace,
			execute: async () => ({
				markdown: renderQualityReviewReport({ verdict, reason: "test" }),
			}),
		});
		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		const normalized = await runStatus(store, result.ref);
		expect(normalized?.status).toBe(status);
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
		expect(report).toContain(`Verdict: ${verdict}`);
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
		expect(summary).toContain(`Verdict: ${verdict}`);
		const events = (await store.readEvents(result.ref)).events;
		const finalWrite = events.findLastIndex(
			({ event }) =>
				event.type === "artifact_written" &&
				event.artifact.id === "qm/final.md",
		);
		const terminal = events.findIndex(
			({ event }) =>
				event.type === "run_completed" ||
				event.type === "run_blocked" ||
				event.type === "run_failed",
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

	it("refuses an assessment callback without private workspace preparation", async () => {
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

	it("retains malformed raw output and fails report integrity", async () => {
		const projectRoot = await root();
		const result = await runQualityReview({
			projectRoot,
			prepareWorkspace,
			execute: async () => ({ markdown: "Verdict: ready\nNo sections" }),
		});
		expect(
			result.stepResult.artifacts.map((artifact) => artifact.id).sort(),
		).toEqual(["qm/final.md", "qm/raw-final.md"]);
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
		const projectRoot = await root();
		const markdown = renderQualityReviewReport({
			verdict: "ready",
			reason: "clear",
			checks: ["unit: pass"],
		}).replace(/<!-- COSMO_QM_REPORT[\s\S]*?-->/, "");
		const result = await runQualityReview({
			projectRoot,
			planSlug: "example",
			prepareWorkspace,
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
		expect(summary).toContain("unit: pass");
	});

	it("isolates concurrent run IDs, reports and plan summaries", async () => {
		const projectRoot = await root();
		const [first, second] = await Promise.all([
			runQualityReview({
				projectRoot,
				planSlug: "example",
				prepareWorkspace,
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
				prepareWorkspace,
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

	it("records the reserved workspace before preparation and removes it on refusal", async () => {
		const projectRoot = await root();
		let reserved = "";
		const result = await runQualityReview({
			projectRoot,
			prepareWorkspace: async ({ workspaceRoot, runId }) => {
				reserved = workspaceRoot;
				const lifecycle = await readFile(
					join(
						projectRoot,
						"missions",
						"sessions",
						"chain",
						"runs",
						runId,
						"artifacts",
						"qm",
						"lifecycle.jsonl",
					),
					"utf8",
				);
				expect(lifecycle).toContain('"phase":"workspace-reserved"');
				expect(lifecycle).toContain('"previousPhase":"allocated"');
				expect(lifecycle).toContain(workspaceRoot);
				await writeFile(workspaceRoot, "occupied");
				throw new Error("snapshot changed");
			},
		});
		expect(result.stepResult.outcome).toBe("blocked");
		expect(reserved).toContain(result.ref.runId);
		await expect(readFile(reserved, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("keeps the conservative report when atomic replacement cannot write", async () => {
		const projectRoot = await root();
		let artifactDir = "";
		try {
			const result = await runQualityReview({
				projectRoot,
				planSlug: "example",
				prepareWorkspace,
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
		const projectRoot = await root();
		const modulePath = fileURLToPath(
			new URL("../../lib/orchestration/quality-review-run.ts", import.meta.url),
		);
		const script = `import { mkdir } from "node:fs/promises"; import { runQualityReview } from ${JSON.stringify(modulePath)}; setInterval(() => {}, 1000); await runQualityReview({ projectRoot: ${JSON.stringify(projectRoot)}, prepareWorkspace: async ({ workspaceRoot }) => { await mkdir(workspaceRoot); }, execute: async ({ runId }) => { process.stdout.write(runId + "\\n"); await new Promise(() => {}); return { markdown: "" }; } });`;
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
			if (reservedRoot)
				await rm(reservedRoot, { recursive: true, force: true });
		}
	}, 25_000);
});
