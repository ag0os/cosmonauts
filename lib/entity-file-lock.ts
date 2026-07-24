/**
 * Cross-process filesystem lock for serializing entity-file critical sections.
 *
 * Modeled on `lib/driver/lock.ts`: acquires an exclusive lock file via `link`,
 * detects stale locks left by dead processes via `process.kill(pid, 0)`, breaks
 * them, and retries.
 */

import { randomUUID } from "node:crypto";
import {
	link,
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_RETRY_DELAY_MS = 25;
const RELEASE_ATTEMPTS = 3;

export interface EntityFileLockOptions {
	/** Delay between attempts while a live process owns the lock. */
	readonly retryDelayMs?: number;
	/** Maximum total wait for a live owner. Omit to wait indefinitely. */
	readonly waitTimeoutMs?: number;
	/**
	 * Called when the lock could not be confirmed released after the action
	 * already ran. The action's result still stands (D-008); this only lets the
	 * caller skip follow-up work that assumes the lock is free.
	 */
	readonly onReleaseUnconfirmed?: (error: unknown) => void;
}

export class EntityFileLockTimeoutError extends Error {
	readonly lockPath: string;
	readonly waitTimeoutMs: number;

	constructor(lockPath: string, waitTimeoutMs: number) {
		super(
			`Timed out after ${waitTimeoutMs}ms waiting for entity lock ${lockPath}.`,
		);
		this.name = "EntityFileLockTimeoutError";
		this.lockPath = lockPath;
		this.waitTimeoutMs = waitTimeoutMs;
	}
}

interface LockFileContent {
	pid: number;
	uuid: string;
	startedAt: string;
}

interface LockHandle {
	release(): Promise<void>;
}

/** Run `fn` while holding the entity lock at `lockPath`. */
export async function withEntityFileLock<T>(
	lockPath: string,
	fn: () => Promise<T>,
	options: EntityFileLockOptions = {},
): Promise<T> {
	const handle = await acquireEntityFileLock(lockPath, options);
	try {
		return await fn();
	} finally {
		await releaseWithRetry(handle, options);
	}
}

async function acquireEntityFileLock(
	lockPath: string,
	options: EntityFileLockOptions,
): Promise<LockHandle> {
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	const waitTimeoutMs = options.waitTimeoutMs;
	const waitStartedAt = Date.now();

	while (true) {
		const content = createLockContent();
		const attempt = await tryCreateLock(lockPath, content);
		if (attempt !== "exists") {
			return attempt;
		}

		const existing = await readLockFile(lockPath);
		if (!existing) {
			continue;
		}

		if (!isProcessAlive(existing.pid)) {
			await removeLockIfOwner(lockPath, existing);
			continue;
		}

		const nextDelayMs = getNextDelayMs({
			lockPath,
			retryDelayMs,
			waitStartedAt,
			waitTimeoutMs,
		});
		await delay(nextDelayMs);
	}
}

function getNextDelayMs(options: {
	readonly lockPath: string;
	readonly retryDelayMs: number;
	readonly waitStartedAt: number;
	readonly waitTimeoutMs: number | undefined;
}): number {
	if (options.waitTimeoutMs === undefined) {
		return options.retryDelayMs;
	}

	const remainingMs =
		options.waitTimeoutMs - (Date.now() - options.waitStartedAt);
	if (remainingMs <= 0) {
		throw new EntityFileLockTimeoutError(
			options.lockPath,
			options.waitTimeoutMs,
		);
	}
	return Math.min(options.retryDelayMs, remainingMs);
}

function createLockContent(): LockFileContent {
	return {
		pid: process.pid,
		uuid: randomUUID(),
		startedAt: new Date().toISOString(),
	};
}

async function tryCreateLock(
	lockPath: string,
	content: LockFileContent,
): Promise<LockHandle | "exists"> {
	await mkdir(dirname(lockPath), { recursive: true });

	const tempPath = `${lockPath}.${process.pid}.${content.uuid}.tmp`;
	try {
		await writeFile(tempPath, `${JSON.stringify(content)}\n`, {
			encoding: "utf-8",
			mode: 0o600,
		});
		await link(tempPath, lockPath);
		await unlink(tempPath).catch(() => undefined);
		return createHandle(lockPath, content);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			return "exists";
		}
		throw error;
	}
}

async function readLockFile(
	lockPath: string,
): Promise<LockFileContent | undefined> {
	try {
		const raw = await readFile(lockPath, "utf-8");
		return parseLockContent(raw);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function parseLockContent(raw: string): LockFileContent {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			pid: typeof parsed.pid === "number" ? parsed.pid : Number.NaN,
			uuid: typeof parsed.uuid === "string" ? parsed.uuid : "unknown",
			startedAt:
				typeof parsed.startedAt === "string" ? parsed.startedAt : "unknown",
		};
	} catch {
		return { pid: Number.NaN, uuid: "unknown", startedAt: "unknown" };
	}
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

/**
 * Reclaim a stale lock, bound to the exact owner that was inspected.
 *
 * `rename` moves the directory entry atomically, so exactly one contender can
 * claim a given lock file: a second contender that inspected the same stale
 * owner gets `ENOENT` and falls back to normal acquisition instead of removing
 * the winner's replacement lock. If the claimed content is not the owner we
 * inspected, a live owner took the slot in the window — put it straight back.
 */
async function removeLockIfOwner(
	lockPath: string,
	expected: LockFileContent,
): Promise<void> {
	if (!(await stillOwnedBy(lockPath, expected))) {
		return;
	}

	const removalPath = createRemovalPath(lockPath);
	try {
		await rename(lockPath, removalPath);
	} catch (error) {
		// Another contender already claimed this lock file; retry acquisition.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}

	try {
		const claimed = await readLockFile(removalPath);
		if (claimed && !sameLock(claimed, expected)) {
			await restoreClaimedLock(removalPath, lockPath);
		}
	} finally {
		await unlink(removalPath).catch(() => undefined);
	}
}

/**
 * Non-destructive re-check that `lockPath` still holds the owner we inspected.
 *
 * The `rename` claim below is destructive: it empties the slot before we can
 * see what we took. If a live owner replaced the stale lock in the meantime,
 * restoring it resurrects a lock whose owner may have already released while
 * the slot was empty — stranding a live-PID lock that stale recovery will never
 * reclaim, which blocks callers that wait without a timeout
 * (`withTaskCreateLock`). That is *below* `main`'s floor, so it must not be the
 * common path. Verifying through a private hard link first leaves the slot
 * untouched on the realistic mismatch, so no claim and no restore happen at all.
 */
async function stillOwnedBy(
	lockPath: string,
	expected: LockFileContent,
): Promise<boolean> {
	const verifyPath = createRemovalPath(lockPath);
	try {
		await link(lockPath, verifyPath);
	} catch {
		// Gone or unlinkable: fall through to acquisition rather than guess.
		return false;
	}

	try {
		const current = await readLockFile(verifyPath);
		return current !== undefined && sameLock(current, expected);
	} finally {
		await unlink(verifyPath).catch(() => undefined);
	}
}

/**
 * Return a lock we claimed but do not own. `link` fails with `EEXIST` rather
 * than clobbering, so an owner that took the slot meanwhile keeps it. Best
 * effort by design: restoring must never fail acquisition.
 */
async function restoreClaimedLock(
	removalPath: string,
	lockPath: string,
): Promise<void> {
	await link(removalPath, lockPath).catch(() => undefined);
}

/**
 * Removal temps are unique per attempt and keep the `.lock` suffix: a crashed
 * remover can neither strand a fixed name that blocks every future reclaimer
 * nor leave a file outside the single-level `.cosmonauts/*.lock` ignore glob.
 */
function createRemovalPath(lockPath: string): string {
	return `${lockPath}.${process.pid}.${randomUUID()}.removing.lock`;
}

/**
 * Release the lock we own, retrying a transient failure. D-008: the action has
 * already run, so a lock we cannot release must never fail the caller. When
 * release stays unconfirmed the caller is told instead, so follow-up work that
 * assumes the lock is free can be skipped.
 */
async function releaseWithRetry(
	handle: LockHandle,
	options: EntityFileLockOptions,
): Promise<void> {
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	let lastError: unknown;

	for (let attempt = 1; attempt <= RELEASE_ATTEMPTS; attempt += 1) {
		try {
			await handle.release();
			return;
		} catch (error) {
			lastError = error;
			if (attempt < RELEASE_ATTEMPTS) {
				await delay(retryDelayMs);
			}
		}
	}

	try {
		options.onReleaseUnconfirmed?.(lastError);
	} catch {
		// Release reporting is never load-bearing for the primary action.
	}
}

function createHandle(lockPath: string, expected: LockFileContent): LockHandle {
	let released = false;

	return {
		async release(): Promise<void> {
			if (released) {
				return;
			}

			const existing = await readLockFile(lockPath);
			if (!existing || !sameLock(existing, expected)) {
				released = true;
				return;
			}

			await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") {
					throw error;
				}
			});
			released = true;
		},
	};
}

function sameLock(a: LockFileContent, b: LockFileContent): boolean {
	return (
		samePid(a.pid, b.pid) && a.uuid === b.uuid && a.startedAt === b.startedAt
	);
}

/**
 * An unreadable lock file parses to a `NaN` PID sentinel. Two reads of one
 * corrupt file must compare equal (`NaN !== NaN`) so it stays reclaimable.
 */
function samePid(a: number, b: number): boolean {
	if (Number.isNaN(a) && Number.isNaN(b)) {
		return true;
	}
	return a === b;
}
