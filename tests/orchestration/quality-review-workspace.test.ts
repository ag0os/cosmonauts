import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createPrivateReviewWorkspace,
	removePrivateReviewWorkspace,
} from "../../lib/orchestration/quality-review-workspace.ts";

describe("private review workspace capture", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});
	async function repository() {
		const root = await mkdtemp(join(tmpdir(), "qm-capture-"));
		roots.push(root);
		const source = join(root, "source");
		await mkdir(source);
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(source, "tracked.txt"), "base\n");
		git("add", "tracked.txt");
		git("commit", "-qm", "base");
		return { root, source, git };
	}

	// @cosmo-behavior plan:qm-chain-safety#B-002
	it("refuses three changing samples before any clone I/O", async () => {
		const { root, source } = await repository();
		const reserved = join(root, "reserved");
		await expect(
			createPrivateReviewWorkspace(source, reserved, {
				afterFirstSample: async (attempt) => {
					await writeFile(join(source, "tracked.txt"), `edit ${attempt}\n`);
				},
			}),
		).rejects.toThrow("Unstable source capture after three attempts");
		await expect(
			readFile(join(reserved, "checkout", "tracked.txt")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("refuses sparse, gitlink, nested and linked-worktree layouts", async () => {
		for (const layout of ["sparse", "gitlink", "nested", "linked"] as const) {
			const { root, source, git } = await repository();
			let target = source;
			if (layout === "sparse") git("config", "core.sparseCheckout", "true");
			if (layout === "gitlink")
				git(
					"update-index",
					"--add",
					"--cacheinfo",
					`160000,${git("rev-parse", "HEAD")},sub`,
				);
			if (layout === "nested") {
				await mkdir(join(source, "nested"));
				execFileSync("git", ["init", "-q"], { cwd: join(source, "nested") });
			}
			if (layout === "linked") {
				target = join(root, "linked");
				git("worktree", "add", "--detach", target);
			}
			await expect(
				createPrivateReviewWorkspace(target, join(root, "reserved")),
			).rejects.toThrow();
			await expect(
				readFile(join(root, "reserved", "checkout", "tracked.txt")),
			).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	it("uses the fork merge-base when the base branch advances", async () => {
		const { root, source, git } = await repository();
		git("branch", "-M", "main");
		const fork = git("rev-parse", "HEAD");
		git("checkout", "-qb", "feature");
		await writeFile(join(source, "tracked.txt"), "feature\n");
		git("add", "tracked.txt");
		git("commit", "-qm", "feature");
		git("checkout", "main");
		await mkdir(join(source, ".fallow-baselines"));
		await writeFile(
			join(source, ".fallow-baselines", "dupes.json"),
			"base-side only\n",
		);
		git("add", ".fallow-baselines/dupes.json");
		git("commit", "-qm", "base advanced");
		git("checkout", "feature");
		const reserved = join(root, "reserved");
		await mkdir(reserved);
		const snapshot = await createPrivateReviewWorkspace(source, reserved);
		expect(snapshot.base).toBe(fork);
		expect(snapshot.changedFiles).toEqual(["tracked.txt"]);
		expect(
			await readFile(join(snapshot.materialsRoot, "base-sha.txt"), "utf8"),
		).toBe(`${fork}\n`);
		expect(
			await readFile(join(snapshot.materialsRoot, "full.diff"), "utf8"),
		).not.toContain("dupes.json");
		await removePrivateReviewWorkspace(reserved);
	});
});
