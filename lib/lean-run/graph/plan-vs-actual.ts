import { requestPaths } from "../plan.ts";
import type { ParsedPlan } from "../types.ts";
import {
	isGlob,
	matchesGlob,
	normalizeRepoPath,
	normalizeRepoPaths,
} from "./paths.ts";

export interface PlanVersusActualOptions {
	readonly plan: Pick<ParsedPlan, "touches"> &
		Partial<Pick<ParsedPlan, "approach" | "reuses">>;
	/** The builder envelope's `touched`. */
	readonly touched: readonly string[];
	/** `git diff --name-only` against the base. */
	readonly diffFiles: readonly string[];
}

export interface PlanVersusActual {
	/** Changed files that a `Touches` entry covers or the `Approach` names. */
	readonly planned: string[];
	/** Every other changed file: reviewer input, not a failure. */
	readonly unplanned: string[];
	/** `Touches` entries that no changed file falls under. */
	readonly untouched: string[];
}

/**
 * Compares the plan with what actually changed: the union of the envelope's
 * `touched` and the diff. A `Touches` entry covers a file when it names the
 * file or a directory above it, or is a glob (`*`, `**`, `?`) the file matches.
 * A file the `Approach` names, by `requestPaths`' rule, is planned too unless
 * a `Reuses` entry covers it; prose names one exact file, and is no promise,
 * so it never enters `untouched`.
 */
export function planVersusActual(
	options: PlanVersusActualOptions,
): PlanVersusActual {
	const entries = normalizeRepoPaths(options.plan.touches.map(touchesPath));
	const reuses = normalizeRepoPaths(
		(options.plan.reuses ?? []).map(touchesPath),
	);
	const named = normalizeRepoPaths(
		requestPaths(options.plan.approach ?? ""),
	).filter((path) => !isCovered(path, reuses));
	const actual = normalizeRepoPaths([...options.touched, ...options.diffFiles]);
	const isPlanned = (file: string) =>
		isCovered(file, entries) || named.includes(file);
	return {
		planned: actual.filter(isPlanned),
		unplanned: actual.filter((file) => !isPlanned(file)),
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
