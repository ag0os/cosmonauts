/**
 * Whether the processes a run owned are gone, checked when the run ends
 * and again when the next run finds them in the lock; and, best effort, the
 * processes the run could not own that still name its builder clone.
 */
import { realpath } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { ListProcesses, ProcessEntry } from "../process/process-tree.ts";
import type { DetachedProcess } from "./types.ts";

/** How long a run waits at its end for its owned processes to be gone. */
export const DEFAULT_CLEANUP_CONFIRM_MS = 30_000;
const POLL_MS = 100;
const COMMAND_CHARS = 200;

export interface ProcessCheckOptions {
	readonly list: ListProcesses;
	/** Test seam; Windows has no listing, so signal 0 alone decides there. */
	readonly platform?: NodeJS.Platform;
	/** Take a listing even when signal 0 already found every pid gone. */
	readonly listAlways?: boolean;
}

export interface ProcessCheck {
	/** The pids still running, ascending. */
	readonly running: number[];
	/** The listing the check took, when it took one that succeeded. */
	readonly listing?: readonly ProcessEntry[];
}

/**
 * One look. A pid is gone when signal 0 finds no such process, or when a
 * listing lacks it or shows it as a zombie. With no listing (Windows, or a
 * failed `ps`) a pid signal 0 still finds counts as running: unconfirmed is
 * the safe answer. A reused pid also counts as running.
 */
export async function runningPids(
	pids: readonly number[],
	options: ProcessCheckOptions,
): Promise<ProcessCheck> {
	const signalled = pids.filter(exists);
	if (signalled.length === 0 && !options.listAlways) return { running: [] };
	if ((options.platform ?? process.platform) === "win32")
		return { running: signalled };
	const listing = await options.list();
	if (listing instanceof Error) return { running: signalled };
	const live = new Set(
		listing.filter((entry) => !isZombie(entry)).map((entry) => entry.pid),
	);
	return { running: signalled.filter((pid) => live.has(pid)), listing };
}

/**
 * Looks until every pid is gone or `boundMs` has passed; no wait at all
 * when the first look finds them gone. The result's listing is the last one
 * taken.
 */
export async function confirmGone(
	pids: readonly number[],
	options: ProcessCheckOptions & { readonly boundMs: number },
): Promise<ProcessCheck> {
	const deadline = Date.now() + options.boundMs;
	let check = await runningPids(pids, options);
	while (check.running.length > 0 && Date.now() < deadline) {
		await delay(Math.min(POLL_MS, Math.max(deadline - Date.now(), 0)));
		const next = await runningPids(check.running, options);
		check = { running: next.running, listing: next.listing ?? check.listing };
	}
	return check;
}

/**
 * Running processes, other than this one and `owned`, whose command line
 * contains one of `paths`. A process that started in the clone without
 * naming it is not found: its working directory is not read, since no
 * portable lookup of it is cheap.
 */
export function detachedCandidates(
	listing: readonly ProcessEntry[],
	options: {
		readonly paths: readonly string[];
		readonly owned: readonly number[];
	},
): DetachedProcess[] {
	const owned = new Set(options.owned);
	return listing
		.filter(
			(entry) =>
				entry.pid !== process.pid &&
				!owned.has(entry.pid) &&
				!isZombie(entry) &&
				options.paths.some((path) => entry.command.includes(path)),
		)
		.map((entry) => ({
			pid: entry.pid,
			command: shorten(entry.command),
		}));
}

/** `path` and, when it differs, its real path: a command may name either. */
export async function pathSpellings(path: string): Promise<string[]> {
	const real = await realpath(path).catch(() => path);
	return real === path ? [path] : [path, real];
}

function exists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

function isZombie(entry: ProcessEntry): boolean {
	return entry.stat.startsWith("Z");
}

function shorten(command: string): string {
	return command.length > COMMAND_CHARS
		? `${command.slice(0, COMMAND_CHARS - 3)}...`
		: command;
}
