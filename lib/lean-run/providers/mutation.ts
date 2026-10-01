/**
 * Scoped mutation signal (brief 4.7B.5, rulings D-2 and D-4): Stryker mutates
 * only the changed functions and runs only the selected tests. A survivor
 * inside a changed function fails the signal and re-enters the builder once.
 * Operational failures never throw; they become an `info` signal.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFileGraph } from "../../architecture-map/index.ts";
import type { FileGraph } from "../../architecture-map/types.ts";
import { resolveChangedFunctions } from "../../code-health/changed-functions.ts";
import { reapProcessGroup } from "../../process/process-group.ts";
import type {
	Signal,
	SignalContext,
	SignalProvider,
	SignalStatus,
} from "../types.ts";
import {
	type ChangedFunctionRange,
	type MutationSummary,
	summarizeMutationReport,
} from "./mutation-report.ts";
import {
	DEFAULT_SANDBOX_UNSAFE_TESTS,
	isSandboxUnsafeTest,
	isTestFile,
	selectMutationTests,
	type TestSelection,
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
	/** Wall-clock cap for the Stryker run; the run budget caps it further. */
	readonly timeoutMs?: number;
	/** Test files never run under Stryker; replaces the default deny-list. */
	readonly denyListTests?: readonly string[];
	/** Cap on selected test files once tier 2 is added. */
	readonly maxTests?: number;
	/** Stryker test-runner processes; defaults to the config's value. */
	readonly concurrency?: number;
}

interface StrykerPlan {
	readonly ranges: readonly ChangedFunctionRange[];
	readonly mutate: string[];
	readonly tests: TestSelection;
}

type StrykerOutcome =
	| { readonly kind: "exit"; readonly code: number | null }
	| { readonly kind: "spawn-error"; readonly message: string }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "aborted" };

interface StrykerRun {
	readonly outcome: StrykerOutcome;
	/** Why Stryker's process group outlived the reap; absent when nothing did. */
	readonly survivedReap?: string;
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
	ctx.signal?.throwIfAborted();
	const ranges = await changedSourceFunctions(ctx);
	if (ranges.length === 0) {
		return signal("pass", "no changed functions to mutate", {
			changedFunctions: [],
		});
	}
	const timeoutMs = effectiveTimeout(options.timeoutMs, ctx.budget.timeMs);
	const tests = selectMutationTests({
		sourceFiles: unique(ranges.map((range) => range.file)),
		changedFiles: ctx.changedFiles,
		graph: await loadGraph(ctx.worktree),
		blastRadiusTests: blastRadiusTests(ctx),
		includeTier2: timeoutMs >= TIER2_MIN_BUDGET_MS,
		maxTests: options.maxTests ?? DEFAULT_MAX_TESTS,
		exists: (path) => existsSync(join(ctx.worktree, path)),
		isDenied: denyPredicate(
			ctx.worktree,
			options.denyListTests ?? DEFAULT_SANDBOX_UNSAFE_TESTS,
		),
	});
	const plan = { ranges, mutate: mutateArguments(ranges), tests };
	if (tests.selected.length === 0) {
		return infoSignal("no tests selected for the changed functions", {
			...planData(plan),
			durationMs: Date.now() - started,
		});
	}
	return runStrykerPlan(ctx, options, plan, { timeoutMs, started });
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
		runStryker({
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
		...(strykerRun.survivedReap === undefined
			? {}
			: { survivedReap: strykerRun.survivedReap }),
	};
	if (outcome.kind !== "exit" || outcome.code !== 0) {
		const tail = await logTail(logPath);
		return infoSignal(`Stryker did not finish: ${describeOutcome(outcome)}`, {
			...data,
			logTail: tail,
		});
	}
	const report: unknown = JSON.parse(await readFile(reportPath, "utf8"));
	return verdict(
		summarizeMutationReport(report, plan.ranges, {
			projectRoot: ctx.worktree,
		}),
		data,
	);
}

/**
 * Stryker's sandbox is removed before and after every run: a timeout or an
 * abort kills Stryker before its own cleanup runs.
 */
async function withoutSandbox<T>(
	worktree: string,
	work: () => Promise<T>,
): Promise<T> {
	const sandbox = join(worktree, STRYKER_TEMP_DIR);
	await rm(sandbox, { recursive: true, force: true });
	try {
		return await work();
	} finally {
		await rm(sandbox, { recursive: true, force: true });
	}
}

/** Changed functions outside test files, with Stryker-ready repo-relative paths. */
async function changedSourceFunctions(
	ctx: SignalContext,
): Promise<ChangedFunctionRange[]> {
	const report = await resolveChangedFunctions({
		cwd: ctx.worktree,
		base: ctx.baseSha,
		signal: ctx.signal,
	});
	return report.functions
		.filter((fn) => !isTestFile(fn.file))
		.map((fn) => ({
			file: fn.file,
			name: fn.name,
			startLine: fn.startLine,
			endLine: fn.endLine,
		}));
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

function verdict(summary: MutationSummary, data: object): Signal {
	const { inRange } = summary;
	const detected = inRange.killed + inRange.timeout;
	const counts = `${detected} killed (${inRange.timeout} by timeout), ${inRange.survived} survived, ${inRange.noCoverage} no coverage`;
	const payload = {
		...data,
		changedFunctions: summary.functions,
		inRange,
		outsideRange: summary.outsideRange,
		testFilesKillingNothing: summary.testFilesKillingNothing,
	};
	if (inRange.survived > 0) {
		return signal(
			"fail",
			`${inRange.survived} mutants survived in changed functions: ${counts}`,
			payload,
			true,
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
		args: [installedStrykerBin(), ...args],
	};
}

function installedStrykerBin(): string {
	const require = createRequire(import.meta.url);
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

async function runStryker(options: RunStrykerOptions): Promise<StrykerRun> {
	const log = await open(options.logPath, "w");
	try {
		return await spawnStryker(options, log.fd);
	} finally {
		await log.close();
	}
}

function spawnStryker(
	options: RunStrykerOptions,
	logFd: number,
): Promise<StrykerRun> {
	return new Promise((settleRun) => {
		let settled = false;
		let timer: NodeJS.Timeout | undefined;
		const child = spawn(options.command.executable, options.command.args, {
			cwd: options.cwd,
			env: {
				...process.env,
				STRYKER_VITEST_POOL: "forks",
				STRYKER_JSON_REPORT: options.reportPath,
			},
			detached: process.platform !== "win32",
			stdio: ["ignore", logFd, logFd],
		});
		const finish = (outcome: StrykerOutcome): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
			void reapChild(child.pid).then(
				(survivedReap) => settleRun({ outcome, survivedReap }),
				(error: unknown) =>
					settleRun({ outcome, survivedReap: messageOf(error) }),
			);
		};
		const onAbort = (): void => finish({ kind: "aborted" });
		child.once("error", (error) =>
			finish({ kind: "spawn-error", message: error.message }),
		);
		child.once("exit", (code) => finish({ kind: "exit", code }));
		timer = setTimeout(
			() => finish({ kind: "timeout", timeoutMs: options.timeoutMs }),
			options.timeoutMs,
		);
		options.signal?.addEventListener("abort", onAbort, { once: true });
		if (options.signal?.aborted) onAbort();
	});
}

/** Stryker's runner processes share its group; none may outlive the signal. */
async function reapChild(pid: number | undefined): Promise<string | undefined> {
	if (pid === undefined || process.platform === "win32") return undefined;
	const reaped = await reapProcessGroup(pid);
	return reaped.kind === "survived" ? reaped.reason : undefined;
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
	return { mutate: plan.mutate, tests: plan.tests };
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
