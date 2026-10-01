import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runStatePath } from "./base-sha.ts";

/** Beside the base-sha marker, in the worktree's own git dir. */
const LOG_PATH = join("lean-run", "health-hook.jsonl");

/** One finding the post-edit health hook injected into a builder's tool result. */
export interface HealthHookEntry {
	readonly timestamp: string;
	readonly file: string;
	readonly function: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly metrics: {
		readonly cyclomatic: number;
		readonly cognitive: number;
		readonly crap: number | null;
	};
	readonly baseMetrics: {
		readonly cyclomatic: number;
		readonly cognitive: number;
		readonly crap: number | null;
	} | null;
	/** The commit the hook compared against. */
	readonly base: string;
}

/**
 * Appends one line per entry. The hook runs inside the builder's session,
 * which keeps nothing the host can read, so this file is how the host sees
 * what the hook said (brief 4.7A).
 */
export async function appendHealthHookEntries(options: {
	readonly worktree: string;
	readonly entries: readonly HealthHookEntry[];
}): Promise<void> {
	if (options.entries.length === 0) return;
	const path = await runStatePath(options.worktree, LOG_PATH);
	await mkdir(dirname(path), { recursive: true });
	const lines = options.entries.map((entry) => `${JSON.stringify(entry)}\n`);
	await appendFile(path, lines.join(""));
}

/**
 * Removes the log and returns what it held; empty when there was none.
 * The runner calls it after each builder stage, and before one to drop
 * anything an earlier run left behind.
 */
export async function takeHealthHookLog(options: {
	readonly worktree: string;
}): Promise<string> {
	const path = await runStatePath(options.worktree, LOG_PATH);
	const text = await readFile(path, "utf8").catch((error: unknown) => {
		if (isMissingFile(error)) return "";
		throw error;
	});
	await rm(path, { force: true });
	return text;
}

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
