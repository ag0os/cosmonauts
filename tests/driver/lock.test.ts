import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	acquirePlanLock,
	acquireRepoCommitLock,
	getPlanLockPath,
	getRepoCommitLockPath,
	type LockHandle,
	type LockWarning,
} from "../../lib/driver/lock.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-lock-test-");

function requireLockHandle(
	result:
		| LockHandle
		| { error: "active"; activeRunId: string; activeAt: string },
): LockHandle {
	if ("error" in result) {
		throw new Error(`expected lock handle, got active ${result.activeRunId}`);
	}
	return result;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

async function expectMissing(path: string): Promise<void> {
	await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function mockDeadPid(pid: number) {
	return vi.spyOn(process, "kill").mockImplementation((targetPid, signal) => {
		if (targetPid === pid && signal === 0) {
			const error = new Error("no such process") as NodeJS.ErrnoException;
			error.code = "ESRCH";
			throw error;
		}
		return true;
	});
}

describe("driver locks", () => {
	test("driver plan lock atomic acquisition creates expected content and releases", async () => {
		const lock = requireLockHandle(
			await acquirePlanLock("plan-a", "run-1", temp.path),
		);
		const lockPath = getPlanLockPath("plan-a", temp.path);

		const content = await readJson(lockPath);
		expect(content).toMatchObject({ runId: "run-1", pid: process.pid });
		expect(typeof content.startedAt).toBe("string");
		expect(Number.isNaN(Date.parse(content.startedAt as string))).toBe(false);

		await lock.release();
		await expectMissing(lockPath);
	});

	test("driver repo commit lock atomic acquisition serializes waiters and releases", async () => {
		const first = await acquireRepoCommitLock(temp.path, { retryDelayMs: 1 });
		const lockPath = getRepoCommitLockPath(temp.path);
		const firstContent = await readJson(lockPath);
		expect(firstContent).toMatchObject({
			runId: "repo-commit",
			pid: process.pid,
		});

		let acquiredSecond = false;
		const secondPromise = acquireRepoCommitLock(temp.path, {
			retryDelayMs: 1,
		}).then((handle) => {
			acquiredSecond = true;
			return handle;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(acquiredSecond).toBe(false);

		await first.release();
		const second = await secondPromise;
		expect(acquiredSecond).toBe(true);

		await second.release();
		await expectMissing(lockPath);
	});

	test("driver lock stale plan lock is removed and acquired", async () => {
		const stalePid = 424_242;
		const lockPath = getPlanLockPath("plan-a", temp.path);
		await mkdir(join(temp.path, "missions", "sessions", "plan-a"), {
			recursive: true,
		});
		await writeFile(
			lockPath,
			JSON.stringify({
				runId: "old-run",
				pid: stalePid,
				startedAt: "2026-01-01T00:00:00.000Z",
			}),
			"utf-8",
		);
		const warnings: LockWarning[] = [];
		const killSpy = mockDeadPid(stalePid);

		const lock = requireLockHandle(
			await acquirePlanLock("plan-a", "new-run", temp.path, {
				onLockWarning: (warning) => {
					warnings.push(warning);
				},
			}),
		);

		expect(killSpy).toHaveBeenCalledWith(stalePid, 0);
		expect(warnings).toEqual([
			{
				type: "lock_warning",
				reason: "stale lock removed",
				details: { previousRunId: "old-run", previousPid: stalePid },
			},
		]);
		expect(await readJson(lockPath)).toMatchObject({
			runId: "new-run",
			pid: process.pid,
		});

		await lock.release();
	});

	test("driver lock stale repo commit lock is removed and acquired", async () => {
		const stalePid = 525_252;
		const lockPath = getRepoCommitLockPath(temp.path);
		await mkdir(join(temp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			lockPath,
			JSON.stringify({
				runId: "old-commit",
				pid: stalePid,
				startedAt: "2026-01-01T00:00:00.000Z",
			}),
			"utf-8",
		);
		const warnings: LockWarning[] = [];
		const killSpy = mockDeadPid(stalePid);

		const lock = await acquireRepoCommitLock(temp.path, {
			onLockWarning: (warning) => {
				warnings.push(warning);
			},
			retryDelayMs: 1,
		});

		expect(killSpy).toHaveBeenCalledWith(stalePid, 0);
		expect(warnings).toEqual([
			{
				type: "lock_warning",
				reason: "stale lock removed",
				details: { previousRunId: "old-commit", previousPid: stalePid },
			},
		]);
		expect(await readJson(lockPath)).toMatchObject({
			runId: "repo-commit",
			pid: process.pid,
		});

		await lock.release();
	});

	test("driver plan lock concurrent acquisition for live pid returns active", async () => {
		const first = requireLockHandle(
			await acquirePlanLock("plan-a", "run-1", temp.path),
		);
		const lockPath = getPlanLockPath("plan-a", temp.path);
		const firstContent = await readJson(lockPath);

		const second = await acquirePlanLock("plan-a", "run-2", temp.path);

		expect(second).toEqual({
			error: "active",
			activeRunId: "run-1",
			activeAt: firstContent.startedAt,
		});
		expect(await readJson(lockPath)).toEqual(firstContent);

		await first.release();
	});
});
