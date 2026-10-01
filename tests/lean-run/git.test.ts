/**
 * Tests for readWorktreeStatus, readWorktreeChange and readWorktreePatch:
 * the working tree's change against a base, per file, as the change
 * diagram's classes, and as a patch applyPatch puts back. Also the
 * worktree, ref and ignored-dependency helpers the builder worktree uses.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
	addDetachedWorktree,
	applyPatch,
	isAncestor,
	listIgnoredDependencies,
	readRefState,
	readWorktreeChange,
	readWorktreePatch,
	readWorktreeStatus,
	removeWorktree,
} from "../../lib/lean-run/git.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-git-status-");
const scratch = useTempDir("lean-git-worktree-");

function worktreeCount(): number {
	return (
		git("worktree", "list", "--porcelain").match(/^worktree /gmu)?.length ?? 0
	);
}

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: repo.path, encoding: "utf8" });
}

beforeEach(async () => {
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 1;\n");
	await writeFile(join(repo.path, "gone.ts"), "export const gone = 1;\n");
	await writeFile(
		join(repo.path, "old-name.ts"),
		"export const moved = 'a long enough line to be detected as a rename';\n",
	);
	git("add", "-A");
	git("commit", "-q", "-m", "base");
});

test("classes added, modified and removed files, untracked ones included, and a rename as removed plus added", async () => {
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");
	await rm(join(repo.path, "gone.ts"));
	await writeFile(join(repo.path, "new.ts"), "export const fresh = 1;\n");
	await rename(join(repo.path, "old-name.ts"), join(repo.path, "new-name.ts"));

	const status = await readWorktreeStatus({ cwd: repo.path, base: "HEAD" });

	expect(status).toEqual({
		"kept.ts": "modified",
		"gone.ts": "removed",
		"new.ts": "added",
		"old-name.ts": "removed",
		"new-name.ts": "added",
	});
	expect(git("status", "--porcelain")).toContain("?? new.ts");
});

test("sees a same-size edit made in the same second as the index write", async () => {
	// Pin the file and the index to one past second so git's racily-clean
	// recheck is the only thing that can notice the edit; ctime is ignored
	// so the test does not depend on how fast the setup runs.
	git("config", "core.trustctime", "false");
	const pinned = new Date(Date.now() - 3_600_000);
	const file = join(repo.path, "kept.ts");
	await utimes(file, pinned, pinned);
	git("add", "-A");
	await utimes(join(repo.path, ".git", "index"), pinned, pinned);
	await writeFile(file, "export const kept = 2;\n");
	await utimes(file, pinned, pinned);

	const [change, status] = await Promise.all([
		readWorktreeChange({ cwd: repo.path, base: "HEAD" }),
		readWorktreeStatus({ cwd: repo.path, base: "HEAD" }),
	]);

	expect(change.changedFiles).toEqual(["kept.ts"]);
	expect(status).toEqual({ "kept.ts": "modified" });
});

test("reads a patch that recreates binary, untracked and deleted files in the working tree only", async () => {
	const binary = Buffer.from([0, 1, 2, 255, 0, 10, 13, 0]);
	await writeFile(join(repo.path, "image.bin"), binary);
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");
	await rm(join(repo.path, "gone.ts"));
	const patch = await readWorktreePatch({ cwd: repo.path, base: "HEAD" });
	const patchPath = join(repo.path, ".git", "test.patch");
	await writeFile(patchPath, patch);
	git("reset", "-q", "--hard");
	git("clean", "-q", "-fd");

	await applyPatch({ cwd: repo.path, patchPath });

	expect(await readFile(join(repo.path, "image.bin"))).toEqual(binary);
	expect(git("diff", "--cached")).toBe("");
	expect(
		git("status", "--porcelain").split("\n").filter(Boolean).sort(),
	).toEqual([" D gone.ts", " M kept.ts", "?? image.bin"]);
});

test("leaves a top-level node_modules link out of the change and the patch", async () => {
	await symlink(join(repo.path, "kept.ts"), join(repo.path, "node_modules"));
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");

	const [change, patch] = await Promise.all([
		readWorktreeChange({ cwd: repo.path, base: "HEAD" }),
		readWorktreePatch({ cwd: repo.path, base: "HEAD" }),
	]);

	expect(change.changedFiles).toEqual(["kept.ts"]);
	expect(patch).not.toContain("node_modules");
});

test("leaves every node_modules link out of the change and the patch, read from a subdirectory", async () => {
	await mkdir(join(repo.path, "pkg/sub"), { recursive: true });
	await writeFile(join(repo.path, "pkg/index.ts"), "export {};\n");
	git("add", "-A");
	git("commit", "-q", "-m", "pkg");
	for (const path of [
		"node_modules",
		"pkg/node_modules",
		"pkg/sub/node_modules",
	])
		await symlink(join(repo.path, "kept.ts"), join(repo.path, path));
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");
	const cwd = join(repo.path, "pkg");

	const [change, patch] = await Promise.all([
		readWorktreeChange({ cwd, base: "HEAD" }),
		readWorktreePatch({ cwd, base: "HEAD" }),
	]);

	expect(change.changedFiles).toEqual(["kept.ts"]);
	expect(patch).not.toContain("node_modules");
});

test("applies a patch with trailing whitespace whatever the user's apply.whitespace", async () => {
	git("config", "apply.whitespace", "error");
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;   \n");
	const patchPath = join(repo.path, ".git", "test.patch");
	await writeFile(
		patchPath,
		await readWorktreePatch({ cwd: repo.path, base: "HEAD" }),
	);
	git("checkout", "-q", "--", "kept.ts");

	await applyPatch({ cwd: repo.path, patchPath });

	expect(await readFile(join(repo.path, "kept.ts"), "utf8")).toBe(
		"export const kept = 2;   \n",
	);
});

test("adds a worktree without running the repository's post-checkout hook", async () => {
	const ran = join(scratch.path, "hook-ran");
	const hook = join(repo.path, ".git/hooks/post-checkout");
	await mkdir(dirname(hook), { recursive: true });
	await writeFile(hook, `#!/bin/sh\ntouch "${ran}"\n`);
	await chmod(hook, 0o755);
	const path = join(scratch.path, "checkout");

	await addDetachedWorktree({ cwd: repo.path, path, ref: "HEAD" });

	expect(existsSync(join(path, "kept.ts"))).toBe(true);
	expect(existsSync(ran)).toBe(false);
});

test("removes a locked worktree and leaves no entry behind", async () => {
	const path = join(scratch.path, "checkout");
	await addDetachedWorktree({ cwd: repo.path, path, ref: "HEAD" });
	git("worktree", "lock", path);

	const warnings = await removeWorktree({ cwd: repo.path, path });

	expect(warnings).toEqual([]);
	expect(existsSync(path)).toBe(false);
	expect(worktreeCount()).toBe(1);
});

test("tells whether one commit descends from another, and throws for an unknown one", async () => {
	const base = git("rev-parse", "HEAD").trim();
	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");
	git("commit", "-q", "-am", "next");

	expect(
		await isAncestor({ cwd: repo.path, ancestor: base, ref: "HEAD" }),
	).toBe(true);
	expect(
		await isAncestor({ cwd: repo.path, ancestor: "HEAD", ref: base }),
	).toBe(false);
	await expect(
		isAncestor({ cwd: repo.path, ancestor: "no-such-ref", ref: "HEAD" }),
	).rejects.toThrow();
});

test("reads the checked-out branch, HEAD and the stash tip, leaving out what is not there", async () => {
	const head = git("rev-parse", "HEAD").trim();
	expect(await readRefState({ cwd: repo.path })).toEqual({
		branch: "refs/heads/main",
		head,
	});

	await writeFile(join(repo.path, "kept.ts"), "export const kept = 2;\n");
	git("stash", "-q");
	git("checkout", "-q", "--detach");

	expect(await readRefState({ cwd: repo.path })).toEqual({
		head,
		stash: git("rev-parse", "refs/stash").trim(),
	});
});

test("lists the ignored node_modules at any depth, from the top level whatever the cwd", async () => {
	await writeFile(join(repo.path, ".gitignore"), "node_modules/\ndist/\n");
	for (const dir of [
		"node_modules/dep",
		"packages/a/node_modules/dep",
		"packages/a/src",
		"dist/node_modules/dep",
	])
		await mkdir(join(repo.path, dir), { recursive: true });
	await writeFile(join(repo.path, "packages/a/src/a.ts"), "export {};\n");
	const cwd = join(repo.path, "packages/a");

	expect(await listIgnoredDependencies({ cwd, limit: 10 })).toEqual({
		paths: ["node_modules", "packages/a/node_modules"],
		truncated: false,
	});
	expect(await listIgnoredDependencies({ cwd, limit: 1 })).toEqual({
		paths: ["node_modules"],
		truncated: true,
	});
});

test.each([
	"true",
	"false",
])("lists a rename's two paths and classes both, with diff.renames=%s", async (renames) => {
	git("config", "diff.renames", renames);
	await rename(join(repo.path, "old-name.ts"), join(repo.path, "new-name.ts"));

	const [change, status] = await Promise.all([
		readWorktreeChange({ cwd: repo.path, base: "HEAD" }),
		readWorktreeStatus({ cwd: repo.path, base: "HEAD" }),
	]);

	expect(change.changedFiles.sort()).toEqual(["new-name.ts", "old-name.ts"]);
	expect(Object.keys(status).sort()).toEqual(change.changedFiles);
	expect(status).toEqual({ "old-name.ts": "removed", "new-name.ts": "added" });
});
