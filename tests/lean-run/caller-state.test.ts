/**
 * Tests for the caller-state check: what can still move under a builder
 * working in its own clone (the caller's branch, HEAD, stash, branches and
 * tags, and the linked node_modules), read before and compared after, in a
 * real repository.
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
	type CallerState,
	callerStateChange,
	readCallerState,
} from "../../lib/lean-run/caller-state.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-caller-state-");

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: repo.path, encoding: "utf8" });
}

function dependencies(): string {
	return join(repo.path, "node_modules");
}

beforeEach(async () => {
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await writeFile(join(repo.path, ".gitignore"), "node_modules/\n");
	await writeFile(join(repo.path, "a.ts"), "export const a = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
	for (const dep of ["left-pad", "right-pad"])
		await mkdir(join(dependencies(), dep), { recursive: true });
});

function read(): Promise<CallerState> {
	return readCallerState({
		projectRoot: repo.path,
		dependencies: [dependencies()],
	});
}

function change(before: CallerState): Promise<string | undefined> {
	return callerStateChange(before, repo.path);
}

test("reports no change when nothing shared moved and node_modules only gained entries", async () => {
	const before = await read();
	await mkdir(join(dependencies(), ".vite"));
	await mkdir(join(dependencies(), "added"));

	expect(await change(before)).toBeUndefined();
});

test("names the checked-out branch and both commits when the branch moves", async () => {
	const head = git("rev-parse", "HEAD").trim();
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("commit", "-q", "-am", "next");
	const next = git("rev-parse", "HEAD").trim();
	const before = await read();

	git("update-ref", "refs/heads/main", head);

	expect(await change(before)).toBe(
		`the caller's refs/heads/main moved from ${next} to ${head}`,
	);
});

test("names a switch of the checked-out branch", async () => {
	git("branch", "other");
	const before = await read();

	git("symbolic-ref", "HEAD", "refs/heads/other");

	expect(await change(before)).toBe(
		"the caller's HEAD moved from refs/heads/main to refs/heads/other",
	);
});

test("names the stash when its tip moves", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("stash", "-q");
	const stash = git("rev-parse", "refs/stash").trim();
	const before = await read();

	git("stash", "drop", "-q");

	expect(await change(before)).toBe(
		`the caller's refs/stash moved from ${stash} to no stash`,
	);
});

test("names a linked node_modules that lost entries", async () => {
	const before = await read();

	await rm(join(dependencies(), "left-pad"), { recursive: true });

	expect(await change(before)).toBe(
		`the caller's ${dependencies()} lost 1 of its entries (left-pad)`,
	);
});

test("names a linked node_modules that is no longer a directory", async () => {
	const before = await read();

	await rm(dependencies(), { recursive: true });
	await writeFile(dependencies(), "not a directory\n");

	expect(await change(before)).toBe(
		`the caller's ${dependencies()} is no longer a directory`,
	);
});

test("names a branch added, a branch deleted and a tag moved", async () => {
	git("branch", "doomed");
	git("tag", "v1");
	const before = await read();
	git("commit", "-q", "--allow-empty", "-m", "elsewhere");
	const elsewhere = git("rev-parse", "HEAD").trim();
	git("reset", "-q", "--soft", "HEAD~1");

	git("update-ref", "refs/heads/injected", "HEAD");
	git("branch", "-D", "doomed");
	git("update-ref", "refs/tags/v1", elsewhere);

	expect(await change(before)).toBe(
		"the caller's branches or tags changed (refs/heads/injected added, refs/tags/v1 moved, refs/heads/doomed deleted)",
	);
});

test("names the first three branch or tag changes and elides the rest", async () => {
	const before = await read();

	for (const name of ["a", "b", "c", "d"]) git("tag", name);

	expect(await change(before)).toBe(
		"the caller's branches or tags changed (refs/tags/a added, refs/tags/b added, refs/tags/c added, …)",
	);
});

test("leaves refs outside refs/heads and refs/tags alone", async () => {
	const before = await read();

	git("update-ref", "refs/cosmonauts/drive/run/attempt-1", "HEAD");

	expect(await change(before)).toBeUndefined();
});
