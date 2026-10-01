/**
 * Scoped mutation signal (brief 4.7B.5, rulings D-2 and D-4): Stryker mutates
 * only the changed functions and runs only the selected tests. A survivor
 * inside a changed function fails the signal and re-enters the builder once.
 * Operational failures never throw: when Stryker cannot be resolved, cannot
 * start or does not finish, the signal is `info` with `data.unavailable`.
 * Nothing to mutate, or no test to run, is `info` (or `pass`) without it.
 *
 * Two refinements of 4.7B.5 under the brief's principle that thresholds are
 * regression against the base, never absolute (ruling W3-6). Only survivors
 * on lines the diff added or rewrote re-enter; survivors on unchanged lines
 * of a changed function predate the change and are listed in
 * `survivorsOutsideDiff` as `info`. And a changed file whose own tests (its
 * mirrored test and direct test importers) are all sandbox-unsafe is not
 * mutated: no test could kill its mutants, so it is reported in `untestable`
 * rather than failed.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFileGraph } from "../../architecture-map/index.ts";
import type { FileGraph } from "../../architecture-map/types.ts";
import { resolveChangedFunctions } from "../../code-health/changed-functions.ts";
import {
	type DiffHunk,
	rangeIntersectsHunks,
} from "../../code-health/diff-hunks.ts";
import {
	type ChildRunOutcome,
	type RunChildOptions,
	runChild,
} from "../../process/run-child.ts";
import { unavailableData } from "../signal-availability.ts";
import type {
	Signal,
	SignalContext,
	SignalProvider,
	SignalStatus,
} from "../types.ts";
import {
	type ChangedFunctionRange,
	type MutantLocation,
	type MutationSummary,
	summarizeMutationReport,
} from "./mutation-report.ts";
import {
	DEFAULT_SANDBOX_UNSAFE_TESTS,
	isSandboxUnsafeTest,
	isTestFile,
	selectMutationTests,
	type TestSelection,
	type UntestableFile,
	untestableFiles,
} from "./mutation-tests.ts";

export type {
	ChangedFunctionRange,
	FunctionMutationResult,
	MutantLocation,
	MutationCounts,
	MutationSummary,
} from "./mutation-report.ts";
export { summarizeMutationReport } from "./mutation-report.ts";

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_TESTS = 20;
/** Below this much time, only tier 1 runs: the wide spike set took 190 s. */
const TIER2_MIN_BUDGET_MS = 180_000;
const LOG_TAIL_CHARS = 2_000;
/** Always Cosmonauts' own config: only it writes the report where the provider reads it. */
const STRYKER_CONFIG = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../stryker.config.mjs",
);
const STRYKER_TEMP_DIR = ".stryker-tmp";

export interface MutationProviderOptions {
	/** Stryker executable; defaults to Cosmonauts' own install run under Node. */
	readonly strykerBin?: string;
	/**
	 * Where `@stryker-mutator/core` is resolved from when `strykerBin` is
	 * not given, as a file path or URL; defaults to this module.
	 */
	readonly strykerResolveFrom?: string;
	/** Wall-clock cap for the Stryker run; the run budget caps it further. */
	readonly timeoutMs?: number;
	/** Test files never run under Stryker; replaces the default deny-list. */
	readonly denyListTests?: readonly string[];
	/** Cap on selected test files once tier 2 is added. */
	readonly maxTests?: number;
	/** Stryker test-runner processes; defaults to the config's value. */
	readonly concurrency?: number;
	/** SIGTERM to SIGKILL when Stryker is stopped; the runner's default when absent. */
	readonly graceMs?: number;
	/** Test seam: the child runner Stryker goes through. */
	readonly runChild?: (options: RunChildOptions) => Promise<ChildRunOutcome>;
}

interface StrykerPlan {
	readonly ranges: readonly ChangedFunctionRange[];
	readonly mutate: string[];
	readonly tests: TestSelection;
	/** The diff's hunks per changed file; undefined when the resolver gave none. */
	readonly hunks?: Readonly<Record<string, readonly DiffHunk[]>>;
	/** Changed files left out because every covering test is denied. */
	readonly untestable: readonly UntestableFile[];
}

type StrykerOutcome =
	| { readonly kind: "exit"; readonly code: number | null }
	| { readonly kind: "spawn-error"; readonly message: string }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "aborted" };

interface StrykerRun {
	readonly outcome: StrykerOutcome;
	/** What of Stryker's process tree outlived the reap; absent when nothing did. */
	readonly survivedReap?: string;
	/** Why Stryker's process tree could not be checked after a stop. */
	readonly unverifiedReap?: string;
}

/** A Stryker run, and what became of its sandbox afterwards. */
interface SandboxedRun extends StrykerRun {
	/** Kept because Stryker's process tree may still be running in it. */
	readonly sandboxKept?: string;
	/** Why removing the sandbox after the run failed. */
	readonly sandboxRemoval?: string;
}

export function createMutationProvider(
	options: MutationProviderOptions = {},
): SignalProvider {
	return {
		kind: "mutation",
		run: async (ctx) => {
			const started = Date.now();
			try {
				return await runMutation(ctx, options, started);
			} catch (error) {
				return infoSignal(`mutation signal unavailable: ${messageOf(error)}`, {
					durationMs: Date.now() - started,
					...unavailableData(messageOf(error)),
				});
			}
		},
	};
}

async function runMutation(
	ctx: SignalContext,
	options: MutationProviderOptions,
	started: number,
): Promise<Signal> {
	const unready = notReadyToMutate(ctx);
	if (unready !== undefined) {
		const reason = `${unready.why}: ${unready.signal.summary}`;
		return infoSignal(`skipped: ${unready.why}`, { skipped: true, reason });
	}
	ctx.signal?.throwIfAborted();
	const changed = await changedSourceFunctions(ctx);
	if (changed.ranges.length === 0) {
		return signal("pass", "no changed functions to mutate", {
			changedFunctions: [],
		});
	}
	const coverage = {
		graph: await loadGraph(ctx.worktree),
		blastRadiusTests: blastRadiusTests(ctx),
		exists: (path: string) => existsSync(join(ctx.worktree, path)),
		isDenied: denyPredicate(
			ctx.worktree,
			options.denyListTests ?? DEFAULT_SANDBOX_UNSAFE_TESTS,
		),
	};
	const untestable = untestableFiles({
		...coverage,
		sourceFiles: unique(changed.ranges.map((range) => range.file)),
	});
	const skip = new Set(untestable.map((entry) => entry.file));
	const ranges = changed.ranges.filter((range) => !skip.has(range.file));
	if (ranges.length === 0) return untestableSignal(changed.ranges, untestable);
	const timeoutMs = effectiveTimeout(options.timeoutMs, ctx.budget.timeMs);
	const tests = selectMutationTests({
		...coverage,
		sourceFiles: unique(ranges.map((range) => range.file)),
		changedFiles: ctx.changedFiles,
		includeTier2: timeoutMs >= TIER2_MIN_BUDGET_MS,
		maxTests: options.maxTests ?? DEFAULT_MAX_TESTS,
	});
	const plan: StrykerPlan = {
		ranges,
		mutate: mutateArguments(ranges),
		tests,
		hunks: changed.hunks,
		untestable,
	};
	if (tests.selected.length === 0) return noTestsSignal(ctx, plan, started);
	return runStrykerPlan(ctx, options, plan, { timeoutMs, started });
}

/**
 * No covering test to run: plain `info`, unless the blast radius had no
 * graph to select tests from, which leaves the signal unavailable.
 */
function noTestsSignal(
	ctx: SignalContext,
	plan: StrykerPlan,
	started: number,
): Signal {
	const data = { ...planData(plan), durationMs: Date.now() - started };
	const graph = blastRadiusGraphGap(ctx);
	if (graph === undefined)
		return infoSignal("no tests selected for the changed functions", data);
	const reason = `no tests selected for the changed functions: graph.json is ${graph}`;
	return infoSignal(reason, { ...data, ...unavailableData(reason) });
}

function blastRadiusGraphGap(
	ctx: SignalContext,
): "missing" | "unreadable" | undefined {
	const blast = ctx.priorSignals?.find(
		(entry) => entry.kind === "blast-radius",
	);
	const graph = isRecord(blast?.data) ? blast.data.graph : undefined;
	return graph === "missing" || graph === "unreadable" ? graph : undefined;
}

/** Every changed file's covering tests are denied: nothing to run Stryker for. */
function untestableSignal(
	ranges: readonly ChangedFunctionRange[],
	untestable: readonly UntestableFile[],
): Signal {
	return infoSignal(
		"untestable under mutation: covering tests are sandbox-unsafe",
		{
			changedFunctions: ranges,
			untestable,
			denied: unique(untestable.flatMap((entry) => entry.covering)).sort(),
		},
	);
}

async function runStrykerPlan(
	ctx: SignalContext,
	options: MutationProviderOptions,
	plan: StrykerPlan,
	run: { readonly timeoutMs: number; readonly started: number },
): Promise<Signal> {
	const outDir = join(resolve(ctx.runDir), "mutation");
	const reportPath = join(outDir, "mutation.json");
	const logPath = join(outDir, "stryker.log");
	await mkdir(outDir, { recursive: true });
	await rm(reportPath, { force: true });
	const strykerRun = await withoutSandbox(ctx.worktree, () =>
		runStryker(options, {
			command: strykerCommand(options, plan),
			cwd: ctx.worktree,
			reportPath,
			logPath,
			timeoutMs: run.timeoutMs,
			signal: ctx.signal,
		}),
	);
	const { outcome } = strykerRun;
	const data = {
		...planData(plan),
		reportPath,
		logPath,
		durationMs: Date.now() - run.started,
		...reapData(strykerRun),
	};
	if (outcome.kind !== "exit" || outcome.code !== 0) {
		const tail = await logTail(logPath);
		const reason = `Stryker did not finish: ${describeOutcome(outcome)}`;
		return withSandboxNote(
			infoSignal(reason, {
				...data,
				logTail: tail,
				...unavailableData(reason),
			}),
			strykerRun,
		);
	}
	const report: unknown = JSON.parse(await readFile(reportPath, "utf8"));
	const summary = summarizeMutationReport(report, plan.ranges, {
		projectRoot: ctx.worktree,
	});
	return withSandboxNote(
		withUntestable(verdict(summary, data, plan.hunks), plan.untestable),
		strykerRun,
	);
}

/** The reap and sandbox facts a run has, for the signal's data. */
function reapData(run: SandboxedRun): object {
	const facts = {
		survivedReap: run.survivedReap,
		unverifiedReap: run.unverifiedReap,
		sandboxKept: run.sandboxKept,
		sandboxRemoval: run.sandboxRemoval,
	};
	return Object.fromEntries(
		Object.entries(facts).filter(([, value]) => value !== undefined),
	);
}

/** Names the files left out as untestable in the summary, when there are any. */
function withUntestable(
	result: Signal,
	untestable: readonly UntestableFile[],
): Signal {
	if (untestable.length === 0) return result;
	const files = untestable.map((entry) => entry.file).join(", ");
	return {
		...result,
		summary: `${result.summary}; not mutated, covering tests are sandbox-unsafe: ${files}`,
	};
}

/**
 * Stryker's sandbox is removed before and after every run: a timeout or an
 * abort kills Stryker before its own cleanup runs. It is kept when
 * Stryker's process tree may still be running in it, and a removal that
 * fails is recorded instead of thrown, so the run's other facts survive.
 */
async function withoutSandbox(
	worktree: string,
	work: () => Promise<StrykerRun>,
): Promise<SandboxedRun> {
	const sandbox = join(worktree, STRYKER_TEMP_DIR);
	await rm(sandbox, { recursive: true, force: true });
	let run: StrykerRun;
	try {
		run = await work();
	} catch (error) {
		await rm(sandbox, { recursive: true, force: true });
		throw error;
	}
	const mayRun =
		run.survivedReap !== undefined || run.unverifiedReap !== undefined;
	if (mayRun && existsSync(sandbox)) return { ...run, sandboxKept: sandbox };
	if (mayRun) return run;
	try {
		await rm(sandbox, { recursive: true, force: true });
		return run;
	} catch (error) {
		return { ...run, sandboxRemoval: messageOf(error) };
	}
}

/** Names a sandbox left behind, and why, in the signal's summary. */
function withSandboxNote(result: Signal, run: SandboxedRun): Signal {
	const note = sandboxNote(run);
	return note ? { ...result, summary: `${result.summary}; ${note}` } : result;
}

function sandboxNote(run: SandboxedRun): string | undefined {
	if (run.sandboxKept !== undefined)
		return `Stryker's sandbox kept at ${run.sandboxKept}: its process tree ${run.survivedReap !== undefined ? "survived" : "could not be checked"}`;
	if (run.sandboxRemoval !== undefined)
		return `Stryker's sandbox not removed: ${run.sandboxRemoval}`;
	return undefined;
}

/** Changed functions outside test files, with Stryker-ready repo-relative paths, and the diff's hunks. */
async function changedSourceFunctions(ctx: SignalContext): Promise<{
	ranges: ChangedFunctionRange[];
	hunks?: Readonly<Record<string, readonly DiffHunk[]>>;
}> {
	const report = await resolveChangedFunctions({
		cwd: ctx.worktree,
		base: ctx.baseSha,
		signal: ctx.signal,
	});
	const ranges = report.functions
		.filter((fn) => !isTestFile(fn.file))
		.map((fn) => ({
			file: fn.file,
			name: fn.name,
			startLine: fn.startLine,
			endLine: fn.endLine,
		}));
	return report.hunks === undefined
		? { ranges }
		: { ranges, hunks: report.hunks };
}

/** `file:start-end` per changed function, nested and overlapping ranges merged. */
export function mutateArguments(
	ranges: readonly ChangedFunctionRange[],
): string[] {
	const sorted = [...ranges].sort(
		(left, right) =>
			left.file.localeCompare(right.file) || left.startLine - right.startLine,
	);
	const merged: { file: string; startLine: number; endLine: number }[] = [];
	for (const range of sorted) {
		const last = merged.at(-1);
		if (last?.file === range.file && range.startLine <= last.endLine) {
			last.endLine = Math.max(last.endLine, range.endLine);
		} else {
			merged.push({ ...range });
		}
	}
	return merged.map(
		(range) => `${range.file}:${range.startLine}-${range.endLine}`,
	);
}

interface OutsideDiffSurvivor extends MutantLocation {
	readonly file: string;
	readonly function: string;
}

function verdict(
	summary: MutationSummary,
	data: object,
	hunks: Readonly<Record<string, readonly DiffHunk[]>> | undefined,
): Signal {
	const { inRange } = summary;
	const detected = inRange.killed + inRange.timeout;
	const counts = `${detected} killed (${inRange.timeout} by timeout), ${inRange.survived} survived, ${inRange.noCoverage} no coverage`;
	const outsideDiff = survivorsOutsideDiff(summary, hunks);
	const payload = {
		...data,
		changedFunctions: summary.functions,
		inRange,
		outsideRange: summary.outsideRange,
		testFilesKillingNothing: summary.testFilesKillingNothing,
		...(outsideDiff.length > 0 ? { survivorsOutsideDiff: outsideDiff } : {}),
	};
	const inDiff = inRange.survived - outsideDiff.length;
	if (inDiff > 0) {
		const unchanged =
			outsideDiff.length > 0
				? ` (${outsideDiff.length} more on unchanged lines)`
				: "";
		return signal(
			"fail",
			`${inDiff} mutants survived on changed lines of changed functions${unchanged}: ${counts}`,
			payload,
			true,
		);
	}
	if (outsideDiff.length > 0) {
		return infoSignal(
			`${outsideDiff.length} mutants survived, all on unchanged lines of changed functions: ${counts}`,
			payload,
		);
	}
	if (detected > 0) {
		return signal(
			"pass",
			`every covered mutant in changed functions was killed: ${counts}`,
			payload,
		);
	}
	return infoSignal(
		inRange.mutants === 0
			? "no mutants in changed functions"
			: `no mutant in changed functions was covered by the selected tests: ${counts}`,
		payload,
	);
}

/**
 * Survivors whose lines no hunk added or rewrote. A file the resolver gave
 * no hunks for keeps every survivor in the diff, as before hunks existed.
 */
function survivorsOutsideDiff(
	summary: MutationSummary,
	hunks: Readonly<Record<string, readonly DiffHunk[]>> | undefined,
): OutsideDiffSurvivor[] {
	return summary.functions.flatMap((fn) => {
		const fileHunks = hunks?.[fn.file];
		if (fileHunks === undefined) return [];
		return fn.survivors
			.filter((mutant) => !rangeIntersectsHunks(mutant, fileHunks))
			.map((mutant) => ({ file: fn.file, function: fn.name, ...mutant }));
	});
}

function effectiveTimeout(
	optionMs: number | undefined,
	budgetMs: number,
): number {
	const cap = optionMs ?? DEFAULT_TIMEOUT_MS;
	return budgetMs > 0 ? Math.min(cap, budgetMs) : cap;
}

async function loadGraph(worktree: string): Promise<FileGraph | undefined> {
	try {
		return await loadFileGraph({ projectRoot: worktree });
	} catch {
		return undefined;
	}
}

/**
 * Mutants are only worth counting against passing tests: a verify signal that
 * did not pass, or blast-radius tests that failed, skip the run. A skipped
 * mutation signal did not run, so it can still earn its own re-entry once
 * the tests pass.
 */
function notReadyToMutate(
	ctx: SignalContext,
): { why: string; signal: Signal } | undefined {
	const prior = ctx.priorSignals ?? [];
	const verify = prior.find((entry) => entry.kind === "verify");
	if (verify !== undefined && verify.status !== "pass")
		return { why: "verification did not pass", signal: verify };
	const tests = prior.find((entry) => entry.kind === "blast-tests");
	if (tests?.status === "fail")
		return { why: "blast-radius tests failed", signal: tests };
	return undefined;
}

/** The `blast-radius` signal's `data.radius.tests`, when that signal already ran. */
function blastRadiusTests(ctx: SignalContext): string[] | undefined {
	const blast = ctx.priorSignals?.find(
		(entry) => entry.kind === "blast-radius",
	);
	if (!blast || !isRecord(blast.data) || !isRecord(blast.data.radius)) {
		return undefined;
	}
	const tests = blast.data.radius.tests;
	return Array.isArray(tests)
		? tests.filter((test): test is string => typeof test === "string")
		: undefined;
}

function denyPredicate(
	worktree: string,
	denyList: readonly string[],
): (path: string) => boolean {
	return (path) =>
		isSandboxUnsafeTest({
			path,
			content: readText(join(worktree, path)),
			denyList,
		});
}

function readText(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

interface StrykerCommand {
	readonly executable: string;
	readonly args: string[];
}

function strykerCommand(
	options: MutationProviderOptions,
	plan: StrykerPlan,
): StrykerCommand {
	const args = [
		"run",
		STRYKER_CONFIG,
		"--mutate",
		plan.mutate.join(","),
		"--testFiles",
		plan.tests.selected.join(","),
		"--reporters",
		"json",
		...(options.concurrency === undefined
			? []
			: ["--concurrency", String(options.concurrency)]),
	];
	if (options.strykerBin !== undefined) {
		return { executable: options.strykerBin, args };
	}
	return {
		executable: nodeExecutable(),
		args: [
			installedStrykerBin(options.strykerResolveFrom ?? import.meta.url),
			...args,
		],
	};
}

function installedStrykerBin(resolveFrom: string): string {
	const require = createRequire(resolveFrom);
	try {
		const manifest = require.resolve("@stryker-mutator/core/package.json");
		return join(dirname(manifest), "bin", "stryker.js");
	} catch {
		throw new Error("Stryker is not installed (@stryker-mutator/core)");
	}
}

/** Stryker runs under Node, as the test suite does, even when the host is Bun. */
function nodeExecutable(): string {
	return process.versions.bun === undefined ? process.execPath : "node";
}

interface RunStrykerOptions {
	readonly command: StrykerCommand;
	readonly cwd: string;
	readonly reportPath: string;
	readonly logPath: string;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal;
}

/**
 * Stryker and its test-runner processes share one process tree, which the
 * child runner ends on a timeout or an abort (`taskkill /T /F` on Windows)
 * before this resolves; `survivedReap` or `unverifiedReap` records what it
 * could not confirm. Both streams go to one log.
 */
async function runStryker(
	provider: MutationProviderOptions,
	options: RunStrykerOptions,
): Promise<StrykerRun> {
	const run = provider.runChild ?? runChild;
	const result = await run({
		command: options.command.executable,
		args: options.command.args,
		cwd: options.cwd,
		env: strykerEnv(options),
		output: { stdout: options.logPath, stderr: options.logPath },
		timeoutMs: options.timeoutMs,
		...(options.signal ? { signal: options.signal } : {}),
		...(provider.graceMs === undefined ? {} : { graceMs: provider.graceMs }),
	});
	const outcome = strykerOutcome(result);
	if (result.tree.kind === "survived")
		return { outcome, survivedReap: result.tree.reason };
	// After a natural exit Windows always reports `unverified`; Stryker ended
	// its own workers then. After a stop it means the tree may be running.
	if (result.tree.kind === "unverified" && result.stopped !== undefined)
		return { outcome, unverifiedReap: result.tree.reason };
	return { outcome };
}

function strykerOutcome(result: ChildRunOutcome): StrykerOutcome {
	if (result.stopped?.kind === "aborted") return { kind: "aborted" };
	if (result.stopped?.kind === "timeout")
		return { kind: "timeout", timeoutMs: result.stopped.timeoutMs };
	switch (result.exit.kind) {
		case "code":
			return { kind: "exit", code: result.exit.code };
		case "spawn-error":
			return { kind: "spawn-error", message: result.exit.error.message };
		default:
			return { kind: "exit", code: null };
	}
}

/**
 * Stryker's environment, which its test runners inherit. The sandbox has no
 * `.git`, so a test running git there without a fixture cwd would find the
 * live checkout above it; `GIT_CEILING_DIRECTORIES` at the sandboxes' parent
 * stops that search, and such a command fails instead.
 */
function strykerEnv(options: {
	readonly cwd: string;
	readonly reportPath: string;
}): NodeJS.ProcessEnv {
	const ceiling = join(realpathSync(options.cwd), STRYKER_TEMP_DIR);
	const inherited = process.env.GIT_CEILING_DIRECTORIES;
	return {
		...process.env,
		STRYKER_VITEST_POOL: "forks",
		STRYKER_JSON_REPORT: options.reportPath,
		GIT_CEILING_DIRECTORIES: inherited
			? `${ceiling}${delimiter}${inherited}`
			: ceiling,
	};
}

async function logTail(logPath: string): Promise<string> {
	try {
		return (await readFile(logPath, "utf8")).slice(-LOG_TAIL_CHARS);
	} catch {
		return "";
	}
}

function describeOutcome(outcome: StrykerOutcome): string {
	switch (outcome.kind) {
		case "exit":
			return `exit code ${String(outcome.code)}`;
		case "spawn-error":
			return `could not start (${outcome.message})`;
		case "timeout":
			return `timed out after ${outcome.timeoutMs} ms`;
		case "aborted":
			return "aborted";
	}
}

function planData(plan: StrykerPlan): object {
	return {
		mutate: plan.mutate,
		tests: plan.tests,
		...(plan.untestable.length > 0 ? { untestable: plan.untestable } : {}),
	};
}

function signal(
	status: SignalStatus,
	summary: string,
	data: object,
	reenter = false,
): Signal {
	return { kind: "mutation", status, summary, data, reenter };
}

function infoSignal(summary: string, data: object): Signal {
	return signal("info", summary, data);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
