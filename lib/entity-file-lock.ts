/**
 * Cross-process filesystem lock for serializing entity-file critical sections.
 *
 * Modeled on `lib/driver/lock.ts`: acquires an exclusive lock file via `link`,
 * detects stale locks left by dead processes via `process.kill(pid, 0)`, breaks
 * them, and retries.
 */

import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_RETRY_DELAY_MS = 25;

export interface EntityFileLockOptions {
	/** Delay between attempts while a live process owns the lock. */
	readonly retryDelayMs?: number;
	/** Maximum total wait for a live owner. Omit to wait indefinitely. */
	readonly waitTimeoutMs?: number;
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
		await handle.release();
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
			await breakStaleLock(lockPath);
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

async function breakStaleLock(lockPath: string): Promise<void> {
	await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "ENOENT") {
			throw error;
		}
	});
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
	return a.pid === b.pid && a.uuid === b.uuid && a.startedAt === b.startedAt;
}
