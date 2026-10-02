/**
 * Tests for the caller-state check: what can still move under a builder
 * working in its own clone (the caller's branch, HEAD, stash, branches and
 * tags, and the linked node_modules), read before and compared after, in a
 * real repository with a real `--no-hardlinks` clone standing in for the
 * builder's.
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
	type CallerCheck,
	type CallerState,
	checkCallerState,
	readCallerState,
} from "../../lib/lean-run/caller-state.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-caller-state-");
const clones = useTempDir("lean-caller-clone-");

function gitAt(cwd: string, ...args: string[]): string {
	return execFileSync(
		"git",
		["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args],
		{ cwd, encoding: "utf8" },
	);
}

function git(...args: string[]): string {
	return gitAt(repo.path, ...args);
}

function clonePath(): string {
	return join(clones.path, "clone");
}

/** Runs in the builder's clone. */
function builder(...args: string[]): string {
	return gitAt(clonePath(), ...args);
}

function dependencies(): string {
	return join(repo.path, "node_modules");
}

beforeEach(async () => {
	git("init", "-q", "-b", "main");
	git("config", "commit.gpgsign", "false");
	await writeFile(join(repo.path, ".gitignore"), "node_modules/\n");
	await writeFile(join(repo.path, "a.ts"), "export const a = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
	for (const dep of ["left-pad", "right-pad"])
		await mkdir(join(dependencies(), dep), { recursive: true });
});

/** Clones the caller the way the builder workspace does, then reads the caller's state. */
async function read(): Promise<CallerState> {
	gitAt(
		clones.path,
		"clone",
		"-q",
		"--no-hardlinks",
		"--no-tags",
		repo.path,
		clonePath(),
	);
	builder("config", "commit.gpgsign", "false");
	return readCallerState({
		projectRoot: repo.path,
		dependencies: [dependencies()],
	});
}

function check(before: CallerState): Promise<CallerCheck> {
	return checkCallerState(before, {
		projectRoot: repo.path,
		clone: clonePath(),
	});
}

async function breach(before: CallerState): Promise<string | undefined> {
	return (await check(before)).breach;
}

/** A commit only the builder's clone has. */
function builderCommit(message = "the builder's"): string {
	builder("commit", "-q", "--allow-empty", "-m", message);
	return builder("rev-parse", "HEAD").trim();
}

test("reports no change when nothing shared moved and node_modules only gained entries", async () => {
	const before = await read();
	await mkdir(join(dependencies(), ".vite"));
	await mkdir(join(dependencies(), "added"));

	expect(await check(before)).toEqual({ drift: [] });
});

test("names the checked-out branch and both commits when the branch moves", async () => {
	const head = git("rev-parse", "HEAD").trim();
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("commit", "-q", "-am", "next");
	const next = git("rev-parse", "HEAD").trim();
	const before = await read();

	git("update-ref", "refs/heads/main", head);

	expect(await breach(before)).toBe(
		`the caller's refs/heads/main moved from ${next} to ${head}`,
	);
});

test("names a switch of the checked-out branch", async () => {
	git("branch", "other");
	const before = await read();

	git("symbolic-ref", "HEAD", "refs/heads/other");

	expect(await breach(before)).toBe(
		"the caller's HEAD moved from refs/heads/main to refs/heads/other",
	);
});

test("only warns, naming both tips, when the stash is dropped", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("stash", "-q");
	const stash = git("rev-parse", "refs/stash").trim();
	const before = await read();

	git("stash", "drop", "-q");

	expect(await check(before)).toEqual({
		drift: [],
		warnings: [
			`the caller's refs/stash moved from ${stash} to no stash during the run (reported, not blocked: every worktree of the repository shares it)`,
		],
	});
});

test("only warns when a stash is created, as a sibling worktree's git stash does", async () => {
	const before = await read();
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");

	git("stash", "-q");

	const stash = git("rev-parse", "refs/stash").trim();
	expect(await check(before)).toEqual({
		drift: [],
		warnings: [
			`the caller's refs/stash moved from no stash to ${stash} during the run (reported, not blocked: every worktree of the repository shares it)`,
		],
	});
});

test("still names the branch move when the stash moved too", async () => {
	const head = git("rev-parse", "HEAD").trim();
	const before = await read();
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("stash", "-q");

	git("commit", "-q", "--allow-empty", "-m", "next");

	const next = git("rev-parse", "HEAD").trim();
	expect(await check(before)).toMatchObject({
		breach: `the caller's refs/heads/main moved from ${head} to ${next}`,
		warnings: [expect.stringMatching(/^the caller's refs\/stash moved/u)],
	});
});

test("names a linked node_modules that lost entries", async () => {
	const before = await read();

	await rm(join(dependencies(), "left-pad"), { recursive: true });

	expect(await breach(before)).toBe(
		`the caller's ${dependencies()} lost 1 of its entries (left-pad)`,
	);
});

test("names a linked node_modules that is no longer a directory", async () => {
	const before = await read();

	await rm(dependencies(), { recursive: true });
	await writeFile(dependencies(), "not a directory\n");

	expect(await breach(before)).toBe(
		`the caller's ${dependencies()} is no longer a directory`,
	);
});

test("blocks a branch the builder pushes its own commit to, with the command that removes it", async () => {
	const before = await read();
	const made = builderCommit();

	builder("push", "-q", repo.path, "HEAD:refs/heads/injected");

	expect(await check(before)).toEqual({
		breach: `the builder's objects reached the caller's branches or tags (refs/heads/injected added at ${made}), which stay as they are; restore with: git update-ref -d refs/heads/injected`,
		drift: [{ ref: "refs/heads/injected", after: made, action: "blocked" }],
	});
});

test("blocks a branch the builder moves to its own commit, with the command that moves it back", async () => {
	git("branch", "other");
	const was = git("rev-parse", "other").trim();
	const before = await read();
	const made = builderCommit();

	builder("push", "-q", repo.path, "HEAD:refs/heads/other");

	expect(await check(before)).toEqual({
		breach: `the builder's objects reached the caller's branches or tags (refs/heads/other moved from ${was} to ${made}), which stay as they are; restore with: git update-ref refs/heads/other ${was}`,
		drift: [
			{ ref: "refs/heads/other", before: was, after: made, action: "blocked" },
		],
	});
});

test("blocks an annotated tag the builder makes on a commit the caller already had", async () => {
	const before = await read();
	builder("tag", "-a", "v9", "-m", "the builder's tag");
	const tag = builder("rev-parse", "v9").trim();

	builder("push", "-q", repo.path, "refs/tags/v9");

	expect(await check(before)).toMatchObject({
		drift: [{ ref: "refs/tags/v9", after: tag, action: "blocked" }],
	});
});

test("only warns when the builder moves a ref to an object the caller already had", async () => {
	const base = git("rev-parse", "HEAD").trim();
	git("commit", "-q", "--allow-empty", "-m", "second");
	git("branch", "x");
	const second = git("rev-parse", "HEAD").trim();
	const before = await read();

	builder("push", "-q", repo.path, `+${base}:refs/heads/x`);

	expect(await check(before)).toEqual({
		drift: [
			{ ref: "refs/heads/x", before: second, after: base, action: "warned" },
		],
	});
});

test("only warns when the builder moves a ref to a commit the caller reached only through history", async () => {
	const tree = git("rev-parse", "HEAD^{tree}").trim();
	const base = git("rev-parse", "HEAD").trim();
	const inner = git("commit-tree", tree, "-p", base, "-m", "inner").trim();
	const tip = git("commit-tree", tree, "-p", inner, "-m", "tip").trim();
	git(
		"-c",
		"core.logAllRefUpdates=false",
		"update-ref",
		"refs/heads/deep",
		tip,
	);
	const before = await read();

	builder("push", "-q", repo.path, `${inner}:refs/heads/y`);

	expect(before.known.has(inner)).toBe(false);
	expect(await check(before)).toEqual({
		drift: [{ ref: "refs/heads/y", after: inner, action: "warned" }],
	});
});

test("only warns about a ref moved to a commit the caller had only in a reflog", async () => {
	git("commit", "-q", "--allow-empty", "-m", "undone");
	const undone = git("rev-parse", "HEAD").trim();
	git("reset", "-q", "--hard", "HEAD~1");
	const before = await read();

	git("update-ref", "refs/heads/restored", undone);

	expect(await check(before)).toEqual({
		drift: [{ ref: "refs/heads/restored", after: undone, action: "warned" }],
	});
});

test("only warns about a commit made elsewhere, a deleted branch and a tag the caller adds", async () => {
	git("branch", "side");
	git("branch", "doomed");
	const doomed = git("rev-parse", "doomed").trim();
	const before = await read();
	const head = git("rev-parse", "HEAD").trim();
	git("commit", "-q", "--allow-empty", "-m", "elsewhere");
	const elsewhere = git("rev-parse", "HEAD").trim();
	git("reset", "-q", "--soft", "HEAD~1");

	git("update-ref", "refs/heads/side", elsewhere);
	git("branch", "-D", "doomed");
	git("tag", "-a", "v1", "-m", "fetched");
	const tag = git("rev-parse", "v1").trim();

	expect(await check(before)).toEqual({
		drift: [
			{
				ref: "refs/heads/side",
				before: head,
				after: elsewhere,
				action: "warned",
			},
			{ ref: "refs/tags/v1", after: tag, action: "warned" },
			{ ref: "refs/heads/doomed", before: doomed, action: "warned" },
		],
	});
});

test("names the first three refs the builder reached and elides the rest", async () => {
	const before = await read();
	const made = builderCommit();

	for (const name of ["a", "b", "c", "d"])
		builder("push", "-q", repo.path, `HEAD:refs/tags/${name}`);

	const result = await check(before);
	expect(result.breach).toBe(
		`the builder's objects reached the caller's branches or tags (refs/tags/a added at ${made}, refs/tags/b added at ${made}, refs/tags/c added at ${made}, … (all in callerRefDrift)), which stay as they are; restore with: git update-ref -d refs/tags/a; git update-ref -d refs/tags/b; git update-ref -d refs/tags/c`,
	);
	expect(result.drift).toHaveLength(4);
});

test("leaves refs outside refs/heads and refs/tags alone", async () => {
	const before = await read();
	const made = builderCommit();

	builder("push", "-q", repo.path, "HEAD:refs/cosmonauts/drive/run/attempt-1");

	expect(made).not.toBe("");
	expect(await check(before)).toEqual({ drift: [] });
});
