import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { createQualityReviewArtifactSink } from "../../lib/orchestration/quality-review-artifacts.ts";

describe("quality review host artifacts", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it("writes run-owned references and rejects traversal, symlink escape and duplicate reviewers", async () => {
		const root = await mkdtemp(join(tmpdir(), "qm-artifacts-"));
		roots.push(root);
		const store = new FileRunStore({
			rootDir: join(root, "missions", "sessions"),
		});
		const first = await store.createRun({ scope: "chain", runId: "one" });
		const second = await store.createRun({ scope: "chain", runId: "two" });
		const sink = createQualityReviewArtifactSink({ store, run: first });
		const report = await sink.write("final.md", "first", { replace: true });
		expect(report.path).toBe(join(first.artifactsDir, "qm", "final.md"));
		expect(await readFile(report.path, "utf8")).toBe("first");
		expect(
			(await store.readEvents({ scope: "chain", runId: "one" })).events.some(
				({ event }) => event.type === "artifact_written",
			),
		).toBe(true);
		await expect(sink.write("../two/final.md", "escape")).rejects.toThrow();
		await expect(sink.write("/tmp/escape", "escape")).rejects.toThrow();
		await expect(sink.write("C:\\escape", "escape")).rejects.toThrow();
		await symlink(
			second.artifactsDir,
			join(first.artifactsDir, "qm", "escape"),
		);
		await expect(sink.write("escape/other.md", "escape")).rejects.toThrow();
		const forged = createQualityReviewArtifactSink({
			store,
			run: { ...first, artifactsDir: second.artifactsDir },
		});
		await expect(
			forged.write("final.md", "cross-run", { replace: true }),
		).rejects.toThrow();
		const evidence = {
			runId: first.runId,
			lens: "security",
			spawnId: "spawn-one",
			sessionId: "session-one",
			resolvedRole: "coding/reviewer",
			resolvedModel: { provider: "test", id: "reviewer" },
			outcome: "success" as const,
			digest: createHash("sha256").update("original").digest("hex"),
			fullText: "original",
		};
		expect(() => sink.writeReviewer({ ...evidence, spawnId: "" })).toThrow();
		expect(() =>
			sink.writeReviewer({ ...evidence, runId: second.runId }),
		).toThrow();
		await sink.writeReviewer(evidence);
		const reviewerFile = await readFile(
			join(first.artifactsDir, "qm", "reviewers", "security.md"),
			"utf8",
		);
		expect(reviewerFile).toContain("Run: one");
		expect(reviewerFile).toContain("Spawn: spawn-one");
		expect(reviewerFile).toContain("Session: session-one");
		expect(reviewerFile).toContain("Model: test/reviewer");
		expect(reviewerFile).toContain(evidence.digest);
		expect(reviewerFile).toContain("original");
		expect(() => sink.writeReviewer(evidence)).toThrow();
		expect(() =>
			sink.writeReviewer({ ...evidence, lens: "../security" }),
		).toThrow();
		await writeFile(join(second.artifactsDir, "sentinel"), "safe");
		expect(await readFile(join(second.artifactsDir, "sentinel"), "utf8")).toBe(
			"safe",
		);
	});
	it("abandons an in-flight reviewer store write at the sealing grace", async () => {
		const root = await mkdtemp(join(tmpdir(), "qm-artifacts-"));
		roots.push(root);
		const store = new FileRunStore({
			rootDir: join(root, "missions", "sessions"),
		});
		const run = await store.createRun({ scope: "chain", runId: "one" });
		let release: (() => void) | undefined;
		vi.spyOn(store, "loadRun").mockImplementation(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return run;
		});
		const sink = createQualityReviewArtifactSink({ store, run });
		const pending = sink.writeReviewer({
			runId: run.runId,
			lens: "security-reviewer",
			spawnId: "spawn",
			sessionId: "session",
			resolvedRole: "coding/security-reviewer",
			resolvedModel: { provider: "test", id: "model" },
			outcome: "success",
			fullText: "review",
			digest: createHash("sha256").update("review").digest("hex"),
		});
		const started = Date.now();
		expect(await sink.sealReviewers(30)).toEqual(["security-reviewer"]);
		expect(Date.now() - started).toBeLessThan(500);
		release?.();
		await expect(pending).rejects.toThrow(/abandoned/);
		await expect(
			readFile(
				join(run.artifactsDir, "qm", "reviewers", "security-reviewer.md"),
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
	it("removes reviewer bytes when the store append never settles", async () => {
		const root = await mkdtemp(join(tmpdir(), "qm-artifacts-"));
		roots.push(root);
		const store = new FileRunStore({
			rootDir: join(root, "missions", "sessions"),
		});
		const run = await store.createRun({ scope: "chain", runId: "one" });
		const originalAppend = store.appendEvent.bind(store);
		vi.spyOn(store, "appendEvent").mockImplementation((ref, event) =>
			event.type === "artifact_written" &&
			event.artifact.id === "qm/reviewers/security-reviewer.md"
				? new Promise(() => {})
				: originalAppend(ref, event),
		);
		const sink = createQualityReviewArtifactSink({ store, run });
		void sink.writeReviewer({
			runId: run.runId,
			lens: "security-reviewer",
			spawnId: "spawn",
			sessionId: "session",
			resolvedRole: "coding/security-reviewer",
			resolvedModel: { provider: "test", id: "model" },
			outcome: "success",
			fullText: "review",
			digest: createHash("sha256").update("review").digest("hex"),
		});
		const path = join(
			run.artifactsDir,
			"qm",
			"reviewers",
			"security-reviewer.md",
		);
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await readFile(path);
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		}
		expect(await sink.sealReviewers(20)).toEqual(["security-reviewer"]);
		await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
		expect(sink.references()).toEqual([]);
	});
});
