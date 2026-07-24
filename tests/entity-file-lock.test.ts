import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withEntityFileLock } from "../lib/entity-file-lock.ts";
import {
	TASK_CREATE_LOCK_WAIT_TIMEOUT_MS,
	withTaskCreateLock,
} from "../lib/tasks/lock.ts";
import { useTempDir } from "./helpers/fs.ts";

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

const tmp = useTempDir("entity-file-lock-");

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

describe("entity file lock — stale reclamation ownership", () => {
	test("two contenders inspecting one stale owner never run concurrently and never remove the replacement owner", async () => {
		const lockPath = entityLockPath("stale-contenders");
		const stalePid = 424_242;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		// Gate every destructive claim on the lock slot, whatever syscall performs
		// it, so the interleaving is pinned regardless of removal mechanism: both
		// contenders inspect the same stale owner, the winner then reclaims it and
		// starts its action, and only afterwards does the loser act on the removal
		// decision it made while the stale owner was still on disk.
		const gates: Array<() => void> = [];
		const bothClaimsArrived = deferred<void>();
		const gateRemovalClaim = async (target: string): Promise<void> => {
			if (target !== lockPath) return;
			const claimIndex = gates.length;
			if (claimIndex > 1) return;

			const held = new Promise<void>((resolve) => gates.push(resolve));
			if (gates.length === 2) bothClaimsArrived.resolve();
			await held;
		};

		fsMocks.rename.mockImplementation(async (...args) => {
			const [from] = args as unknown as [string, string];
			await gateRemovalClaim(from);
			return (actualFs.rename as unknown as FsOperation)(...args);
		});
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			await gateRemovalClaim(target);
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		let active = 0;
		let maxActive = 0;
		const holdAction = deferred<void>();
		const actionStarted = deferred<void>();
		const runAction = async () => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			actionStarted.resolve();
			await holdAction.promise;
			active -= 1;
			return "done";
		};

		const first = withEntityFileLock(lockPath, runAction, { retryDelayMs: 1 });
		const second = withEntityFileLock(lockPath, runAction, { retryDelayMs: 1 });

		await bothClaimsArrived.promise;
		gates[0]?.();
		await actionStarted.promise;
		// The winner now holds a fresh live lock. Release the loser's removal.
		gates[1]?.();
		// Give the loser every chance to break in behind the winner.
		await settle(60);

		try {
			expect(maxActive).toBe(1);
			// Exactly one live owner holds the slot while the winner runs.
			const held = await readLockContent(lockPath);
			expect(held.pid).toBe(process.pid);
			expect(held.uuid).not.toBe("stale-owner");
		} finally {
			holdAction.resolve();
			await Promise.all([first, second]);
		}

		expect(maxActive).toBe(1);
		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	test("reclaims a stale owner and leaves no removal temp behind", async () => {
		const lockPath = entityLockPath("stale-single");
		const stalePid = 424_243;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		await expect(
			withEntityFileLock(lockPath, async () => {
				expect((await readLockContent(lockPath)).uuid).not.toBe("stale-owner");
				return "acquired";
			}),
		).resolves.toBe("acquired");

		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	test("reclaims an unparseable lock file rather than deadlocking on it", async () => {
		const lockPath = entityLockPath("corrupt-owner");
		await mkdir(join(lockPath, ".."), { recursive: true });
		await writeFile(lockPath, "{ not json at all", "utf-8");

		await expect(
			withEntityFileLock(lockPath, async () => "acquired", {
				retryDelayMs: 1,
				waitTimeoutMs: 500,
			}),
		).resolves.toBe("acquired");

		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	// `withTaskCreateLock` waits with no timeout, so a reclamation path that can
	// spin would hang task creation forever — worse than main's blind unlink.
	test("serializes contenders with no wait timeout instead of livelocking on a stale owner", async () => {
		const lockPath = entityLockPath("no-timeout-contenders");
		const stalePid = 424_246;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		let active = 0;
		let maxActive = 0;
		const runAction = async (id: number) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await settle(5);
			active -= 1;
			return id;
		};

		// No `waitTimeoutMs`: these can only settle by making real progress.
		await expect(
			Promise.all([
				withEntityFileLock(lockPath, () => runAction(1), { retryDelayMs: 1 }),
				withEntityFileLock(lockPath, () => runAction(2), { retryDelayMs: 1 }),
				withEntityFileLock(lockPath, () => runAction(3), { retryDelayMs: 1 }),
			]),
		).resolves.toEqual([1, 2, 3]);

		expect(maxActive).toBe(1);
		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	// Stranding a live-PID lock is BELOW main's floor: main's blind unlink never
	// leaves one behind, and `withTaskCreateLock` waits with no timeout, so a
	// stranded lock blocks task creation until the owning process exits.
	test("does not strand a live owner that releases while reclamation is in flight", async () => {
		const lockPath = entityLockPath("strand");
		const stalePid = 424_247;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		// Swap in a live owner at whichever syscall the reclaimer first aims at
		// the lock slot, so this stays neutral to the removal mechanism.
		let swapped = false;
		const swapThenRun = async (
			name: "link" | "rename",
			args: never[],
		): Promise<unknown> => {
			const [from] = args as unknown as [string, string];
			if (from !== lockPath || swapped) {
				return (actualFs[name] as unknown as FsOperation)(...args);
			}
			swapped = true;

			await (actualFs.unlink as unknown as FsOperation)(lockPath as never);
			const enteredOwner = deferred<void>();
			const finishOwner = deferred<void>();
			const owner = withEntityFileLock(lockPath, async () => {
				enteredOwner.resolve();
				await finishOwner.promise;
				return "owner";
			});
			await enteredOwner.promise;

			const result = await (actualFs[name] as unknown as FsOperation)(...args);
			// The owner finishes and releases while reclamation is mid-flight.
			finishOwner.resolve();
			await owner;
			return result;
		};
		fsMocks.link.mockImplementation((...args) => swapThenRun("link", args));
		fsMocks.rename.mockImplementation((...args) => swapThenRun("rename", args));

		await withEntityFileLock(lockPath, async () => "contender", {
			retryDelayMs: 2,
			waitTimeoutMs: 200,
		}).catch(() => undefined);

		// A caller that waits without a timeout must still make progress.
		let acquired = false;
		const result = await Promise.race([
			withEntityFileLock(lockPath, async () => {
				acquired = true;
				return "acquired";
			}),
			settle(250).then(() => "blocked"),
		]);

		expect(result).toBe("acquired");
		expect(acquired).toBe(true);
		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	test("never removes a live replacement owner that took the slot mid-reclamation", async () => {
		const lockPath = entityLockPath("replacement-owner");
		const stalePid = 424_244;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		const replacement = {
			pid: process.pid,
			uuid: "live-replacement",
			startedAt: "2026-07-24T12:00:00.000Z",
		};
		// Swap the inspected stale owner for a live replacement in the window
		// between inspection and removal.
		let swapped = false;
		fsMocks.rename.mockImplementation(async (...args) => {
			const [from] = args as unknown as [string, string];
			if (from === lockPath && !swapped) {
				swapped = true;
				await (actualFs.unlink as unknown as FsOperation)(
					lockPath as never,
				).catch(() => undefined);
				await writeLockContent(lockPath, replacement);
			}
			return (actualFs.rename as unknown as FsOperation)(...args);
		});

		const attempt = withEntityFileLock(lockPath, async () => "acquired", {
			retryDelayMs: 2,
			waitTimeoutMs: 60,
		});

		await expect(attempt).rejects.toMatchObject({
			name: "EntityFileLockTimeoutError",
		});
		// The replacement owner's lock survived the reclamation attempt intact.
		expect(await readLockContent(lockPath)).toEqual(replacement);
		await expectNoResidualFiles(lockPath);
	});
});

describe("entity file lock — degraded filesystem behavior", () => {
	// A filesystem that refuses hard links (some network/FUSE mounts) must fail
	// the acquisition, not spin: the reclaim retry has no delay and no timeout
	// accounting, and `withTaskCreateLock` waits without a timeout.
	test("propagates a persistent stale-verification failure instead of spinning", async () => {
		const lockPath = entityLockPath("verify-failure");
		const stalePid = 424_248;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		let verifyAttempts = 0;
		fsMocks.link.mockImplementation(async (...args) => {
			const [from, to] = args as unknown as [string, string];
			if (from === lockPath && to.endsWith(".removing.lock")) {
				verifyAttempts += 1;
				throw Object.assign(new Error("hard links unavailable"), {
					code: "EPERM",
				});
			}
			return (actualFs.link as unknown as FsOperation)(...args);
		});

		await expect(
			withEntityFileLock(lockPath, async () => "acquired", {
				retryDelayMs: 1,
				waitTimeoutMs: 50,
			}),
		).rejects.toMatchObject({ code: "EPERM" });

		// Bounded: it must not retry the failing verification in a hot loop.
		expect(verifyAttempts).toBeLessThanOrEqual(2);
	});

	test("returns the persisted result when a release syscall never settles", async () => {
		const lockPath = entityLockPath("release-hang");
		const action = vi.fn(async () => "persisted");
		const onReleaseUnconfirmed = vi.fn();
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				// Never settles, as on a wedged filesystem.
				return new Promise<never>(() => undefined);
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		// D-008: the update already persisted, so it must not wait on the lock.
		await expect(
			withEntityFileLock(lockPath, action, {
				retryDelayMs: 1,
				releaseTimeoutMs: 30,
				onReleaseUnconfirmed,
			}),
		).resolves.toBe("persisted");

		expect(action).toHaveBeenCalledOnce();
		expect(onReleaseUnconfirmed).toHaveBeenCalledOnce();
	});

	test("bounds task-create acquisition rather than waiting forever", async () => {
		const projectRoot = join(tmp.path, "task-create-bound");
		const lockPath = join(projectRoot, ".cosmonauts", "task-create.lock");
		// A live-PID lock with no owner left to release it: stale recovery will
		// never reclaim it, so an unbounded wait would hang task creation.
		await writeLockContent(lockPath, {
			pid: process.pid,
			uuid: "stranded-owner",
			startedAt: "2026-07-24T12:00:00.000Z",
		});

		await expect(
			withTaskCreateLock(projectRoot, async () => "created", {
				retryDelayMs: 2,
				waitTimeoutMs: 50,
			}),
		).rejects.toMatchObject({ name: "EntityFileLockTimeoutError" });

		// The shipped default must itself be finite.
		expect(Number.isFinite(TASK_CREATE_LOCK_WAIT_TIMEOUT_MS)).toBe(true);
	});
});

describe("entity file lock — release failure handling", () => {
	test("recovers a transient release failure without rerunning the action", async () => {
		const lockPath = entityLockPath("transient-release");
		const action = vi.fn(async () => "persisted");
		const onReleaseUnconfirmed = vi.fn();
		let ownedUnlinks = 0;
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				ownedUnlinks += 1;
				if (ownedUnlinks === 1) {
					throw Object.assign(new Error("transient unlink failure"), {
						code: "EIO",
					});
				}
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
		expect(ownedUnlinks).toBeGreaterThan(1);
		expect(onReleaseUnconfirmed).not.toHaveBeenCalled();
		await expectMissing(lockPath);
		await expectNoResidualFiles(lockPath);
	});

	test("returns the persisted result and reports unconfirmed release when unlink never succeeds", async () => {
		const lockPath = entityLockPath("persistent-release");
		const action = vi.fn(async () => "persisted");
		const onReleaseUnconfirmed = vi.fn();
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				throw Object.assign(new Error("persistent unlink failure"), {
					code: "EIO",
				});
			}
			return (actualFs.unlink as unknown as FsOperation)(...args);
		});

		// D-008: a lock we cannot release must never fail an update that persisted.
		await expect(
			withEntityFileLock(lockPath, action, {
				retryDelayMs: 1,
				onReleaseUnconfirmed,
			}),
		).resolves.toBe("persisted");

		expect(action).toHaveBeenCalledOnce();
		expect(onReleaseUnconfirmed).toHaveBeenCalledOnce();
		expect(onReleaseUnconfirmed).toHaveBeenCalledWith(
			expect.objectContaining({ code: "EIO" }),
		);
	});

	test("propagates an action failure unchanged even when release cannot be confirmed", async () => {
		const lockPath = entityLockPath("action-failure-release");
		const actionError = new Error("primary write failed");
		const onReleaseUnconfirmed = vi.fn();
		fsMocks.unlink.mockImplementation(async (...args) => {
			const [target] = args as unknown as [string];
			if (target === lockPath) {
				throw Object.assign(new Error("persistent unlink failure"), {
					code: "EIO",
				});
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

describe("entity file lock — residual file placement", () => {
	test("keeps removal temps flat under .cosmonauts and matched by the *.lock ignore glob", async () => {
		const lockPath = entityLockPath("temp-placement");
		const stalePid = 424_245;
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		mockDeadPid(stalePid);

		const observed: string[] = [];
		fsMocks.rename.mockImplementation(async (...args) => {
			const [from, to] = args as unknown as [string, string];
			if (from === lockPath) observed.push(to);
			return (actualFs.rename as unknown as FsOperation)(...args);
		});

		await withEntityFileLock(lockPath, async () => "acquired");

		expect(observed).not.toHaveLength(0);
		const lockDirectory = join(lockPath, "..");
		for (const temp of observed) {
			// Flat sibling of the lock file: no new nested directory to scan.
			expect(join(temp, "..")).toBe(lockDirectory);
			// Covered by the single-level `.cosmonauts/*.lock` ignore glob.
			expect(temp.endsWith(".lock")).toBe(true);
			// Unique per attempt: a crashed remover cannot strand a name that
			// blocks every future reclaimer.
			expect(temp).toContain(String(process.pid));
		}
		await expectNoResidualFiles(lockPath);
	});
});

function entityLockPath(name: string): string {
	return join(tmp.path, name, ".cosmonauts", `entity-${name}.lock`);
}

interface TestLockContent {
	readonly pid: number;
	readonly uuid: string;
	readonly startedAt: string;
}

async function writeLockContent(
	lockPath: string,
	content: TestLockContent,
): Promise<void> {
	await mkdir(join(lockPath, ".."), { recursive: true });
	await writeFile(lockPath, `${JSON.stringify(content)}\n`, "utf-8");
}

async function readLockContent(lockPath: string): Promise<TestLockContent> {
	return JSON.parse(await readFile(lockPath, "utf-8")) as TestLockContent;
}

function mockDeadPid(pid: number): void {
	vi.spyOn(process, "kill").mockImplementation((target, signal) => {
		if (target === pid && signal === 0) {
			const error = new Error("no such process") as NodeJS.ErrnoException;
			error.code = "ESRCH";
			throw error;
		}
		return true;
	});
}

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

/** No temp/removal artifacts survive alongside the lock file. */
async function expectNoResidualFiles(lockPath: string): Promise<void> {
	const entries = await readdir(join(lockPath, ".."));
	const lockName = lockPath.slice(lockPath.lastIndexOf("/") + 1);
	expect(entries.filter((entry) => entry !== lockName)).toEqual([]);
}

function settle(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T = void>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
} {
	let resolvePromise: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}
