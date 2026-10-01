/**
 * Tests for the builder's temporary worktree: a detached checkout of a ref
 * with the caller's node_modules directories linked in, removed without
 * throwing.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	lstat,
	mkdir,
	readFile,
	readlink,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	type BuilderWorktree,
	openBuilderWorktree,
	type TempWorktree,
} from "../../lib/lean-run/builder-worktree.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-builder-worktree-");
const opened: TempWorktree[] = [];

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: repo.path, encoding: "utf8" });
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
});

afterEach(async () => {
	for (const worktree of opened.splice(0)) await worktree.dispose();
});

async function open(
	ref = "HEAD",
	projectRoot = repo.path,
): Promise<BuilderWorktree> {
	const worktree = await openBuilderWorktree({ projectRoot, ref });
	opened.push(worktree);
	return worktree;
}

/** A workspace: the project root `packages/app`, a sibling package and hoisted dependencies. */
async function workspace(): Promise<string> {
	for (const dir of ["packages/app", "packages/lib"])
		await mkdir(join(repo.path, dir), { recursive: true });
	await writeFile(join(repo.path, "packages/app/app.ts"), "export {};\n");
	await writeFile(join(repo.path, "packages/lib/lib.ts"), "export {};\n");
	git("add", "-A");
	git("commit", "-q", "-m", "workspace");
	for (const dir of [
		"node_modules/hoisted",
		"packages/app/node_modules/own",
		"packages/lib/node_modules/other",
	])
		await mkdir(join(repo.path, dir), { recursive: true });
	return join(repo.path, "packages/app");
}

test("checks out the ref detached, leaving the project's HEAD and index alone", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	const head = git("rev-parse", "HEAD");

	const worktree = await open();

	expect(await readFile(join(worktree.projectDir, "a.ts"), "utf8")).toBe(
		"export const a = 1;\n",
	);
	expect(
		execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: worktree.root,
			encoding: "utf8",
		}),
	).toBe(head);
	expect(git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
	expect(git("status", "--porcelain")).toBe(" M a.ts\n");
});

test("links the project's node_modules into the checkout", async () => {
	await mkdir(join(repo.path, "node_modules/dep"), { recursive: true });

	const worktree = await open();

	const link = join(worktree.projectDir, "node_modules");
	expect((await lstat(link)).isSymbolicLink()).toBe(true);
	expect(await readlink(link)).toBe(join(repo.path, "node_modules"));
	expect(worktree.dependencies).toEqual([join(repo.path, "node_modules")]);
});

test("links hoisted node_modules at the top level when the project root is below it", async () => {
	const projectRoot = await workspace();

	const worktree = await open("HEAD", projectRoot);

	expect(relative(worktree.root, worktree.projectDir)).toBe("packages/app");
	expect(await readlink(join(worktree.root, "node_modules"))).toBe(
		join(repo.path, "node_modules"),
	);
	expect(
		existsSync(join(worktree.projectDir, "../../node_modules/hoisted")),
	).toBe(true);
});

test("links every package's ignored node_modules at its own path", async () => {
	const projectRoot = await workspace();

	const worktree = await open("HEAD", projectRoot);

	expect(await readlink(join(worktree.root, "packages/lib/node_modules"))).toBe(
		join(repo.path, "packages/lib/node_modules"),
	);
	expect(existsSync(join(worktree.projectDir, "node_modules/own"))).toBe(true);
	expect([...worktree.dependencies].sort()).toEqual(
		[
			"node_modules",
			"packages/app/node_modules",
			"packages/lib/node_modules",
		].map((path) => join(repo.path, path)),
	);
	expect(worktree.warnings).toEqual([]);
});

test("creates the parent directories a package's node_modules needs", async () => {
	await mkdir(join(repo.path, "tools/gen/node_modules/dep"), {
		recursive: true,
	});

	const worktree = await open();

	expect(await readlink(join(worktree.root, "tools/gen/node_modules"))).toBe(
		join(repo.path, "tools/gen/node_modules"),
	);
});

test("leaves a node_modules the ref already has in place", async () => {
	await mkdir(join(repo.path, "vendor"), { recursive: true });
	await writeFile(join(repo.path, ".gitignore"), "");
	await symlink("vendor", join(repo.path, "node_modules"));
	git("add", "-A");
	git("commit", "-q", "-m", "track a node_modules link");

	const worktree = await open();

	expect(await readlink(join(worktree.projectDir, "node_modules"))).toBe(
		"vendor",
	);
});

test("removes the checkout and its temp directory, then reports a second removal as warnings", async () => {
	const worktree = await openBuilderWorktree({
		projectRoot: repo.path,
		ref: "HEAD",
	});

	expect(await worktree.dispose()).toEqual([]);
	expect(existsSync(dirname(worktree.root))).toBe(false);
	expect(git("worktree", "list", "--porcelain")).not.toContain(worktree.root);
	const again = await worktree.dispose();
	expect(again.length).toBeGreaterThan(0);
	expect(again[0]).toContain(`could not remove worktree ${worktree.root}`);
});

test("throws for an unknown ref and leaves no worktree behind", async () => {
	await expect(open("no-such-ref")).rejects.toThrow();

	expect(
		git("worktree", "list", "--porcelain").match(/^worktree /gmu),
	).toHaveLength(1);
});
