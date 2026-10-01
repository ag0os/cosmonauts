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
 * explicit run is what counts. Everything that keeps the list from running
 * (no list, a graph that is missing or not known to be current, no test
 * runner, a runner that selects none of the listed files, the count or time
 * bound, a run that could not finish) is `info`, never `fail`, and
 * `data.skipped` when no listed test ran. When the check cannot run at all
 * (a missing or unreadable graph, no test runner, an error) the signal is
 * also marked unavailable. Never throws.
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
 * tests found, exiting with code 1`) print when their own include/exclude
 * config filters out every file argument. No re-entry can fix that.
 */
const NOTHING_SELECTED =
	/No test files found, exiting with code 1|No tests found, exiting with code 1/u;
const NOTHING_SELECTED_REASON =
	"the test runner selected none of the listed files";

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
		return graphUnavailable(ctx) ? unavailable(radius, {}) : info(radius, {});
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
		return info("no tests in the blast radius", {
			missing: selection.missing,
		});
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

/** The blast-radius signal had no graph to read: missing or unreadable, not merely stale. */
function graphUnavailable(ctx: SignalContext): boolean {
	const blast = ctx.priorSignals?.find(
		(entry) => entry.kind === "blast-radius",
	);
	if (blast === undefined || !isRecord(blast.data)) return false;
	return blast.data.graph === "missing" || blast.data.graph === "unreadable";
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
	if (tier1.length > 0) runs.push(await runTierWithRetry(options, 1, tier1));
	if (tier2.length === 0) return { runs, notRun };
	const skip = tier2SkipReason(options, runs[0]);
	if (skip) notRun.push({ tests: tier2, reason: skip });
	else runs.push(await runTierWithRetry(options, 2, tier2));
	return { runs, notRun };
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
	const nothingSelected = selectedNothing(outcome);
	return {
		tier,
		tests,
		outcome: outcome.kind,
		exitCode: outcome.kind === "code-exit" ? outcome.code : null,
		verdict: nothingSelected ? "not-run" : verdictOf(outcome),
		...(nothingSelected ? { reason: NOTHING_SELECTED_REASON } : {}),
		durationMs: Date.now() - started,
		outputTail: outputTail(outcome),
	};
}

function selectedNothing(outcome: ProviderProcessOutcome): boolean {
	return (
		outcome.kind === "code-exit" &&
		outcome.code !== 0 &&
		(NOTHING_SELECTED.test(outcome.stdout) ||
			NOTHING_SELECTED.test(outcome.stderr))
	);
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

/** A test that ran and failed is `failed`; a run the time bound cut short or that never started is `not-run`. */
function verdictOf(outcome: ProviderProcessOutcome): TierVerdict {
	if (outcome.kind === "code-exit")
		return outcome.code === 0 ? "passed" : "failed";
	return outcome.kind === "signal-exit" ? "failed" : "not-run";
}

function verdict(data: BlastTestsData): Signal {
	const runs = data.runs ?? [];
	const failed = runs.filter((run) => run.verdict === "failed");
	if (failed.length > 0) {
		const which = failed.map(describeRun).join("; ");
		return signal("fail", which, data);
	}
	const ran = runs.filter((run) => run.verdict === "passed");
	const count = ran.reduce((sum, run) => sum + run.tests.length, 0);
	const unrun = [
		...runs.filter((run) => run.verdict === "not-run").map(describeUnrun),
		...(data.notRun ?? []).map(
			(entry) => `${entry.tests.length} not run: ${entry.reason}`,
		),
	];
	if (unrun.length === 0)
		return signal(
			"pass",
			`${count} blast-radius tests passed${retried(runs)}`,
			data,
		);
	const reason = unrun.join("; ");
	const summary = `${count} blast-radius tests passed; ${reason}`;
	if (count === 0) return info(summary, { ...data, reason });
	return signal("info", summary, { ...data, reason });
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
 * No listed test ran: `skipped`, so the run's re-entry accounting does not
 * count the kind as checked in this pass (a later failure can still earn
 * its own re-entry).
 */
function info(summary: string, data: BlastTestsData): Signal {
	return signal("info", summary, { reason: summary, ...data, skipped: true });
}

/** No listed test ran because the check could not run: skipped and unavailable. */
function unavailable(summary: string, data: BlastTestsData): Signal {
	return signal("info", summary, {
		...data,
		skipped: true,
		...unavailableData(summary),
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
