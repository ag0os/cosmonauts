/**
 * Tests for the per-worktree lean run lock in the worktree's git dir.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { acquireRunLock } from "../../lib/lean-run/run-lock.ts";

let root: string;

function lockPath(): string {
	return join(root, ".git/lean-run/lock");
}

function claimPath(): string {
	return `${lockPath()}.reclaim`;
}

/** The pid of a process that has already exited. */
function deadPid(): number {
	return Number(
		execFileSync("node", ["-p", "process.pid"], { encoding: "utf8" }),
	);
}

function deadHolder(runId = "old"): string {
	return JSON.stringify({ runId, pid: deadPid(), createdAt: "t" });
}

async function writeRunState(path: string, content: string): Promise<void> {
	await mkdir(join(root, ".git/lean-run"), { recursive: true });
	await writeFile(path, content);
}

/** Moves a file's mtime `seconds` into the past. */
async function backdate(path: string, seconds: number): Promise<void> {
	const then = new Date(Date.now() - seconds * 1000);
	await utimes(path, then, then);
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
		await writeRunState(lockPath(), deadHolder());

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
		expect(JSON.parse(await readFile(lockPath(), "utf8")).runId).toBe("run-a");
	});

	test("reclaims a lock it cannot read once it is a few seconds old", async () => {
		await writeRunState(lockPath(), "not json");
		await backdate(lockPath(), 10);

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
	});

	test("leaves a fresh lock it cannot read in place", async () => {
		await writeRunState(lockPath(), "");

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock).toEqual({ acquired: false, holder: "unknown" });
		expect(await readFile(lockPath(), "utf8")).toBe("");
	});

	test.each([
		2, 4,
	])("lets exactly one of %i racing starters reclaim a dead holder's lock", async (starters) => {
		const dead = deadHolder();
		for (let round = 0; round < 100; round++) {
			await writeRunState(lockPath(), dead);

			const results = await Promise.all(
				Array.from({ length: starters }, (_, index) =>
					acquireRunLock({ worktree: root, runId: `${round}-${index}` }),
				),
			);

			const winners = results.filter((result) => result.acquired);
			expect(winners, `round ${round}`).toHaveLength(1);
			const holder = JSON.parse(await readFile(lockPath(), "utf8")).runId;
			for (const result of results.filter((result) => !result.acquired))
				expect(result, `round ${round}`).toEqual({ acquired: false, holder });
			for (const winner of winners) if (winner.acquired) await winner.release();
		}
		expect(await readdir(join(root, ".git/lean-run"))).toEqual([]);
	}, 30_000);

	test("does not reclaim while another starter holds the reclaim claim", async () => {
		await writeRunState(lockPath(), deadHolder());
		await writeRunState(claimPath(), "someone\n");

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock).toEqual({ acquired: false, holder: "old" });
		expect(JSON.parse(await readFile(lockPath(), "utf8")).runId).toBe("old");
	});

	test("takes over a reclaim claim abandoned a few seconds ago", async () => {
		await writeRunState(lockPath(), deadHolder());
		await writeRunState(claimPath(), "someone\n");
		await backdate(claimPath(), 10);

		const lock = await acquireRunLock({ worktree: root, runId: "run-a" });

		expect(lock.acquired).toBe(true);
		expect(JSON.parse(await readFile(lockPath(), "utf8")).runId).toBe("run-a");
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
