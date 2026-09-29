/**
 * Behavior contract for `snapshotWorktree` (plan driver-hardening D-020, B-011).
 *
 * The fixture mirrors the shape of a real cosmonauts project: a gitignored
 * `missions/sessions/` directory exists on disk. Slice 10 shipped a snapshot
 * that passed `:(exclude)missions/sessions` pathspecs to `git add -A` on the
 * temporary index; git refuses a pathspec that names only ignored paths, so
 * every Drive spawn on a dirty tree aborted before the worker started.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { snapshotWorktree } from "../../lib/driver/runtime-helpers.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

let root: string;

function git(args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "cosmonauts-worktree-snapshot-"));
	git(["init", "-q", "-b", "main"]);
	git(["config", "user.email", "test@example.com"]);
	git(["config", "user.name", "Test"]);
	await writeFile(join(root, ".gitignore"), "missions/sessions\n");
	await writeFile(join(root, "tracked.txt"), "original\n");
	await mkdir(join(root, "missions", "tasks"), { recursive: true });
	git(["add", "-A"]);
	git(["commit", "-q", "-m", "base"]);
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("snapshotWorktree", () => {
	it("snapshots a dirty tree when a gitignored missions/sessions directory exists", async () => {
		await mkdir(join(root, "missions", "sessions"), { recursive: true });
		await writeFile(join(root, "missions", "sessions", "w.jsonl"), "{}\n");
		await writeFile(join(root, "tracked.txt"), "changed\n");
		await writeFile(join(root, "untracked.txt"), "new\n");

		const taskManager = new TaskManager(root);
		const task = await taskManager.createTask({ title: "Snapshot fixture" });
		const ref = await snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: task.id,
			attemptNumber: 1,
			taskManager,
		});

		expect(ref).toBe(`refs/cosmonauts/drive/run-1/${task.id}/attempt-1`);
		const files = git(["ls-tree", "-r", "--name-only", ref as string]);
		expect(files).toContain("tracked.txt");
		expect(files).toContain("untracked.txt");
		expect(files).not.toContain("missions/sessions/w.jsonl");
		expect(git(["show", `${ref}:tracked.txt`])).toBe("changed");
		expect(git(["status", "--porcelain"])).toContain("untracked.txt");
	});

	it("returns undefined and writes no ref on a clean tree", async () => {
		const ref = await snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
			taskManager: new TaskManager(root),
		});
		expect(ref).toBeUndefined();
		expect(() =>
			git([
				"rev-parse",
				"--verify",
				"-q",
				"refs/cosmonauts/drive/run-1/TASK-1/attempt-1",
			]),
		).toThrow();
	});
});
