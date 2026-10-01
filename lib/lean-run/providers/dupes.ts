/**
 * Duplicate-code signal (brief 4.7B.2): Fallow's clone groups that involve a
 * changed file, compared with the committed duplication floor
 * `.fallow-baselines/dupes.json` at the run's base revision. Always `info`:
 * duplication informs the reviewer and never re-enters the builder (ruling
 * D-4). A missing Fallow, a missing floor, or unreadable output is reported
 * as `data.unavailable`, never thrown.
 */

import { isAbsolute, relative, resolve } from "node:path";
import {
	type ProviderProcessExecutor,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import { resolveFallowExecutable } from "../../code-health/fallow-function-metrics.ts";
import { unavailableData } from "../signal-availability.ts";
import type { Signal, SignalContext, SignalProvider } from "../types.ts";

const DUPES_BASELINE_PATH = ".fallow-baselines/dupes.json";
/** The invocation `refresh:fallow-baselines` saves the floor from. */
const DUPES_ARGS = ["dupes", "--format", "json", "--quiet", "--no-cache"];
const DEFAULT_TIMEOUT_MS = 120_000;
const LOCATION_PATTERN = /^(.+):(\d+)-(\d+)$/;

interface DupesProviderOptions {
	/** Fallow executable; defaults to Cosmonauts' own pinned install. */
	readonly fallowExecutable?: string;
	readonly runProcess?: ProviderProcessExecutor;
	/** Cap for each process; the run's time budget caps it further. */
	readonly timeoutMs?: number;
}

interface DuplicateInstance {
	readonly file: string;
	readonly startLine: number;
	readonly endLine: number;
}

interface DuplicateGroup {
	/** `file:start-end` for each instance, in Fallow's order. */
	readonly locations: readonly string[];
	readonly instances: readonly DuplicateInstance[];
	readonly lineCount?: number;
}

export interface DupesData {
	/** `<base>:.fallow-baselines/dupes.json`. */
	readonly floor: string;
	readonly floorGroups: number;
	/** Groups touching a changed file that the floor does not hold. */
	readonly newGroups: readonly DuplicateGroup[];
	/** Groups touching a changed file that the floor already holds. */
	readonly baselinedGroups: readonly DuplicateGroup[];
}

interface ProcessRun {
	readonly ctx: SignalContext;
	readonly runProcess: ProviderProcessExecutor;
	readonly timeoutMs: number;
}

export function createDupesProvider(
	options: DupesProviderOptions = {},
): SignalProvider {
	const runProcess = options.runProcess ?? runProviderProcess;
	return {
		kind: "dupes",
		async run(ctx: SignalContext): Promise<Signal> {
			if (ctx.changedFiles.length === 0) {
				return dupesSignal("no changed files to check for duplication", {
					newGroups: [],
					baselinedGroups: [],
				});
			}
			const run = {
				ctx,
				runProcess,
				timeoutMs: effectiveTimeout(options.timeoutMs, ctx.budget.timeMs),
			};
			try {
				return toSignal(await compareWithFloor(run, options.fallowExecutable));
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return dupesSignal(
					`dupes unavailable: ${reason}`,
					unavailableData(reason),
				);
			}
		},
	};
}

async function compareWithFloor(
	run: ProcessRun,
	fallowExecutable: string | undefined,
): Promise<DupesData> {
	const { worktree, changedFiles, baseSha } = run.ctx;
	const floor = await readFloor(run);
	const executable = await resolveFallowExecutable(fallowExecutable);
	const current = await runFallowDupes(run, executable);
	const changed = new Set(
		changedFiles.map((file) => normalizePath(worktree, file)),
	);
	const touching = current
		.map((group) => normalizeGroup(worktree, group))
		.filter((group) => group.instances.some((it) => changed.has(it.file)));
	const { matched, unmatched } = partitionByFloor(touching, floor);
	return {
		floor: floorSource(baseSha),
		floorGroups: floor.length,
		newGroups: unmatched,
		baselinedGroups: matched,
	};
}

function toSignal(data: DupesData): Signal {
	const fresh = data.newGroups.length;
	const held = data.baselinedGroups.length;
	return dupesSignal(
		`${fresh} new duplicate groups involve changed files (${held} already in the floor of ${data.floorGroups})`,
		data,
	);
}

function dupesSignal(summary: string, data: unknown): Signal {
	return { kind: "dupes", status: "info", summary, data, reenter: false };
}

function effectiveTimeout(
	optionMs: number | undefined,
	budgetMs: number,
): number {
	const cap = optionMs ?? DEFAULT_TIMEOUT_MS;
	return budgetMs > 0 ? Math.min(cap, budgetMs) : cap;
}

function floorSource(baseSha: string): string {
	return `${baseSha}:${DUPES_BASELINE_PATH}`;
}

/**
 * The floor as committed at the run's base, so an edit the builder makes to
 * the floor file cannot absorb the duplicates it introduced.
 */
async function readFloor(run: ProcessRun): Promise<DuplicateGroup[]> {
	const source = floorSource(run.ctx.baseSha);
	const outcome = await runIn(run, "git", ["show", source]);
	if (outcome.kind !== "code-exit" || outcome.code !== 0) {
		throw new Error(
			`no committed duplication floor at ${source} (${describeOutcome(outcome)})`,
		);
	}
	return parseFloor(outcome.stdout, source);
}

/** Fallow's own baseline format: `{ "clone_groups": ["a.ts:1-9|b.ts:4-12"] }`. */
function parseFloor(text: string, source: string): DuplicateGroup[] {
	const parsed = parseJson(text, `${source} is not JSON`);
	if (!isRecord(parsed) || !Array.isArray(parsed.clone_groups)) {
		throw new Error(`${source} has no clone_groups array`);
	}
	return parsed.clone_groups.map((entry, index) => {
		const group = typeof entry === "string" ? parseFloorKey(entry) : undefined;
		if (group === undefined) {
			throw new Error(
				`${source} clone_groups[${index}] is not a file:start-end key`,
			);
		}
		return group;
	});
}

function parseFloorKey(key: string): DuplicateGroup | undefined {
	const instances: DuplicateInstance[] = [];
	for (const location of key.split("|")) {
		const match = LOCATION_PATTERN.exec(location);
		if (match?.[1] === undefined) return undefined;
		instances.push({
			file: match[1],
			startLine: Number(match[2]),
			endLine: Number(match[3]),
		});
	}
	return toGroup(instances);
}

async function runFallowDupes(
	run: ProcessRun,
	executable: string,
): Promise<DuplicateGroup[]> {
	const outcome = await runIn(run, executable, DUPES_ARGS);
	if (outcome.kind !== "code-exit" || outcome.code > 1) {
		throw new Error(`fallow dupes failed (${describeOutcome(outcome)})`);
	}
	return parseFallowDupes(outcome.stdout);
}

/** Clone groups from `fallow dupes --format json` (schema 4, Fallow 2.54.2). */
function parseFallowDupes(stdout: string): DuplicateGroup[] {
	const parsed = parseJson(stdout, "fallow dupes did not print JSON");
	if (!isRecord(parsed) || !Array.isArray(parsed.clone_groups)) {
		throw new Error("fallow dupes JSON has no clone_groups array");
	}
	return parsed.clone_groups.map((value, index) => {
		const raw = isRecord(value) ? value.instances : undefined;
		const instances = Array.isArray(raw) ? raw.map(toInstance) : [];
		if (instances.length === 0 || !instances.every(isInstance)) {
			throw new Error(
				`fallow dupes clone_groups[${index}] has an unexpected shape`,
			);
		}
		const lineCount = isRecord(value) ? value.line_count : undefined;
		return toGroup(
			instances,
			typeof lineCount === "number" ? lineCount : undefined,
		);
	});
}

function toInstance(value: unknown): DuplicateInstance | undefined {
	if (
		!isRecord(value) ||
		typeof value.file !== "string" ||
		typeof value.start_line !== "number" ||
		typeof value.end_line !== "number"
	) {
		return undefined;
	}
	return {
		file: value.file,
		startLine: value.start_line,
		endLine: value.end_line,
	};
}

function isInstance(
	value: DuplicateInstance | undefined,
): value is DuplicateInstance {
	return value !== undefined;
}

function toGroup(
	instances: readonly DuplicateInstance[],
	lineCount?: number,
): DuplicateGroup {
	return {
		locations: instances.map(
			(it) => `${it.file}:${it.startLine}-${it.endLine}`,
		),
		instances,
		...(lineCount === undefined ? {} : { lineCount }),
	};
}

function normalizeGroup(
	worktree: string,
	group: DuplicateGroup,
): DuplicateGroup {
	const instances = group.instances.map((it) => ({
		...it,
		file: normalizePath(worktree, it.file),
	}));
	return toGroup(instances, group.lineCount);
}

function normalizePath(worktree: string, file: string): string {
	const path = isAbsolute(file) ? relative(worktree, resolve(file)) : file;
	return path.replaceAll("\\", "/");
}

/**
 * A group is in the floor when a floor entry has its exact locations, or,
 * because an edit above a clone moves it, the same files with the same
 * instance lengths. Each floor entry absorbs at most one current group.
 */
function partitionByFloor(
	groups: readonly DuplicateGroup[],
	floor: readonly DuplicateGroup[],
): { matched: DuplicateGroup[]; unmatched: DuplicateGroup[] } {
	const remaining = [...floor];
	const matched: DuplicateGroup[] = [];
	const unmatched: DuplicateGroup[] = [];
	for (const group of groups) {
		const index = findFloorEntry(group, remaining);
		if (index === -1) {
			unmatched.push(group);
			continue;
		}
		remaining.splice(index, 1);
		matched.push(group);
	}
	return { matched, unmatched };
}

function findFloorEntry(
	group: DuplicateGroup,
	floor: readonly DuplicateGroup[],
): number {
	const exact = locationKey(group);
	const exactIndex = floor.findIndex((entry) => locationKey(entry) === exact);
	if (exactIndex !== -1) return exactIndex;
	const shape = shapeKey(group);
	return floor.findIndex((entry) => shapeKey(entry) === shape);
}

function locationKey(group: DuplicateGroup): string {
	return [...group.locations].sort().join("|");
}

function shapeKey(group: DuplicateGroup): string {
	return group.instances
		.map((it) => `${it.file}#${it.endLine - it.startLine}`)
		.sort()
		.join("|");
}

function runIn(
	run: ProcessRun,
	executable: string,
	args: readonly string[],
): Promise<ProviderProcessOutcome> {
	return run.runProcess(
		{ executablePath: executable, args, cwd: run.ctx.worktree },
		run.ctx.signal,
		{ timeoutMs: run.timeoutMs },
	);
}

function describeOutcome(outcome: ProviderProcessOutcome): string {
	switch (outcome.kind) {
		case "code-exit":
			return `exit ${outcome.code}${firstLine(outcome.stderr)}`;
		case "signal-exit":
			return `signal ${outcome.signal}`;
		case "timeout":
			return `timed out after ${outcome.timeoutMs} ms`;
		case "spawn-error":
			return `could not start: ${outcome.error.message}`;
		case "aborted":
			return "aborted";
		case "termination-error":
			return `termination failed: ${outcome.error.message}`;
	}
}

function firstLine(text: string): string {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length === 0 ? "" : `: ${line}`;
}

function parseJson(text: string, message: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(message);
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
