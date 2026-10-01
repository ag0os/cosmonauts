/**
 * Tests for readWorktreeStatus and readWorktreeChange: the working tree's
 * change against a base, per file, as the change diagram's classes.
 */
import { execFileSync } from "node:child_process";
import { rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
	readWorktreeChange,
	readWorktreeStatus,
} from "../../lib/lean-run/git.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-git-status-");

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
