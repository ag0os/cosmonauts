import { randomUUID } from "node:crypto";
import {
	link,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runStatePath } from "./base-sha.ts";

/** Beside the base-sha marker, in the worktree's own git dir. */
const LOCK_PATH = join("lean-run", "lock");

/**
 * An unreadable lock, or a reclaim claim, younger than this belongs to a
 * starter that may still be alive; older, it is abandoned.
 */
const ABANDONED_AFTER_MS = 5_000;

/** Bounds the retries while another starter reclaims or replaces the lock. */
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 10;

interface LockHolder {
	runId: string;
	pid: number;
	createdAt: string;
	/**
	 * The run has ended but could not confirm that every process it owned is
	 * gone; `unconfirmedPids` lists those. Only `clearUnconfirmedLock` removes
	 * such a lock, never the stale-holder reclaim.
	 */
	state?: "unconfirmed";
	unconfirmedPids?: number[];
}

/** What a starter saw at the lock path: its exact bytes, and the holder when they parse. */
interface SeenLock {
	raw: string;
	holder?: LockHolder;
	ageMs: number;
}

type RunLockResult =
	| {
			acquired: true;
			/**
			 * Removes the lock; with pids, rewrites it as `unconfirmed` with
			 * them instead, so the next run sees them.
			 */
			release(unconfirmedPids?: readonly number[]): Promise<void>;
	  }
	| {
			acquired: false;
			holder: string;
			/** Set when the holder ended with these processes unconfirmed. */
			unconfirmedPids?: number[];
	  };

/**
 * One lean run per worktree: two runs would share the base-sha marker and mix
 * their diffs. The lock is created with its content in one step (a temp file
 * hard-linked onto the lock path, or an exclusive create where hard links are
 * not supported), so it is never seen half-written by a linking starter. A lock
 * whose process is gone, or one that has been unreadable for a while, is
 * reclaimed under a claim file that only one starter holds at a time; the
 * claimant removes the lock only when it still holds the bytes it judged
 * stale. `release` removes the lock only while it is still this run's. A
 * lock released with unconfirmed pids is never stale: it stays until
 * `clearUnconfirmedLock` removes it.
 *
 * Accepted gap: a reclaimer that dies holding the claim leaves it for
 * `ABANDONED_AFTER_MS`; two starters that judge it abandoned in the same
 * instant could then both reclaim.
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
	let last: SeenLock | undefined;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (await createLock(path, holder))
			return {
				acquired: true,
				release: (pids) => releaseLock(path, options.runId, pids),
			};
		last = await readLock(path);
		if (!last) continue;
		if (!isStale(last)) return lockedOut(last);
		if (!(await reclaim(path, last))) await delay(RETRY_DELAY_MS);
	}
	return last ? lockedOut(last) : { acquired: false, holder: "unknown" };
}

function lockedOut(seen: SeenLock): RunLockResult {
	const holder = seen.holder?.runId ?? "unknown";
	if (seen.holder?.state !== "unconfirmed") return { acquired: false, holder };
	const pids = seen.holder.unconfirmedPids ?? [];
	return { acquired: false, holder, unconfirmedPids: [...pids] };
}

/**
 * Removes the `unconfirmed` lock `runId` left, for a starter that found its
 * processes gone or was told to clear it. Resolves false when the lock is
 * not that run's unconfirmed lock any more, or another starter is reclaiming it.
 */
export async function clearUnconfirmedLock(options: {
	worktree: string;
	runId: string;
}): Promise<boolean> {
	const path = await runStatePath(options.worktree, LOCK_PATH);
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const seen = await readLock(path);
		const holder = seen?.holder;
		if (!seen || holder?.state !== "unconfirmed") return false;
		if (holder.runId !== options.runId) return false;
		if (await reclaim(path, seen)) return true;
		await delay(RETRY_DELAY_MS);
	}
	return false;
}

function createLock(path: string, holder: LockHolder): Promise<boolean> {
	return createExclusive(path, `${JSON.stringify(holder)}\n`);
}

/** `link()` errors from file systems without hard links (exFAT, some network mounts). */
const NO_HARD_LINKS: ReadonlySet<unknown> = new Set([
	"ENOTSUP",
	"EPERM",
	"ENOSYS",
	"EXDEV",
]);

/**
 * Writes `content` to a temp file and links it onto `path`: content and
 * creation in one step. Where the file system has no hard links, the file is
 * created exclusively and written in one call; a reader can then see it
 * briefly empty, which the lock treats as a young unreadable lock.
 */
async function createExclusive(
	path: string,
	content: string,
): Promise<boolean> {
	const temp = `${path}.${randomUUID()}.tmp`;
	await writeFile(temp, content);
	try {
		await link(temp, path);
		return true;
	} catch (error) {
		if (errorCode(error) === "EEXIST") return false;
		if (NO_HARD_LINKS.has(errorCode(error)))
			return createWithoutLink(path, content);
		throw error;
	} finally {
		await rm(temp, { force: true });
	}
}

async function createWithoutLink(
	path: string,
	content: string,
): Promise<boolean> {
	try {
		await writeFile(path, content, { flag: "wx" });
		return true;
	} catch (error) {
		if (errorCode(error) === "EEXIST") return false;
		throw error;
	}
}

function isStale(seen: SeenLock): boolean {
	if (seen.holder?.state === "unconfirmed") return false;
	if (seen.holder) return !isAlive(seen.holder.pid);
	return seen.ageMs >= ABANDONED_AFTER_MS;
}

/**
 * Removes the stale lock `seen` unless another starter got there first.
 * Resolves true when this starter removed it, false when it should wait and
 * look again.
 */
async function reclaim(path: string, seen: SeenLock): Promise<boolean> {
	const claim = `${path}.reclaim`;
	const token = `${randomUUID()}\n`;
	if (!(await createExclusive(claim, token))) {
		if ((await ageMs(claim)) >= ABANDONED_AFTER_MS)
			await rm(claim, { force: true });
		return false;
	}
	try {
		// Only the claimant removes a stale lock, and none can be created while
		// one exists, so the lock cannot change between this read and the unlink.
		const current = await readLock(path);
		if (current?.raw !== seen.raw) return false;
		await unlink(path).catch(ignoreMissing);
		return true;
	} finally {
		const held = await readFile(claim, "utf8").catch(() => undefined);
		if (held === token) await rm(claim, { force: true });
	}
}

/** Undefined when the lock is missing. */
async function readLock(path: string): Promise<SeenLock | undefined> {
	try {
		const raw = await readFile(path, "utf8");
		const age = await ageMs(path);
		return { raw, ageMs: age, ...parseHolder(raw) };
	} catch (error) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

/** An unconfirmed holder keeps only the pids that are valid. */
function parseHolder(raw: string): { holder?: LockHolder } {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isHolder(parsed)) return {};
		if (parsed.state !== "unconfirmed") return { holder: parsed };
		const listed: unknown = parsed.unconfirmedPids;
		const pids = Array.isArray(listed) ? listed.filter(isPid) : [];
		return { holder: { ...parsed, unconfirmedPids: pids } };
	} catch {
		return {};
	}
}

/** Since the file was written; a missing file is infinitely old. */
async function ageMs(path: string): Promise<number> {
	try {
		return Date.now() - (await stat(path)).mtimeMs;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return Number.POSITIVE_INFINITY;
		throw error;
	}
}

/**
 * Only while the lock is still this run's. Unconfirmed pids replace it in
 * one rename, so a starter never sees the lock missing in between.
 */
async function releaseLock(
	path: string,
	runId: string,
	unconfirmedPids: readonly number[] = [],
): Promise<void> {
	const current = await readLock(path).catch(() => undefined);
	const holder = current?.holder;
	if (holder?.runId !== runId) return;
	if (unconfirmedPids.length === 0) return rm(path, { force: true });
	const unconfirmed: LockHolder = {
		runId: holder.runId,
		pid: holder.pid,
		createdAt: holder.createdAt,
		state: "unconfirmed",
		unconfirmedPids: [...unconfirmedPids],
	};
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temp, `${JSON.stringify(unconfirmed)}\n`);
		await rename(temp, path);
	} finally {
		await rm(temp, { force: true });
	}
}

function isHolder(value: unknown): value is LockHolder {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.runId === "string" &&
		isPid(record.pid) &&
		(record.state === undefined || record.state === "unconfirmed")
	);
}

function isPid(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0;
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

function ignoreMissing(error: unknown): void {
	if (errorCode(error) !== "ENOENT") throw error;
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error
		? error.code
		: undefined;
}
