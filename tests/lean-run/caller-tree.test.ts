/**
 * Tests for the caller working-tree compare around a builder stage: tracked
 * and untracked, not ignored, files of the whole checkout, with the session
 * directories left out.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { readCallerTree } from "../../lib/lean-run/caller-tree.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-caller-tree-");
const shallow = useTempDir("lean-caller-tree-shallow-");

function gitIn(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

beforeEach(async () => {
	gitIn(repo.path, "init", "-q", "-b", "main");
	gitIn(repo.path, "config", "user.email", "test@example.com");
	gitIn(repo.path, "config", "user.name", "Test");
	gitIn(repo.path, "config", "commit.gpgsign", "false");
	await writeFile(join(repo.path, ".gitignore"), "*.log\n");
	await writeFile(join(repo.path, "a.ts"), "export const a = 1;\n");
	gitIn(repo.path, "add", "-A");
	gitIn(repo.path, "commit", "-q", "-m", "base");
});

test("reports no change for a clean tree left alone", async () => {
	const tree = await readCallerTree(repo.path);

	expect(await tree.changes()).toEqual([]);
});

test("reports no change for a dirty tree left alone, and leaves the caller's index as it was", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	await writeFile(join(repo.path, "new.ts"), "export {};\n");
	gitIn(repo.path, "add", "new.ts");
	const index = gitIn(repo.path, "ls-files", "-s");

	const tree = await readCallerTree(repo.path);

	expect(await tree.changes()).toEqual([]);
	expect(gitIn(repo.path, "ls-files", "-s")).toBe(index);
});

test("lists an edited tracked file, a deleted one and a new untracked one", async () => {
	await writeFile(join(repo.path, "b.ts"), "export {};\n");
	gitIn(repo.path, "add", "b.ts");
	gitIn(repo.path, "commit", "-q", "-m", "b");
	const tree = await readCallerTree(repo.path);

	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	execFileSync("rm", [join(repo.path, "b.ts")]);
	await writeFile(join(repo.path, "c.ts"), "export {};\n");

	expect(await tree.changes()).toEqual(["a.ts", "b.ts", "c.ts"]);
});

test("does not see a change to an ignored file", async () => {
	const tree = await readCallerTree(repo.path);

	await writeFile(join(repo.path, "debug.log"), "noise\n");

	expect(await tree.changes()).toEqual([]);
});

test("leaves out session directories at the top level and under a project below it, ignored or not", async () => {
	const project = join(repo.path, "packages/app");
	await mkdir(project, { recursive: true });
	await writeFile(join(project, "app.ts"), "export {};\n");
	gitIn(repo.path, "add", "-A");
	gitIn(repo.path, "commit", "-q", "-m", "app");
	const tree = await readCallerTree(project);

	for (const dir of [
		"missions/sessions/lean/runs/1",
		"missions/archive/sessions/x",
		"packages/app/missions/sessions/lean/runs/1",
	]) {
		await mkdir(join(repo.path, dir), { recursive: true });
		await writeFile(join(repo.path, dir, "run.json"), "{}\n");
	}
	await writeFile(join(repo.path, "a.ts"), "export const a = 3;\n");

	expect(await tree.changes()).toEqual(["a.ts"]);
});

test("compares a shallow clone's tree", async () => {
	const clone = join(shallow.path, "clone");
	gitIn(
		shallow.path,
		"clone",
		"-q",
		"--depth",
		"1",
		`file://${repo.path}`,
		clone,
	);
	const tree = await readCallerTree(clone);

	expect(await tree.changes()).toEqual([]);
	await writeFile(join(clone, "a.ts"), "export const a = 4;\n");
	expect(await tree.changes()).toEqual(["a.ts"]);
});
