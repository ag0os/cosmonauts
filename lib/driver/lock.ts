import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { attemptFileLock, isProcessAlive } from "../fs/lock-file.ts";
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
	const firstAttempt = await attemptLock(lockPath, content);
	if (firstAttempt.status === "acquired") return firstAttempt.handle;
	if (firstAttempt.status === "vacant") {
		return planLockRetry(lockPath, content);
	}
	if (isProcessAlive(firstAttempt.owner.pid)) {
		return activePlanLock(firstAttempt.owner);
	}

	await breakStaleLock(lockPath, firstAttempt.owner, options);
	return planLockRetry(lockPath, content);
}

export async function acquireRepoCommitLock(
	repoRoot: string,
	options: LockAcquireOptions = {},
): Promise<LockHandle> {
	const lockPath = getRepoCommitLockPath(repoRoot);
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

	while (true) {
		const content = createLockContent("repo-commit");
		const attempt = await attemptLock(lockPath, content);
		if (attempt.status === "acquired") return attempt.handle;
		if (attempt.status === "vacant") continue;

		if (!isProcessAlive(attempt.owner.pid)) {
			await breakStaleLock(lockPath, attempt.owner, options);
			continue;
		}

		await delay(retryDelayMs);
	}
}

export { isProcessAlive } from "../fs/lock-file.ts";

function createLockContent(runId: string): LockFileContent {
	return {
		runId,
		pid: process.pid,
		startedAt: new Date().toISOString(),
	};
}

function attemptLock(lockPath: string, content: LockFileContent) {
	return attemptFileLock({
		lockPath,
		content,
		tempPath: `${lockPath}.${process.pid}.${randomUUID()}.tmp`,
		parse: parseLockContent,
		sameOwner: sameLock,
	});
}

async function planLockRetry(
	lockPath: string,
	content: LockFileContent,
): Promise<LockHandle | ActivePlanLock> {
	const retry = await attemptLock(lockPath, content);
	return retry.status === "acquired"
		? retry.handle
		: activePlanLock(retry.status === "occupied" ? retry.owner : undefined);
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

function sameLock(a: LockFileContent, b: LockFileContent): boolean {
	return a.runId === b.runId && a.pid === b.pid && a.startedAt === b.startedAt;
}
