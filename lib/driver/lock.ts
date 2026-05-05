import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { LockHandle } from "./types.ts";

export type { LockHandle } from "./types.ts";

interface ActivePlanLock {
	error: "active";
	activeRunId: string;
	activeAt: string;
}

export interface LockWarning {
	type: "lock_warning";
	reason: string;
	details?: {
		previousRunId?: string;
		previousPid?: number;
	};
}

interface LockAcquireOptions {
	onLockWarning?: (warning: LockWarning) => void | Promise<void>;
	retryDelayMs?: number;
}

interface LockFileContent {
	runId: string;
	pid: number;
	startedAt: string;
}

const DEFAULT_RETRY_DELAY_MS = 50;

export function getPlanLockPath(
	planSlug: string,
	cosmonautsRoot: string,
): string {
	return join(cosmonautsRoot, "missions", "sessions", planSlug, "driver.lock");
}

export function getRepoCommitLockPath(repoRoot: string): string {
	return join(repoRoot, ".cosmonauts", "driver-commit.lock");
}

export async function acquirePlanLock(
	planSlug: string,
	runId: string,
	cosmonautsRoot: string,
	options: LockAcquireOptions = {},
): Promise<LockHandle | ActivePlanLock> {
	const lockPath = getPlanLockPath(planSlug, cosmonautsRoot);
	const content = createLockContent(runId);
	const firstAttempt = await tryCreateLock(lockPath, content);
	if (firstAttempt !== "exists") {
		return firstAttempt;
	}

	const existing = await readLockFile(lockPath);
	if (!existing) {
		const retry = await tryCreateLock(lockPath, content);
		return retry === "exists"
			? activePlanLock(await readLockFile(lockPath))
			: retry;
	}

	if (isProcessAlive(existing.pid)) {
		return activePlanLock(existing);
	}

	await breakStaleLock(lockPath, existing, options);
	const retry = await tryCreateLock(lockPath, content);
	return retry === "exists"
		? activePlanLock(await readLockFile(lockPath))
		: retry;
}

export async function acquireRepoCommitLock(
	repoRoot: string,
	options: LockAcquireOptions = {},
): Promise<LockHandle> {
	const lockPath = getRepoCommitLockPath(repoRoot);
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

	while (true) {
		const content = createLockContent("repo-commit");
		const attempt = await tryCreateLock(lockPath, content);
		if (attempt !== "exists") {
			return attempt;
		}

		const existing = await readLockFile(lockPath);
		if (!existing) {
			continue;
		}

		if (!isProcessAlive(existing.pid)) {
			await breakStaleLock(lockPath, existing, options);
			continue;
		}

		await delay(retryDelayMs);
	}
}

export function isProcessAlive(pid: number): boolean {
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

function createLockContent(runId: string): LockFileContent {
	return {
		runId,
		pid: process.pid,
		startedAt: new Date().toISOString(),
	};
}

async function tryCreateLock(
	lockPath: string,
	content: LockFileContent,
): Promise<LockHandle | "exists"> {
	await mkdir(dirname(lockPath), { recursive: true });

	const tempPath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
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
			runId: typeof parsed.runId === "string" ? parsed.runId : "unknown",
			pid: typeof parsed.pid === "number" ? parsed.pid : Number.NaN,
			startedAt:
				typeof parsed.startedAt === "string" ? parsed.startedAt : "unknown",
		};
	} catch {
		return { runId: "unknown", pid: Number.NaN, startedAt: "unknown" };
	}
}

function activePlanLock(existing: LockFileContent | undefined): ActivePlanLock {
	return {
		error: "active",
		activeRunId: existing?.runId ?? "unknown",
		activeAt: existing?.startedAt ?? "unknown",
	};
}

async function breakStaleLock(
	lockPath: string,
	existing: LockFileContent,
	options: LockAcquireOptions,
): Promise<void> {
	await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "ENOENT") {
			throw error;
		}
	});
	await options.onLockWarning?.({
		type: "lock_warning",
		reason: "stale lock removed",
		details: {
			previousRunId: existing.runId,
			previousPid: Number.isFinite(existing.pid) ? existing.pid : undefined,
		},
	});
}

function createHandle(lockPath: string, expected: LockFileContent): LockHandle {
	let released = false;

	return {
		async release(): Promise<void> {
			if (released) {
				return;
			}
			released = true;

			const existing = await readLockFile(lockPath);
			if (!existing || !sameLock(existing, expected)) {
				return;
			}

			await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") {
					throw error;
				}
			});
		},
	};
}

function sameLock(a: LockFileContent, b: LockFileContent): boolean {
	return a.runId === b.runId && a.pid === b.pid && a.startedAt === b.startedAt;
}
