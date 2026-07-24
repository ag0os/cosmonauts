import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { withEpisodeTransitionLock } from "../../lib/memory/episode-transition-lock.ts";
import { withEntityFileLock } from "../../lib/tasks/lock.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("episode-transition-lock-");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("episode transition lock", () => {
	test("acquires an enabled entity lock with PID-plus-nonce ownership and releases it", async () => {
		const projectRoot = join(tmp.path, "enabled");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);

		const result = await withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			action: async () => {
				const content = await readLockContent(lockPath);
				expect(content.pid).toBe(process.pid);
				expect(content.uuid).toEqual(expect.any(String));
				expect(content.uuid).not.toHaveLength(0);
				return "locked";
			},
		});

		expect(result).toBe("locked");
		await expectMissing(lockPath);
	});

	test("waits for an enabled entity lock holder before running the action", async () => {
		const projectRoot = join(tmp.path, "wait");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);
		const releaseFirst = deferred<void>();
		const firstStarted = deferred<void>();
		const first = withEntityFileLock(lockPath, async () => {
			firstStarted.resolve();
			await releaseFirst.promise;
		});
		await firstStarted.promise;

		let secondStarted = false;
		const second = withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			action: async () => {
				secondStarted = true;
				return "second";
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(secondStarted).toBe(false);

		releaseFirst.resolve();
		await expect(first).resolves.toBeUndefined();
		await expect(second).resolves.toBe("second");
		expect(secondStarted).toBe(true);
		await expectMissing(lockPath);
	});

	test("removes a stale owner before acquiring the enabled entity lock", async () => {
		const projectRoot = join(tmp.path, "stale");
		const lockPath = episodeLockPath(projectRoot);
		const stalePid = 424_242;
		await writeEpisodicConfig(projectRoot, true);
		await writeLockContent(lockPath, {
			pid: stalePid,
			uuid: "stale-owner",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		const killSpy = vi
			.spyOn(process, "kill")
			.mockImplementation((pid, signal) => {
				if (pid === stalePid && signal === 0) {
					const error = new Error("no such process") as NodeJS.ErrnoException;
					error.code = "ESRCH";
					throw error;
				}
				return true;
			});

		await withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			action: async () => {
				expect((await readLockContent(lockPath)).uuid).not.toBe("stale-owner");
			},
		});

		expect(killSpy).toHaveBeenCalledWith(stalePid, 0);
		await expectMissing(lockPath);
	});

	test("does not release a replacement lock owned by another nonce", async () => {
		const projectRoot = join(tmp.path, "owner-release");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);
		const replacement = {
			pid: process.pid,
			uuid: "replacement-owner",
			startedAt: "2026-07-22T12:00:00.000Z",
		};

		await withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			action: async () => {
				await unlink(lockPath);
				await writeFile(lockPath, `${JSON.stringify(replacement)}\n`, "utf-8");
			},
		});

		expect(await readLockContent(lockPath)).toEqual(replacement);
	});

	test("bypasses config and locking without episode context", async () => {
		const projectRoot = join(tmp.path, "context-free");
		const lockPath = episodeLockPath(projectRoot);
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			"invalid json",
			"utf-8",
		);
		const reportEpisodeWarning = vi.fn();

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: false,
				reportEpisodeWarning,
				action: async () => "direct",
			}),
		).resolves.toBe("direct");

		expect(reportEpisodeWarning).not.toHaveBeenCalled();
		await expectMissing(lockPath);
	});

	test.each([
		["absent gate", undefined],
		["false gate", false],
	] as const)("bypasses locking for %s", async (_name, enabled) => {
		const projectRoot = join(tmp.path, `bypass-${String(enabled)}`);
		const lockPath = episodeLockPath(projectRoot);
		if (enabled !== undefined) {
			await writeEpisodicConfig(projectRoot, enabled);
		}
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => {
			await expectMissing(lockPath);
			return "direct";
		});

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
			}),
		).resolves.toBe("direct");

		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).not.toHaveBeenCalled();
		await expectMissing(lockPath);
	});

	test("bypasses locking and leaves warning ownership to episode capture when config loading fails", async () => {
		const projectRoot = join(tmp.path, "config-failure");
		const lockPath = episodeLockPath(projectRoot);
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			"invalid json",
			"utf-8",
		);
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => "direct");

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
			}),
		).resolves.toBe("direct");

		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).not.toHaveBeenCalled();
		await expectMissing(lockPath);
	});

	test("warns once and runs unlocked when entity lock acquisition fails", async () => {
		const projectRoot = join(tmp.path, "acquisition-failure");
		await writeEpisodicConfig(projectRoot, true);
		const blockedParent = join(projectRoot, "blocked-parent");
		await writeFile(blockedParent, "not a directory", "utf-8");
		const lockPath = join(blockedParent, "episode-plan-example.lock");
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => "unlocked");

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
			}),
		).resolves.toBe("unlocked");

		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledWith({
			path: lockPath,
			message: expect.stringMatching(/transition lock.*continuing unlocked/iu),
		});
	});

	test("runs unlocked when the acquisition warning reporter never resolves", async () => {
		const projectRoot = join(tmp.path, "stalled-warning");
		const lockPath = episodeLockPath(projectRoot);
		const acquisitionError = new Error("acquisition failed");
		const warningStarted = deferred<void>();
		const reportEpisodeWarning = vi.fn(() => {
			warningStarted.resolve(undefined);
			return new Promise<void>(() => undefined);
		});
		const action = vi.fn(async () => "unlocked");

		const result = withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			reportEpisodeWarning,
			action,
			dependencies: {
				loadConfig: async () => ({ episodicLog: { enabled: true } }),
				withEntityFileLock: async <_T>() => {
					throw acquisitionError;
				},
			},
		});

		await warningStarted.promise;
		await Promise.resolve();
		expect(action).toHaveBeenCalledOnce();
		await expect(result).resolves.toBe("unlocked");
		expect(reportEpisodeWarning).toHaveBeenCalledOnce();
	});

	test("bounds a live-owner wait then warns once and runs unlocked", async () => {
		const projectRoot = join(tmp.path, "timeout");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);
		await writeLockContent(lockPath, {
			pid: process.pid,
			uuid: "live-owner",
			startedAt: "2026-07-22T12:00:00.000Z",
		});
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => {
			expect((await readLockContent(lockPath)).uuid).toBe("live-owner");
			return "unlocked";
		});
		const startedAt = Date.now();

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
				dependencies: {
					lockRetryDelayMs: 2,
					lockWaitTimeoutMs: 20,
				},
			}),
		).resolves.toBe("unlocked");

		expect(Date.now() - startedAt).toBeLessThan(250);
		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledWith({
			path: lockPath,
			message: expect.stringMatching(/timed out.*continuing unlocked/iu),
		});
	});

	test("returns a persisted update when release fails and the warning reporter never resolves", async () => {
		const projectRoot = join(tmp.path, "stalled-release-warning");
		const lockPath = episodeLockPath(projectRoot);
		const releaseError = new Error("release failed");
		const warningStarted = deferred<void>();
		const reportEpisodeWarning = vi.fn(() => {
			warningStarted.resolve(undefined);
			return new Promise<void>(() => undefined);
		});
		const action = vi.fn(async () => "persisted");

		const result = withEpisodeTransitionLock({
			projectRoot,
			lockPath,
			hasEpisodeContext: true,
			reportEpisodeWarning,
			action,
			dependencies: {
				loadConfig: async () => ({ episodicLog: { enabled: true } }),
				withEntityFileLock: async <T>(
					_lockPath: string,
					fn: () => Promise<T>,
				) => {
					await fn();
					throw releaseError;
				},
			},
		});

		await warningStarted.promise;
		await Promise.resolve();
		expect(action).toHaveBeenCalledOnce();
		// D-008: the update already persisted, so a never-settling warning
		// reporter must not stall the caller waiting on it.
		await expect(result).resolves.toBe("persisted");
		expect(reportEpisodeWarning).toHaveBeenCalledOnce();
	});

	test("warns once without overturning a primary result when release fails", async () => {
		const projectRoot = join(tmp.path, "release-failure");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);
		const releaseError = new Error("release failed");
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => "persisted");

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
				dependencies: {
					withEntityFileLock: async <T>(
						_lockPath: string,
						lockedAction: () => Promise<T>,
					) => {
						await lockedAction();
						throw releaseError;
					},
				},
			}),
		).resolves.toBe("persisted");

		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).toHaveBeenCalledWith({
			path: lockPath,
			message: expect.stringMatching(/release failed.*continuing unlocked/iu),
		});
	});

	test("propagates a primary action failure without retrying it unlocked", async () => {
		const projectRoot = join(tmp.path, "action-failure");
		const lockPath = episodeLockPath(projectRoot);
		await writeEpisodicConfig(projectRoot, true);
		const actionError = new Error("primary write failed");
		const reportEpisodeWarning = vi.fn();
		const action = vi.fn(async () => {
			throw actionError;
		});

		await expect(
			withEpisodeTransitionLock({
				projectRoot,
				lockPath,
				hasEpisodeContext: true,
				reportEpisodeWarning,
				action,
			}),
		).rejects.toBe(actionError);

		expect(action).toHaveBeenCalledOnce();
		expect(reportEpisodeWarning).not.toHaveBeenCalled();
		await expectMissing(lockPath);
	});
});

function episodeLockPath(projectRoot: string): string {
	return join(projectRoot, ".cosmonauts", "episode-plan-example.lock");
}

async function writeEpisodicConfig(
	projectRoot: string,
	enabled: boolean,
): Promise<void> {
	await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
	await writeFile(
		join(projectRoot, ".cosmonauts", "config.json"),
		`${JSON.stringify({ episodicLog: { enabled } })}\n`,
		"utf-8",
	);
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

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
} {
	let resolvePromise: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}
