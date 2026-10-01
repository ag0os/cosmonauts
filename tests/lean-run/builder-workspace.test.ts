/**
 * Tests for the builder's private clone: detached at a commit with its own
 * refs and config and no remote, the caller's gitignored inputs copied in
 * and kept out of the patch, its node_modules linked, deleted without
 * throwing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
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
	type BuilderWorkspace,
	openBuilderWorkspace,
} from "../../lib/lean-run/builder-workspace.ts";
import { readWorktreePatch } from "../../lib/lean-run/git.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-builder-workspace-");
const outside = useTempDir("lean-builder-outside-");
const opened: BuilderWorkspace[] = [];
const CAP = 1024;

function git(...args: string[]): string {
	return gitIn(repo.path, ...args);
}

function gitIn(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function head(): string {
	return git("rev-parse", "HEAD").trim();
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
	for (const workspace of opened.splice(0)) await workspace.dispose();
});

async function open(
	options: { commit?: string; ref?: string; projectRoot?: string } = {},
): Promise<BuilderWorkspace> {
	const workspace = await openBuilderWorkspace({
		projectRoot: options.projectRoot ?? repo.path,
		commit: options.commit ?? head(),
		...(options.ref ? { ref: options.ref } : {}),
		capBytes: CAP,
	});
	opened.push(workspace);
	return workspace;
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

async function ignore(rules: string): Promise<void> {
	await writeFile(join(repo.path, ".gitignore"), rules);
	git("commit", "-q", "-am", "ignore rules");
}

test("checks out the commit detached, leaving the caller's HEAD and index alone", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");

	const clone = await open();

	expect(await readFile(join(clone.projectDir, "a.ts"), "utf8")).toBe(
		"export const a = 1;\n",
	);
	expect(gitIn(clone.root, "rev-parse", "HEAD").trim()).toBe(head());
	expect(gitIn(clone.root, "branch", "--show-current").trim()).toBe("");
	expect(git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
	expect(git("status", "--porcelain")).toBe(" M a.ts\n");
});

test("has no remote, and its branches, config and objects are its own", async () => {
	const clone = await open();

	gitIn(clone.root, "config", "core.someKey", "builder");
	gitIn(clone.root, "branch", "-D", "main");

	expect(gitIn(clone.root, "remote").trim()).toBe("");
	expect(() => git("config", "--get", "core.someKey")).toThrow();
	expect(git("branch", "--list", "main").trim()).toBe("* main");
	expect(
		existsSync(join(clone.root, ".git", "objects", "info", "alternates")),
	).toBe(false);
});

test("fetches the snapshot ref in under its own name and checks it out", async () => {
	await writeFile(join(repo.path, "a.ts"), "export const a = 2;\n");
	git("stash", "-q");
	const ref = "refs/cosmonauts/drive/run/lean-run/attempt-1";
	git("update-ref", ref, "refs/stash");
	git("stash", "drop", "-q");
	const snapshot = git("rev-parse", ref).trim();

	const clone = await open({ commit: snapshot, ref });

	expect(gitIn(clone.root, "rev-parse", ref).trim()).toBe(snapshot);
	expect(gitIn(clone.root, "rev-parse", "HEAD").trim()).toBe(snapshot);
	expect(await readFile(join(clone.projectDir, "a.ts"), "utf8")).toBe(
		"export const a = 2;\n",
	);
});

test("copies a gitignored file in and lists it as carried", async () => {
	await ignore("node_modules/\n.env\n");
	await writeFile(join(repo.path, ".env"), "TOKEN=1\n");

	const clone = await open();

	expect(await readFile(join(clone.root, ".env"), "utf8")).toBe("TOKEN=1\n");
	expect(clone.inputs).toMatchObject({
		carried: [".env"],
		carriedBytes: 8,
		capBytes: CAP,
	});
});

test("keeps a carried file out of the builder's patch, edited or not", async () => {
	await ignore("node_modules/\n.env\ndist/\n");
	await writeFile(join(repo.path, ".env"), "TOKEN=1\n");
	await mkdir(join(repo.path, "dist"));
	await writeFile(join(repo.path, "dist/out.js"), "out\n");
	const commit = head();

	const clone = await open({ commit });
	await writeFile(join(clone.root, ".env"), "TOKEN=2\n");
	await writeFile(join(clone.root, "dist/new.js"), "new\n");
	await writeFile(join(clone.root, "a.ts"), "export const a = 3;\n");

	const patch = await readWorktreePatch({
		cwd: clone.projectDir,
		base: commit,
	});
	expect(patch).toContain("a/a.ts");
	expect(patch).not.toContain(".env");
	expect(patch).not.toContain("dist/");
	expect(await readFile(join(repo.path, ".env"), "utf8")).toBe("TOKEN=1\n");
});

test("copies a file ignored only by the caller's info/exclude and keeps it out of the patch", async () => {
	await writeFile(join(repo.path, ".git/info/exclude"), "local.cfg\n");
	await writeFile(join(repo.path, "local.cfg"), "local\n");
	const commit = head();

	const clone = await open({ commit });

	expect(await readFile(join(clone.root, "local.cfg"), "utf8")).toBe("local\n");
	expect(
		await readFile(join(clone.root, ".git/info/exclude"), "utf8"),
	).toContain("local.cfg\n");
	await writeFile(join(clone.root, "local.cfg"), "changed\n");
	expect(await readWorktreePatch({ cwd: clone.projectDir, base: commit })).toBe(
		"",
	);
});

test("skips an ignored entry that would pass the cap and still carries the next one", async () => {
	await ignore("node_modules/\nbig.bin\nsmall.txt\n");
	await writeFile(join(repo.path, "big.bin"), "x".repeat(CAP + 1));
	await writeFile(join(repo.path, "small.txt"), "small\n");

	const clone = await open();

	expect(existsSync(join(clone.root, "big.bin"))).toBe(false);
	expect(clone.inputs.carried).toEqual(["small.txt"]);
	expect(clone.inputs.skipped).toContainEqual({
		path: "big.bin",
		reason: "over the cap",
	});
});

test("carries the smallest ignored entries first, whatever git's order", async () => {
	await ignore("node_modules/\na-large.bin\nz-small.txt\n");
	await writeFile(join(repo.path, "a-large.bin"), "x".repeat(CAP - 10));
	await writeFile(join(repo.path, "z-small.txt"), "y".repeat(20));

	const clone = await open();

	expect(clone.inputs.carried).toEqual(["z-small.txt"]);
	expect(clone.inputs.carriedBytes).toBe(20);
	expect(existsSync(join(clone.root, "a-large.bin"))).toBe(false);
	expect(clone.inputs.skipped).toContainEqual({
		path: "a-large.bin",
		reason: "over the cap",
	});
});

test("skips an ignored directory whole when its files pass the cap", async () => {
	await ignore("node_modules/\ndist/\n");
	await mkdir(join(repo.path, "dist"));
	await writeFile(join(repo.path, "dist/a.js"), "a".repeat(CAP / 2));
	await writeFile(join(repo.path, "dist/b.js"), "b".repeat(CAP / 2 + 1));

	const clone = await open();

	expect(existsSync(join(clone.root, "dist"))).toBe(false);
	expect(clone.inputs.skipped).toEqual([
		{ path: "dist/", reason: "over the cap" },
	]);
});

test("never copies node_modules, .git or .stryker-tmp, and names each skip", async () => {
	await ignore("node_modules/\n.stryker-tmp/\ncache/\n");
	await mkdir(join(repo.path, "node_modules/dep"), { recursive: true });
	await mkdir(join(repo.path, ".stryker-tmp/sandbox"), { recursive: true });
	await writeFile(join(repo.path, ".stryker-tmp/sandbox/x.js"), "x\n");
	await mkdir(join(repo.path, "cache/node_modules/dep"), { recursive: true });
	await mkdir(join(repo.path, "cache/.git"), { recursive: true });
	await writeFile(join(repo.path, "cache/data.json"), "{}\n");

	const clone = await open();

	expect(clone.inputs.carried).toEqual(["cache/"]);
	expect(await readFile(join(clone.root, "cache/data.json"), "utf8")).toBe(
		"{}\n",
	);
	expect(existsSync(join(clone.root, "cache/node_modules"))).toBe(false);
	expect(existsSync(join(clone.root, "cache/.git"))).toBe(false);
	expect(existsSync(join(clone.root, ".stryker-tmp"))).toBe(false);
	expect(clone.inputs.skipped).toEqual([
		{ path: ".stryker-tmp/", reason: ".stryker-tmp" },
		{ path: "cache/.git/", reason: ".git" },
		{ path: "cache/node_modules/", reason: "node_modules" },
		{ path: "node_modules/", reason: "node_modules" },
	]);
});

// The fixtures name real paths: macOS `tmpdir()` is under the `/var` link,
// and git's top level is not, so an unresolved path would compare unequal.
test("skips an ignored symlink that leads out of the checkout", async () => {
	await ignore("node_modules/\nsecret\n");
	const target = join(realpathSync(outside.path), "secret.txt");
	await writeFile(target, "secret\n");
	await symlink(target, join(repo.path, "secret"));

	const clone = await open();

	expect(existsSync(join(clone.root, "secret"))).toBe(false);
	expect(clone.inputs.skipped).toContainEqual({
		path: "secret",
		reason: "symlink outside the checkout",
	});
});

test("skips an ignored relative symlink that climbs out of the checkout", async () => {
	await ignore("node_modules/\nsecret\n");
	await writeFile(join(outside.path, "secret.txt"), "secret\n");
	const target = relative(
		realpathSync(repo.path),
		join(realpathSync(outside.path), "secret.txt"),
	);
	await symlink(target, join(repo.path, "secret"));

	const clone = await open();

	expect(existsSync(join(clone.root, "secret"))).toBe(false);
	expect(clone.inputs.skipped).toContainEqual({
		path: "secret",
		reason: "symlink outside the checkout",
	});
});

test("points an ignored absolute symlink inside the checkout at the clone's file, not the caller's", async () => {
	await ignore("node_modules/\nlinks/\n");
	await mkdir(join(repo.path, "links"));
	await symlink(
		join(realpathSync(repo.path), "a.ts"),
		join(repo.path, "links/a"),
	);

	const clone = await open();
	await writeFile(join(clone.root, "links/a"), "written by the builder\n");

	expect(clone.inputs.carried).toEqual(["links/"]);
	expect(await readlink(join(clone.root, "links/a"))).toBe("../a.ts");
	expect(await readFile(join(clone.root, "a.ts"), "utf8")).toBe(
		"written by the builder\n",
	);
	expect(await readFile(join(repo.path, "a.ts"), "utf8")).toBe(
		"export const a = 1;\n",
	);
});

test("keeps an ignored relative symlink inside the checkout as it is", async () => {
	await ignore("node_modules/\nalias\n");
	await symlink("a.ts", join(repo.path, "alias"));

	const clone = await open();

	expect(await readlink(join(clone.root, "alias"))).toBe("a.ts");
});

test("links the project's node_modules into the clone and records the residual", async () => {
	await mkdir(join(repo.path, "node_modules/dep"), { recursive: true });

	const clone = await open();

	const link = join(clone.projectDir, "node_modules");
	expect((await lstat(link)).isSymbolicLink()).toBe(true);
	expect(await readlink(link)).toBe(join(repo.path, "node_modules"));
	expect(clone.dependencies).toEqual([join(repo.path, "node_modules")]);
	expect(clone.inputs.linked).toEqual(clone.dependencies);
	expect(clone.inputs.residuals).toEqual([
		expect.stringMatching(/^push by path or URL/u),
		expect.stringMatching(/^dependency tree writable through the link/u),
	]);
});

test("records the push-by-path residual even when nothing is linked", async () => {
	const clone = await open();

	expect(clone.inputs.residuals).toEqual([
		expect.stringMatching(/^push by path or URL: .*can still push to it/u),
	]);
});

test("links hoisted node_modules at the top level when the project root is below it", async () => {
	const projectRoot = await workspace();

	const clone = await open({ projectRoot });

	expect(relative(clone.root, clone.projectDir)).toBe("packages/app");
	expect(await readlink(join(clone.root, "node_modules"))).toBe(
		join(repo.path, "node_modules"),
	);
	expect(existsSync(join(clone.projectDir, "../../node_modules/hoisted"))).toBe(
		true,
	);
});

test("links every package's ignored node_modules at its own path", async () => {
	const projectRoot = await workspace();

	const clone = await open({ projectRoot });

	expect(await readlink(join(clone.root, "packages/lib/node_modules"))).toBe(
		join(repo.path, "packages/lib/node_modules"),
	);
	expect(existsSync(join(clone.projectDir, "node_modules/own"))).toBe(true);
	expect([...clone.dependencies].sort()).toEqual(
		[
			"node_modules",
			"packages/app/node_modules",
			"packages/lib/node_modules",
		].map((path) => join(repo.path, path)),
	);
	expect(clone.warnings).toEqual([]);
});

test("creates the parent directories a package's node_modules needs", async () => {
	await mkdir(join(repo.path, "tools/gen/node_modules/dep"), {
		recursive: true,
	});

	const clone = await open();

	expect(await readlink(join(clone.root, "tools/gen/node_modules"))).toBe(
		join(repo.path, "tools/gen/node_modules"),
	);
});

test("leaves a node_modules the commit already has in place", async () => {
	await mkdir(join(repo.path, "vendor"), { recursive: true });
	await writeFile(join(repo.path, ".gitignore"), "");
	await symlink("vendor", join(repo.path, "node_modules"));
	git("add", "-A");
	git("commit", "-q", "-m", "track a node_modules link");

	const clone = await open();

	expect(await readlink(join(clone.projectDir, "node_modules"))).toBe("vendor");
});

test("deletes its temp directory and leaves the linked node_modules intact", async () => {
	await mkdir(join(repo.path, "node_modules/dep"), { recursive: true });
	const clone = await openBuilderWorkspace({
		projectRoot: repo.path,
		commit: head(),
		capBytes: CAP,
	});

	expect(await clone.dispose()).toEqual([]);
	expect(existsSync(dirname(clone.root))).toBe(false);
	expect(existsSync(join(repo.path, "node_modules/dep"))).toBe(true);
	expect(git("worktree", "list", "--porcelain")).not.toContain(clone.root);
});

test("throws for an unknown commit", async () => {
	await expect(open({ commit: "0".repeat(40) })).rejects.toThrow();
});
