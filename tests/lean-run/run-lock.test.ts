/**
 * Tests for the per-worktree lean run lock in the worktree's git dir.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { acquireRunLock } from "../../lib/lean-run/run-lock.ts";

let root: string;

function lockPath(): string {
	return join(root, ".git/lean-run/lock");
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "lean-run-lock-"));
	execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("acquireRunLock", () => {
	test("records the run id and this process in the git dir", async () => {
		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
		expect(JSON.parse(await readFile(lockPath(), "utf8"))).toMatchObject({
			runId: "run-a",
			pid: process.pid,
		});
	});

	test("refuses a second run while the first holds the lock", async () => {
		await acquireRunLock({ worktree: root, runId: "run-a" });

		const second = await acquireRunLock({ worktree: root, runId: "run-b" });

		expect(second).toEqual({ acquired: false, holder: "run-a" });
	});

	test("frees the lock on release", async () => {
		const first = await acquireRunLock({ worktree: root, runId: "run-a" });
		if (first.acquired) await first.release();

		expect(existsSync(lockPath())).toBe(false);
		const second = await acquireRunLock({ worktree: root, runId: "run-b" });
		expect(second.acquired).toBe(true);
	});

	test("reclaims a lock whose process is gone", async () => {
		const gone = Number(
			execFileSync("node", ["-p", "process.pid"], { encoding: "utf8" }),
		);
		await mkdir(join(root, ".git/lean-run"), { recursive: true });
		await writeFile(
			lockPath(),
			JSON.stringify({ runId: "old", pid: gone, createdAt: "t" }),
		);

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
		expect(JSON.parse(await readFile(lockPath(), "utf8")).runId).toBe("run-a");
	});

	test("reclaims a lock it cannot read", async () => {
		await mkdir(join(root, ".git/lean-run"), { recursive: true });
		await writeFile(lockPath(), "not json");

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
	});

	test("leaves another run's lock in place on a stale release", async () => {
		const first = await acquireRunLock({ worktree: root, runId: "run-a" });
		await writeFile(
			lockPath(),
			JSON.stringify({ runId: "run-b", pid: process.pid, createdAt: "t" }),
		);
		if (first.acquired) await first.release();

		expect(JSON.parse(await readFile(lockPath(), "utf8")).runId).toBe("run-b");
	});
});
