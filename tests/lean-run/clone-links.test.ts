/**
 * Tests for sorting the snapshot's symlinks by where they lead from the
 * builder clone: into the caller (blocked), elsewhere out of the clone
 * (escaping), or inside it.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { checkSnapshotLinks } from "../../lib/lean-run/clone-links.ts";
import { useTempDir } from "../helpers/fs.ts";

const caller = useTempDir("lean-clone-links-caller-");
const scratch = useTempDir("lean-clone-links-scratch-");

function gitIn(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function initRepo(path: string): void {
	gitIn(path, "init", "-q", "-b", "main");
	gitIn(path, "config", "user.email", "test@example.com");
	gitIn(path, "config", "user.name", "Test");
	gitIn(path, "config", "commit.gpgsign", "false");
}

beforeEach(async () => {
	initRepo(caller.path);
	await writeFile(join(caller.path, "a.ts"), "export {};\n");
	gitIn(caller.path, "add", "-A");
	gitIn(caller.path, "commit", "-q", "-m", "base");
});

/** A repository at `<scratch>/checkout` holding `links`, standing in for the builder clone. */
async function cloneWith(links: Record<string, string>): Promise<string> {
	const clone = join(scratch.path, "checkout");
	await mkdir(clone);
	initRepo(clone);
	for (const [path, target] of Object.entries(links))
		await symlink(target, join(clone, path));
	gitIn(clone, "add", "-A");
	gitIn(clone, "commit", "-q", "-m", "links");
	return clone;
}

test("counts a link that stays in the clone and lists nothing", async () => {
	const clone = await cloneWith({ alias: "missing/file.ts" });

	expect(await checkSnapshotLinks({ clone, caller: caller.path })).toEqual({
		checked: 1,
		blocked: [],
		escaping: [],
	});
});

test("blocks a link into the caller's git common dir from a linked worktree", async () => {
	const worktree = join(scratch.path, "worktree");
	gitIn(caller.path, "worktree", "add", "-q", "-b", "side", worktree);
	const config = join(realpathSync(caller.path), ".git/config");
	const clone = await cloneWith({ "git-config": config });

	const links = await checkSnapshotLinks({ clone, caller: worktree });

	expect(links.blocked).toEqual([
		{ path: "git-config", target: config, resolved: config },
	]);
});

test("does not hang on a link loop, which stays in the clone", async () => {
	const clone = await cloneWith({ ping: "pong", pong: "ping" });

	expect(await checkSnapshotLinks({ clone, caller: caller.path })).toEqual({
		checked: 2,
		blocked: [],
		escaping: [],
	});
});
