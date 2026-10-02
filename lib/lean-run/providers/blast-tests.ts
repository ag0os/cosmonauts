/**
 * Runs the blast radius's tests explicitly (brief 4.7B.3), through the
 * project's test runner, bounded by count and by time. The list comes from
 * the `blast-radius` signal earlier in the pass, in two tiers as the
 * mutation provider selects them: tier 1 is the changed files' own tests
 * (changed spec files, mirrored tests and tests that import a changed file
 * directly), tier 2 the rest of the radius, run only when enough time is
 * left after tier 1. A tier that exits non-zero is run once more, as verify
 * retries a failed command; only a second failure fails the signal and
 * re-enters the builder once, even when verification ran the test too: the
 * explicit run is what counts. Only the files the runner's own output
 * reports running count as run: an exit 0 without a run summary, or with
 * one that counts no test passed or failed, ran nothing, and listed files
 * the runner left out are reported as not run. Everything that keeps the
 * list from running (no list, a graph that is missing or not known to be
 * current, no test runner, a runner that selects none of the listed files,
 * the count or time bound, a run that could not finish) is `info`, never
 * `fail`. When no test ran at all the signal is also `data.skipped` and
 * unavailable, so a required `blast-tests` is a gap. Never throws.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type ProviderProcessExecutor,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	dependentsOf,
	type FileGraph,
	loadFileGraph,
} from "../../architecture-map/index.ts";
import { unavailableData } from "../signal-availability.ts";
import type { Signal, SignalContext, SignalProvider } from "../types.ts";
import { isSpecFile, mirroredTestPath } from "./mutation-tests.ts";
import { readScripts } from "./verify.ts";

const DEFAULT_MAX_TESTS = 40;
const DEFAULT_TIMEOUT_MS = 300_000;
/** Below this much time left after tier 1, tier 2 does not start. */
const DEFAULT_TIER2_MIN_MS = 60_000;
const OUTPUT_TAIL_CHARS = 4_000;
/**
 * What vitest (`No test files found, exiting with code 1`) and jest (`No
 * tests found, exiting with code 1`) print, as a line of its own, when their
 * own include/exclude config filters out every file argument; with
 * `passWithNoTests` the code is 0. No re-entry can fix that. A test's own
 * output can carry the same text, so it counts only as a whole line and only
 * when the runner printed no run summary.
 */
const NOTHING_SELECTED =
	/^(?:No test files found|No tests found), exiting with code \d+$/mu;
/**
 * vitest's run summary (`Test Files  1 failed | 2 passed (3)` and
 * `      Tests  1 failed | 4 passed (5)`) and jest's (`Test Suites: 1 failed,
 * 2 passed, 3 total` and `Tests:       1 failed, 4 passed, 5 total`).
 */
const FILES_SUMMARY = /^\s*(?:Test Files\s+|Test Suites:\s+)(.+)$/mu;
const TESTS_SUMMARY = /^\s*Tests(?::\s+|\s{2,})(.+)$/mu;
/** Only these ran a test; skipped and todo tests did not. */
const RAN_COUNT = /(\d+) (?:passed|failed)/gu;
/**
 * A file's result line: vitest's ` ✓ path (2 tests) 3ms` (`❯` or `×` when
 * it failed, `↓` when every test was skipped), with a `|project|` label
 * before the path under vitest `projects`, and jest's `PASS path`.
 */
const FILE_RESULT = /^\s*(?:[✓❯×]|PASS|FAIL)\s+(?:\|[^|\s]+\|\s+)?(\S+)/gmu;
/**
 * The first line of a block of a test's own console output: vitest's
 * `stdout | path > test` or `stderr | path`, jest's indented `console.log`.
 * The block ends at the next empty line. jest indents every line of the
 * output, so its block ends after the output and before the `at …` line;
 * vitest prints the output as written, so an empty line the test printed
 * ends the block early.
 */
const CONSOLE_BLOCK_HEADER = /^(?:(?:stdout|stderr) \| .+|\s*console\.\w+)$/u;
const ANSI_ESCAPE = new RegExp(
	`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
	"gu",
);
const NOTHING_SELECTED_REASON =
	"the test runner selected none of the listed files";
const UNEXECUTED_REASON = "the test runner did not run them";

export interface BlastTestsCommand {
	readonly executable: string;
	/** The selected test files are appended after these. */
	readonly args: readonly string[];
}

export interface BlastTestsProviderOptions {
	/** Defaults to `bun run test -- <files>` when package.json has a `test` script. */
	readonly command?: BlastTestsCommand;
	/** Cap on test files run, tier 1 first. */
	readonly maxTests?: number;
	/** Wall-clock cap for both tiers; the run's time budget caps it further. */
	readonly timeoutMs?: number;
	/** Tier 2 starts only with at least this much of the time cap left. */
	readonly tier2MinMs?: number;
	readonly loadGraph?: (projectRoot: string) => Promise<FileGraph | undefined>;
	readonly runProcess?: ProviderProcessExecutor;
}

type TierVerdict = "passed" | "failed" | "not-run";

export interface BlastTestsAttempt {
	readonly outcome: ProviderProcessOutcome["kind"];
	/** Null when the runner did not exit on its own. */
	readonly exitCode: number | null;
	readonly verdict: TierVerdict;
	/** Why a `not-run` tier did not run, when the runner said so. */
	readonly reason?: string;
	/**
	 * A `passed` tier's listed files the runner reported running; the rest
	 * of the tier is in `notRun`.
	 */
	readonly executed?: readonly string[];
	readonly durationMs: number;
	readonly outputTail: string;
}

/**
 * The deciding attempt of a tier. A tier that failed was run once more;
 * `attempts` then holds both runs in order, and the second decides unless it
 * could not run, when the first failure stands.
 */
export interface BlastTestsRun extends BlastTestsAttempt {
	readonly tier: 1 | 2;
	readonly tests: readonly string[];
	readonly attempts?: readonly BlastTestsAttempt[];
}

/** Listed tests that did not run, and why. */
export interface BlastTestsLeftOut {
	readonly tests: readonly string[];
	readonly reason: string;
}

export interface BlastTestsData {
	/** Set when no listed test ran. */
	readonly skipped?: true;
	/** Set, with `reason`, when the check could not run at all. */
	readonly unavailable?: true;
	readonly reason?: string;
	readonly command?: string;
	readonly tier1?: readonly string[];
	readonly tier2?: readonly string[];
	readonly runs?: readonly BlastTestsRun[];
	readonly notRun?: readonly BlastTestsLeftOut[];
	/** Listed paths that are not spec files in the worktree. */
	readonly missing?: readonly string[];
	readonly maxTests?: number;
	readonly timeoutMs?: number;
	readonly durationMs?: number;
}

interface Radius {
	readonly changed: readonly string[];
	readonly tests: readonly string[];
}

interface Selection {
	readonly tier1: string[];
	readonly tier2: string[];
	readonly overCap: string[];
	readonly missing: string[];
}

interface RunTiersOptions {
	readonly ctx: SignalContext;
	readonly command: BlastTestsCommand;
	readonly selection: Selection;
	readonly deadline: number;
	readonly tier2MinMs: number;
	readonly runProcess: ProviderProcessExecutor;
}

export function createBlastTestsProvider(
	options: BlastTestsProviderOptions = {},
): SignalProvider {
	return {
		kind: "blast-tests",
		run: async (ctx) => {
			const started = Date.now();
			try {
				return await runBlastTests(ctx, options, started);
			} catch (error) {
				return unavailable(`blast-radius tests not run: ${messageOf(error)}`, {
					durationMs: Date.now() - started,
				});
			}
		},
	};
}

async function runBlastTests(
	ctx: SignalContext,
	options: BlastTestsProviderOptions,
	started: number,
): Promise<Signal> {
	const radius = readRadius(ctx);
	if (typeof radius === "string")
		return unavailable(radius, {}, { reason: `skipped: ${radius}` });
	const maxTests = options.maxTests ?? DEFAULT_MAX_TESTS;
	const loadGraph = options.loadGraph ?? loadGraphAt;
	const selection = selectTests({
		radius,
		graph: await loadGraph(ctx.worktree).catch(() => undefined),
		exists: (path) => existsSync(join(ctx.worktree, path)),
		maxTests,
	});
	const listed = [...selection.tier1, ...selection.tier2];
	if (listed.length === 0)
		return unavailable(
			"no tests in the blast radius",
			{ missing: selection.missing },
			{ reason: "skipped: no tests in the blast radius" },
		);
	const command = options.command ?? (await defaultCommand(ctx.worktree));
	if (command === undefined)
		return unavailable("no test runner: package.json has no test script", {
			tier1: selection.tier1,
			tier2: selection.tier2,
		});
	const timeoutMs = effectiveTimeout(options.timeoutMs, ctx.budget.timeMs);
	const result = await runTiers({
		ctx,
		command,
		selection,
		deadline: started + timeoutMs,
		tier2MinMs: options.tier2MinMs ?? DEFAULT_TIER2_MIN_MS,
		runProcess: options.runProcess ?? runProviderProcess,
	});
	return verdict({
		command: label(command),
		tier1: selection.tier1,
		tier2: selection.tier2,
		runs: result.runs,
		notRun: result.notRun,
		missing: selection.missing,
		maxTests,
		timeoutMs,
		durationMs: Date.now() - started,
	});
}

/** The `blast-radius` signal's changed files and tests, or why there is no list to run. */
function readRadius(ctx: SignalContext): Radius | string {
	const blast = ctx.priorSignals?.find(
		(entry) => entry.kind === "blast-radius",
	);
	if (blast === undefined) return "no blast-radius signal ran in this pass";
	const data = isRecord(blast.data) ? blast.data : {};
	if (data.graph !== "current")
		return `graph.json is ${graphState(data.graph)}; the blast-radius test list cannot be trusted`;
	const radius = isRecord(data.radius) ? data.radius : {};
	return { changed: strings(radius.changed), tests: strings(radius.tests) };
}

function graphState(graph: unknown): string {
	if (graph === "stale") return "stale";
	if (graph === "unknown") return "of unknown freshness";
	if (graph === "unreadable") return "unreadable";
	return "missing";
}

/**
 * Tier 1 first, then tier 2, `maxTests` in all; the rest is `overCap`. Only
 * spec files that exist in the worktree are listed.
 */
function selectTests(input: {
	readonly radius: Radius;
	readonly graph: FileGraph | undefined;
	readonly exists: (path: string) => boolean;
	readonly maxTests: number;
}): Selection {
	const { radius } = input;
	const present = (path: string) => isSpecFile(path) && input.exists(path);
	const tests = unique(radius.tests);
	const own = ownTests(radius.changed, input.graph);
	const tier1All = tests.filter((path) => own.has(path) && present(path));
	const tier2All = tests.filter((path) => !own.has(path) && present(path));
	const tier1 = tier1All.slice(0, input.maxTests);
	const tier2 = tier2All.slice(0, input.maxTests - tier1.length);
	return {
		tier1,
		tier2,
		overCap: [...tier1All.slice(tier1.length), ...tier2All.slice(tier2.length)],
		missing: tests.filter((path) => !present(path)),
	};
}

/** The changed files themselves, their mirrored tests and every file that imports one directly. */
function ownTests(
	changed: readonly string[],
	graph: FileGraph | undefined,
): Set<string> {
	return new Set(
		changed.flatMap((file) => [
			file,
			...optional(mirroredTestPath(file)),
			...(graph ? dependentsOf(graph, file).map((edge) => edge.from) : []),
		]),
	);
}

async function defaultCommand(
	worktree: string,
): Promise<BlastTestsCommand | undefined> {
	const scripts = await readScripts(worktree);
	if (!("test" in scripts)) return undefined;
	return { executable: "bun", args: ["run", "test", "--"] };
}

/** Tier 1, then tier 2 when tier 1 passed and at least `tier2MinMs` is left. */
async function runTiers(
	options: RunTiersOptions,
): Promise<{ runs: BlastTestsRun[]; notRun: BlastTestsLeftOut[] }> {
	const { tier1, tier2, overCap } = options.selection;
	const runs: BlastTestsRun[] = [];
	const notRun: BlastTestsLeftOut[] = [];
	if (overCap.length > 0)
		notRun.push({ tests: overCap, reason: "over the test count cap" });
	const run = async (tier: 1 | 2, tests: readonly string[]) => {
		const result = await runTierWithRetry(options, tier, tests);
		runs.push(result);
		notRun.push(...unexecuted(result));
	};
	if (tier1.length > 0) await run(1, tier1);
	if (tier2.length === 0) return { runs, notRun };
	const skip = tier2SkipReason(options, runs[0]);
	if (skip) notRun.push({ tests: tier2, reason: skip });
	else await run(2, tier2);
	return { runs, notRun };
}

/** A passed tier's listed files the runner did not report running. */
function unexecuted(run: BlastTestsRun): BlastTestsLeftOut[] {
	if (run.executed === undefined) return [];
	const executed = new Set(run.executed);
	const left = run.tests.filter((test) => !executed.has(test));
	return left.length > 0 ? [{ tests: left, reason: UNEXECUTED_REASON }] : [];
}

function tier2SkipReason(
	options: RunTiersOptions,
	tier1: BlastTestsRun | undefined,
): string | undefined {
	if (tier1?.verdict === "failed") return "tier 1 failed";
	if (tier1?.verdict === "not-run" && tier1.reason === undefined)
		return "tier 1 did not run";
	const left = options.deadline - Date.now();
	if (left < options.tier2MinMs)
		return `time: ${Math.max(0, left)} ms left, tier 2 needs ${options.tier2MinMs} ms`;
	return undefined;
}

/** The second run decides, unless it could not run: then the first failure stands. */
async function runTierWithRetry(
	options: RunTiersOptions,
	tier: 1 | 2,
	tests: readonly string[],
): Promise<BlastTestsRun> {
	const first = await runTier(options, tier, tests);
	if (first.verdict !== "failed") return first;
	const second = await runTier(options, tier, tests);
	const deciding = second.verdict === "not-run" ? first : second;
	return { ...deciding, attempts: [attemptOf(first), attemptOf(second)] };
}

function attemptOf(run: BlastTestsRun): BlastTestsAttempt {
	const { tier: _tier, tests: _tests, attempts: _attempts, ...attempt } = run;
	return attempt;
}

async function runTier(
	options: RunTiersOptions,
	tier: 1 | 2,
	tests: readonly string[],
): Promise<BlastTestsRun> {
	const { ctx, command } = options;
	const remainingMs = options.deadline - Date.now();
	if (ctx.signal?.aborted || remainingMs <= 0)
		return notStarted(tier, tests, ctx.signal?.aborted ? "aborted" : "time");
	const started = Date.now();
	const outcome = await options.runProcess(
		{
			executablePath: command.executable,
			args: [...command.args, ...tests],
			cwd: ctx.worktree,
		},
		ctx.signal,
		{ timeoutMs: remainingMs },
	);
	return {
		tier,
		tests,
		outcome: outcome.kind,
		exitCode: outcome.kind === "code-exit" ? outcome.code : null,
		...classify(outcome, tests),
		durationMs: Date.now() - started,
		outputTail: outputTail(outcome),
	};
}

type Classified = Pick<BlastTestsRun, "verdict" | "reason" | "executed">;

/**
 * A run passes only for the listed files the runner reports running: an
 * exit 0 without a run summary, or with one that counts no test run, ran
 * nothing.
 */
function classify(
	outcome: ProviderProcessOutcome,
	tests: readonly string[],
): Classified {
	if (outcome.kind === "spawn-error")
		return notRun(`runner spawn error: ${outcome.error.message}`);
	if (outcome.kind !== "code-exit") return { verdict: verdictOf(outcome) };
	const output = `${outcome.stdout}\n${outcome.stderr}`
		.replace(ANSI_ESCAPE, "")
		.replace(/\r$/gmu, "");
	const report = readRunReport(output);
	if (report === undefined && NOTHING_SELECTED.test(output))
		return notRun(NOTHING_SELECTED_REASON);
	if (outcome.code !== 0) return { verdict: "failed" };
	if (report === undefined)
		return notRun("no run summary in the test runner's output");
	if (report.files === 0)
		return notRun("no tests executed (runner reported 0 test files)");
	if (report.tests === 0)
		return notRun("no tests executed (runner reported 0 tests)");
	const executed = executedFiles(tests, report);
	if (executed === undefined) return notRun(unnamedReason(report));
	return { verdict: "passed", executed };
}

/** Why none of the listed files counts as run; the caller lists them. */
function unnamedReason(report: RunReport): string {
	const others = report.named.size;
	if (others > 0)
		return `the test runner named none of the listed files (it named only ${others} other file${others === 1 ? "" : "s"})`;
	return "the test runner named no files; blast-tests needs a reporter that names files (vitest default or verbose, not dot)";
}

function notRun(reason: string): Classified {
	return { verdict: "not-run", reason };
}

/** What the runner says it ran: files and tests that passed or failed, and the files it named. */
interface RunReport {
	readonly files: number;
	readonly tests: number;
	readonly named: ReadonlySet<string>;
}

/** Undefined without a file count in the run summary. */
function readRunReport(output: string): RunReport | undefined {
	const files = lastMatch(FILES_SUMMARY, output);
	if (files === undefined) return undefined;
	return {
		files: ranCount(files),
		tests: ranCount(lastMatch(TESTS_SUMMARY, output) ?? ""),
		named: new Set(
			[...withoutConsoleBlocks(output).matchAll(FILE_RESULT)].map((match) =>
				withoutDotSlash(match[1] ?? ""),
			),
		),
	};
}

/** `output` without the blocks of the tests' own console output, where a printed line can look like a result line. */
function withoutConsoleBlocks(output: string): string {
	const kept: string[] = [];
	let inBlock = false;
	for (const line of output.split("\n")) {
		if (CONSOLE_BLOCK_HEADER.test(line)) inBlock = true;
		else if (line === "") inBlock = false;
		if (!inBlock) kept.push(line);
	}
	return kept.join("\n");
}

/**
 * The listed files the runner named as run; undefined when it named none
 * of them. A file count without names is not attribution: a filter or a
 * wrapper can run other files to the same count.
 */
function executedFiles(
	tests: readonly string[],
	report: RunReport,
): string[] | undefined {
	const named = tests.filter((test) => report.named.has(withoutDotSlash(test)));
	return named.length > 0 ? named : undefined;
}

function lastMatch(pattern: RegExp, text: string): string | undefined {
	const global = new RegExp(pattern.source, `${pattern.flags}g`);
	return [...text.matchAll(global)].at(-1)?.[1];
}

function ranCount(summary: string): number {
	return [...summary.matchAll(RAN_COUNT)].reduce(
		(sum, match) => sum + Number(match[1]),
		0,
	);
}

function withoutDotSlash(path: string): string {
	return path.startsWith("./") ? path.slice(2) : path;
}

function notStarted(
	tier: 1 | 2,
	tests: readonly string[],
	why: "aborted" | "time",
): BlastTestsRun {
	return {
		tier,
		tests,
		outcome: why === "aborted" ? "aborted" : "timeout",
		exitCode: null,
		verdict: "not-run",
		durationMs: 0,
		outputTail: `not run: ${why === "aborted" ? "aborted" : "no time left"}`,
	};
}

/** A runner that did not exit with a code: killed by a signal is `failed`; cut short by the time bound or an abort is `not-run`. */
function verdictOf(outcome: ProviderProcessOutcome): TierVerdict {
	return outcome.kind === "signal-exit" ? "failed" : "not-run";
}

function verdict(data: BlastTestsData): Signal {
	const runs = data.runs ?? [];
	const failed = runs.filter((run) => run.verdict === "failed");
	if (failed.length > 0) {
		const which = failed.map(describeRun).join("; ");
		return signal("fail", which, data);
	}
	const count = runs.reduce(
		(sum, run) => sum + (run.verdict === "passed" ? executedCount(run) : 0),
		0,
	);
	const unrun = [
		...runs.filter((run) => run.verdict === "not-run").map(describeUnrun),
		...(data.notRun ?? []).map(
			(entry) => `${entry.tests.length} not run: ${entry.reason}`,
		),
	];
	if (count === 0) {
		const why = unrun.length > 0 ? unrun.join("; ") : "nothing selected";
		return unavailable(`0 blast-radius tests passed; ${why}`, data, {
			reason: `no tests executed: ${why}`,
		});
	}
	if (unrun.length === 0)
		return signal(
			"pass",
			`${count} blast-radius tests passed${retried(runs)}`,
			data,
		);
	const reason = unrun.join("; ");
	return signal("info", `${count} blast-radius tests passed; ${reason}`, {
		...data,
		reason,
	});
}

function executedCount(run: BlastTestsRun): number {
	return (run.executed ?? run.tests).length;
}

function describeUnrun(run: BlastTestsRun): string {
	if (run.reason !== undefined)
		return `tier ${run.tier} not run: ${run.reason}: ${run.tests.join(", ")}`;
	return `tier ${run.tier} did not finish (${run.outcome})`;
}

function retried(runs: readonly BlastTestsRun[]): string {
	const recovered = runs.filter((run) => run.attempts !== undefined);
	if (recovered.length === 0) return "";
	const tiers = recovered.map((run) => `tier ${run.tier}`).join(", ");
	return `; passed on a second run after failing once: ${tiers}`;
}

function describeRun(run: BlastTestsRun): string {
	const exit =
		run.exitCode === null ? run.outcome : `exit ${String(run.exitCode)}`;
	return `tier ${run.tier} failed (${exit}): ${run.tests.join(", ")}`;
}

function effectiveTimeout(
	optionMs: number | undefined,
	budgetMs: number,
): number {
	const cap = optionMs ?? DEFAULT_TIMEOUT_MS;
	return budgetMs > 0 ? Math.min(cap, budgetMs) : cap;
}

function label(command: BlastTestsCommand): string {
	return [command.executable, ...command.args].join(" ");
}

function outputTail(outcome: ProviderProcessOutcome): string {
	return [outcome.stdout, outcome.stderr]
		.filter((stream) => stream.length > 0)
		.join("\n")
		.slice(-OUTPUT_TAIL_CHARS);
}

async function loadGraphAt(
	projectRoot: string,
): Promise<FileGraph | undefined> {
	return loadFileGraph({ projectRoot });
}

/**
 * No test ran, so nothing was verified: unavailable, which a required
 * `blast-tests` turns into a gap, and `skipped`, so the run's re-entry
 * accounting does not count the kind as checked in this pass (a later
 * failure can still earn its own re-entry). `reason` defaults to the
 * summary.
 */
function unavailable(
	summary: string,
	data: BlastTestsData,
	options: { reason?: string } = {},
): Signal {
	return signal("info", summary, {
		...data,
		skipped: true,
		...unavailableData(options.reason ?? summary),
	});
}

function signal(
	status: Signal["status"],
	summary: string,
	data: BlastTestsData,
): Signal {
	return {
		kind: "blast-tests",
		status,
		summary,
		data,
		reenter: status === "fail",
	};
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function optional(value: string | undefined): string[] {
	return value === undefined ? [] : [value];
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
