import type { ParsedPlan } from "../types.ts";
import {
	isGlob,
	matchesGlob,
	normalizeRepoPath,
	normalizeRepoPaths,
} from "./paths.ts";

export interface PlanVersusActualOptions {
	readonly plan: Pick<ParsedPlan, "touches">;
	/** The builder envelope's `touched`. */
	readonly touched: readonly string[];
	/** `git diff --name-only` against the base. */
	readonly diffFiles: readonly string[];
}

export interface PlanVersusActual {
	/** Changed files that a `Touches` entry covers. */
	readonly planned: string[];
	/** Changed files no `Touches` entry covers: reviewer input, not a failure. */
	readonly unplanned: string[];
	/** `Touches` entries that no changed file falls under. */
	readonly untouched: string[];
}

/**
 * Compares the plan's `Touches` with what actually changed: the union of the
 * envelope's `touched` and the diff. An entry covers a file when it names the
 * file or a directory above it, or is a glob (`*`, `**`, `?`) the file matches.
 */
export function planVersusActual(
	options: PlanVersusActualOptions,
): PlanVersusActual {
	const entries = normalizeRepoPaths(options.plan.touches.map(touchesPath));
	const actual = normalizeRepoPaths([...options.touched, ...options.diffFiles]);
	const planned = actual.filter((file) => isCovered(file, entries));
	return {
		planned,
		unplanned: actual.filter((file) => !isCovered(file, entries)),
		untouched: entries.filter(
			(entry) => !actual.some((file) => covers(entry, file)),
		),
	};
}

/**
 * The path in one `Touches` line. Entries carry a reason ("`lib/x.ts` — why")
 * and may be list items, so a list marker is dropped, a backticked span wins,
 * and otherwise the first word, minus trailing punctuation.
 */
export function touchesPath(entry: string): string {
	const quoted = /`([^`]+)`/.exec(entry);
	if (quoted) return normalizeRepoPath(quoted[1] as string);
	const item = entry.trim().replace(LIST_MARKER, "");
	const firstWord = item.split(/\s+/)[0] ?? "";
	return normalizeRepoPath(firstWord.replace(/[:,;]+$/, ""));
}

const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;

function isCovered(file: string, entries: readonly string[]): boolean {
	return entries.some((entry) => covers(entry, file));
}

function covers(entry: string, file: string): boolean {
	if (isGlob(entry)) return matchesGlob(entry, file);
	return file === entry || file.startsWith(`${entry}/`);
}
