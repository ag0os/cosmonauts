import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	acquirePlanLock,
	acquireRepoCommitLock,
	getPlanLockPath,
	getRepoCommitLockPath,
	isProcessAlive,
	type LockHandle,
	type LockWarning,
} from "../../lib/driver/lock.ts";
import {
	EntityFileLockTimeoutError,
	withEntityFileLock,
} from "../../lib/entity-file-lock.ts";
import { useTempDir } from "../helpers/fs.ts";

type FsOperation = (...args: never[]) => Promise<unknown>;

const fsMocks = vi.hoisted(() => ({
	link: vi.fn<(...args: never[]) => Promise<unknown>>(),
	rename: vi.fn<(...args: never[]) => Promise<unknown>>(),
	unlink: vi.fn<(...args: never[]) => Promise<unknown>>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		link: fsMocks.link,
		rename: fsMocks.rename,
		unlink: fsMocks.unlink,
	};
});

const temp = useTempDir("lock-primitives-characterization-");
let actualFs: typeof import("node:fs/promises");

beforeEach(async () => {
	actualFs =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	for (const name of ["link", "rename", "unlink"] as const) {
		fsMocks[name].mockReset();
		fsMocks[name].mockImplementation((...args) =>
			(actualFs[name] as unknown as FsOperation)(...args),
		);
	}
});

afterEach(() => {
	vi.restoreAllMocks();
});

function requirePlanHandle(
	result:
		| LockHandle
		| { error: "active"; activeRunId: string; activeAt: string },
): LockHandle {
	if ("error" in result) {
		throw new Error(`expected lock handle, got active ${result.activeRunId}`);
	}
	return result;
}

interface DriverLockContent {
	readonly runId: string;
	readonly pid: number;
	readonly startedAt: string;
}

interface EntityLockContent {
	readonly pid: number;
	readonly uuid: string;
	readonly startedAt: string;
}

async function writeJson(path: string, content: object): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(content)}\n`, "utf-8");
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf-8")) as T;
}

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function mockDeadPid(pid: number): void {
	vi.spyOn(process, "kill").mockImplementation((target, signal) => {
		if (target === pid && signal === 0) {
			throw Object.assign(new Error("no such process"), { code: "ESRCH" });
		}
		return true;
	});
}

describe("driver lock characterization", () => {
	it("keeps lock path ownership distinct for plans and repository commits", () => {
		expect(getPlanLockPath("plan-a", "/repo")).toBe(
			join("/repo", "missions", "sessions", "plan-a", "driver.lock"),
		);
		expect(getRepoCommitLockPath("/repo")).toBe(
			join("/repo", ".cosmonauts", "driver-commit.lock"),
		);
	});

	it("classifies invalid, live, missing, and inaccessible process owners", () => {
		const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
			if (pid === 20) {
				throw Object.assign(new Error("missing"), { code: "ESRCH" });
			}
			if (pid === 30) {
				throw Object.assign(new Error("not permitted"), { code: "EPERM" });
			}
			return true;
		});

		expect(isProcessAlive(Number.NaN)).toBe(false);
		expect(isProcessAlive(0)).toBe(false);
		expect(isProcessAlive(10)).toBe(true);
		expect(isProcessAlive(20)).toBe(false);
		expect(isProcessAlive(30)).toBe(true);
		expect(kill.mock.calls).toEqual([
			[10, 0],
			[20, 0],
			[30, 0],
		]);
	});

	it("returns the active plan owner's durable run and timestamp fields", async () => {
		const first = requirePlanHandle(
			await acquirePlanLock("plan-a", "run-1", temp.path),
		);
		const lockPath = getPlanLockPath("plan-a", temp.path);
		const persisted = await readJson<DriverLockContent>(lockPath);

		await expect(
			acquirePlanLock("plan-a", "run-2", temp.path),
		).resolves.toEqual({
			error: "active",
			activeRunId: "run-1",
			activeAt: persisted.startedAt,
		});
		expect(await readJson(lockPath)).toEqual(persisted);

		await first.release();
	});

	it("reclaims a stale plan owner and emits the exact warning payload", async () => {
		const stalePid = 424_201;
		const lockPath = getPlanLockPath("plan-a", temp.path);
		await writeJson(lockPath, {
			runId: "stale-run",
			pid: stalePid,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);
		const warnings: LockWarning[] = [];

		const handle = requirePlanHandle(
			await acquirePlanLock("plan-a", "new-run", temp.path, {
				onLockWarning: (warning) => {
					warnings.push(warning);
				},
			}),
		);

		expect(warnings).toEqual([
			{
				type: "lock_warning",
				reason: "stale lock removed",
				details: {
					previousRunId: "stale-run",
					previousPid: stalePid,
				},
			},
		]);
		expect(await readJson<DriverLockContent>(lockPath)).toMatchObject({
			runId: "new-run",
			pid: process.pid,
		});

		await handle.release();
	});

	it("does not release a replacement plan owner", async () => {
		const lockPath = getPlanLockPath("plan-a", temp.path);
		const handle = requirePlanHandle(
			await acquirePlanLock("plan-a", "original", temp.path),
		);
		const replacement = {
			runId: "replacement",
			pid: process.pid,
			startedAt: "2026-07-24T12:00:00.000Z",
		};
		await actualFs.unlink(lockPath);
		await writeJson(lockPath, replacement);

		await handle.release();

		expect(await readJson(lockPath)).toEqual(replacement);
		await actualFs.unlink(lockPath);
	});

	it("propagates an unconfirmed plan release and allows the same handle to retry", async () => {
		const lockPath = getPlanLockPath("plan-a", temp.path);
		const handle = requirePlanHandle(
			await acquirePlanLock("plan-a", "run-1", temp.path),
		);
		const releaseError = Object.assign(new Error("release failed"), {
			code: "EIO",
		});
		let ownedUnlinks = 0;
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				ownedUnlinks += 1;
				if (ownedUnlinks === 1) throw releaseError;
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		await expect(handle.release()).rejects.toBe(releaseError);
		await expect(handle.release()).resolves.toBeUndefined();
		await handle.release();

		expect(ownedUnlinks).toBe(2);
		await expectMissing(lockPath);
	});

	it("serializes repository commit waiters until the current owner releases", async () => {
		const first = await acquireRepoCommitLock(temp.path, { retryDelayMs: 1 });
		let settled = false;
		const secondPromise = acquireRepoCommitLock(temp.path, {
			retryDelayMs: 1,
		}).then((handle) => {
			settled = true;
			return handle;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);
		await first.release();

		const second = await secondPromise;
		expect(settled).toBe(true);
		await second.release();
	});

	it("reclaims a stale repository commit owner with the same warning contract", async () => {
		const stalePid = 424_202;
		const lockPath = getRepoCommitLockPath(temp.path);
		await writeJson(lockPath, {
			runId: "stale-commit",
			pid: stalePid,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);
		const warnings: LockWarning[] = [];

		const handle = await acquireRepoCommitLock(temp.path, {
			retryDelayMs: 1,
			onLockWarning: (warning) => {
				warnings.push(warning);
			},
		});

		expect(warnings).toEqual([
			{
				type: "lock_warning",
				reason: "stale lock removed",
				details: {
					previousRunId: "stale-commit",
					previousPid: stalePid,
				},
			},
		]);
		expect(await readJson<DriverLockContent>(lockPath)).toMatchObject({
			runId: "repo-commit",
			pid: process.pid,
		});

		await handle.release();
	});
});

describe("entity file lock characterization", () => {
	function entityLockPath(name: string): string {
		return join(temp.path, name, ".cosmonauts", `${name}.lock`);
	}

	it("times out on a live owner with durable error fields and leaves it intact", async () => {
		const lockPath = entityLockPath("timeout");
		const owner = {
			pid: process.pid,
			uuid: "live-owner",
			startedAt: "2026-07-24T12:00:00.000Z",
		};
		await writeJson(lockPath, owner);
		const action = vi.fn(async () => "unreachable");

		const attempt = withEntityFileLock(lockPath, action, {
			retryDelayMs: 2,
			waitTimeoutMs: 25,
		});

		await expect(attempt).rejects.toEqual(
			expect.objectContaining({
				name: "EntityFileLockTimeoutError",
				lockPath,
				waitTimeoutMs: 25,
				message: `Timed out after 25ms waiting for entity lock ${lockPath}.`,
			}),
		);
		expect(action).not.toHaveBeenCalled();
		expect(await readJson(lockPath)).toEqual(owner);
	});

	it("exposes the timeout error fields through its public constructor", () => {
		const error = new EntityFileLockTimeoutError("/tmp/entity.lock", 40);

		expect(error).toMatchObject({
			name: "EntityFileLockTimeoutError",
			lockPath: "/tmp/entity.lock",
			waitTimeoutMs: 40,
			message: "Timed out after 40ms waiting for entity lock /tmp/entity.lock.",
		});
	});

	it("does not reclaim a live replacement that wins the stale-owner race", async () => {
		const lockPath = entityLockPath("replacement-race");
		const stalePid = 424_203;
		await writeJson(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);
		const replacement: EntityLockContent = {
			pid: process.pid,
			uuid: "live-replacement",
			startedAt: "2026-07-24T12:00:00.000Z",
		};
		let replaced = false;
		fsMocks.link.mockImplementation(async (...args) => {
			const [from, to] = args as unknown as [string, string];
			if (from === lockPath && to.endsWith(".removing.lock") && !replaced) {
				replaced = true;
				await actualFs.unlink(lockPath);
				await writeJson(lockPath, replacement);
			}
			return (actualFs.link as unknown as FsOperation)(...args);
		});
		const action = vi.fn(async () => "unreachable");

		await expect(
			withEntityFileLock(lockPath, action, {
				retryDelayMs: 2,
				waitTimeoutMs: 30,
			}),
		).rejects.toMatchObject({ name: "EntityFileLockTimeoutError" });

		expect(action).not.toHaveBeenCalled();
		expect(await readJson(lockPath)).toEqual(replacement);
		expect(await readdir(dirname(lockPath))).toEqual([
			lockPath.slice(lockPath.lastIndexOf("/") + 1),
		]);
	});

	it("reclaims a stale owner, returns the action result, and confirms release", async () => {
		const lockPath = entityLockPath("stale-release");
		const stalePid = 424_204;
		await writeJson(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);
		const onReleaseUnconfirmed = vi.fn();

		await expect(
			withEntityFileLock(
				lockPath,
				async () => {
					const held = await readJson<EntityLockContent>(lockPath);
					expect(held.pid).toBe(process.pid);
					expect(held.uuid).not.toBe("stale-owner");
					return "persisted";
				},
				{ retryDelayMs: 1, onReleaseUnconfirmed },
			),
		).resolves.toBe("persisted");

		expect(onReleaseUnconfirmed).not.toHaveBeenCalled();
		await expectMissing(lockPath);
	});

	it("returns a persisted result and reports the final release error after three attempts", async () => {
		const lockPath = entityLockPath("release-error");
		const action = vi.fn(async () => "persisted");
		const onReleaseUnconfirmed = vi.fn();
		const releaseError = Object.assign(
			new Error("persistent release failure"),
			{
				code: "EIO",
			},
		);
		let releaseAttempts = 0;
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				releaseAttempts += 1;
				throw releaseError;
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		await expect(
			withEntityFileLock(lockPath, action, {
				retryDelayMs: 1,
				onReleaseUnconfirmed,
			}),
		).resolves.toBe("persisted");

		expect(action).toHaveBeenCalledOnce();
		expect(releaseAttempts).toBe(3);
		expect(onReleaseUnconfirmed).toHaveBeenCalledExactlyOnceWith(releaseError);
	});

	it("reports a timed-out release once without retrying the in-flight unlink", async () => {
		const lockPath = entityLockPath("release-timeout");
		const onReleaseUnconfirmed = vi.fn();
		let releaseAttempts = 0;
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				releaseAttempts += 1;
				return new Promise<never>(() => undefined);
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		await expect(
			withEntityFileLock(lockPath, async () => "persisted", {
				releaseTimeoutMs: 20,
				onReleaseUnconfirmed,
			}),
		).resolves.toBe("persisted");

		expect(releaseAttempts).toBe(1);
		expect(onReleaseUnconfirmed).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "ReleaseTimeoutError",
				message: "Timed out after 20ms releasing the entity lock.",
			}),
		);
	});

	it("preserves an action failure when release also remains unconfirmed", async () => {
		const lockPath = entityLockPath("action-error");
		const actionError = new Error("primary action failed");
		const onReleaseUnconfirmed = vi.fn();
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				throw Object.assign(new Error("release failed"), { code: "EIO" });
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		await expect(
			withEntityFileLock(
				lockPath,
				async () => {
					throw actionError;
				},
				{ retryDelayMs: 1, onReleaseUnconfirmed },
			),
		).rejects.toBe(actionError);

		expect(onReleaseUnconfirmed).toHaveBeenCalledOnce();
	});
});
