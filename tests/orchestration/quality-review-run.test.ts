import { spawn } from "node:child_process";
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
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FileRunStore, runStatus } from "../../lib/durable-runtime/index.ts";
import { summarizeAssistantText } from "../../lib/orchestration/assistant-text.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";
import { runQualityReview } from "../../lib/orchestration/quality-review-run.ts";
import { removePrivateReviewWorkspace } from "../../lib/orchestration/quality-review-workspace.ts";

describe("quality review durable lifecycle", () => {
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
			.map((line) => JSON.parse(line) as { phase: string; workspace?: string });
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
		["refused", "blocked"],
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
			.map((line) => JSON.parse(line) as { phase: string; workspace?: string });
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
		expect(summary).toContain("unit: pass");
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
