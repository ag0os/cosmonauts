import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runStatePath } from "./base-sha.ts";

/** Beside the base-sha marker, in the worktree's own git dir. */
const LOCK_PATH = join("lean-run", "lock");

interface LockHolder {
	runId: string;
	pid: number;
	createdAt: string;
}

type RunLockResult =
	| { acquired: true; release(): Promise<void> }
	| { acquired: false; holder: string };

/**
 * One lean run per worktree: two runs would share the base-sha marker and mix
 * their diffs. A lock whose process is gone is reclaimed; `release` removes
 * the lock only while it is still this run's.
 */
export async function acquireRunLock(options: {
	worktree: string;
	runId: string;
}): Promise<RunLockResult> {
	const path = await runStatePath(options.worktree, LOCK_PATH);
	await mkdir(dirname(path), { recursive: true });
	const holder: LockHolder = {
		runId: options.runId,
		pid: process.pid,
		createdAt: new Date().toISOString(),
	};
	for (let attempt = 0; attempt < 2; attempt++) {
		if (await createLock(path, holder))
			return {
				acquired: true,
				release: () => releaseLock(path, options.runId),
			};
		const current = await readHolder(path);
		if (current && isAlive(current.pid))
			return { acquired: false, holder: current.runId };
		await rm(path, { force: true });
	}
	const current = await readHolder(path);
	return { acquired: false, holder: current?.runId ?? "unknown" };
}

async function createLock(path: string, holder: LockHolder): Promise<boolean> {
	try {
		await writeFile(path, `${JSON.stringify(holder)}\n`, { flag: "wx" });
		return true;
	} catch (error) {
		if (errorCode(error) === "EEXIST") return false;
		throw error;
	}
}

/** Undefined for a missing or unreadable lock, which counts as stale. */
async function readHolder(path: string): Promise<LockHolder | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		return isHolder(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

async function releaseLock(path: string, runId: string): Promise<void> {
	const current = await readHolder(path);
	if (current?.runId === runId) await rm(path, { force: true });
}

function isHolder(value: unknown): value is LockHolder {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.runId === "string" &&
		Number.isInteger(record.pid) &&
		(record.pid as number) > 0
	);
}

/** Signal 0 checks existence; EPERM means the process exists under another user. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) === "EPERM";
	}
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error
		? error.code
		: undefined;
}
