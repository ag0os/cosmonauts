import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { DEFAULT_SLICE_BUDGET_TOKENS } from "../architecture-map/index.ts";
import { loadProjectConfig } from "../config/index.ts";
import type { ProjectLeanConfig } from "../config/types.ts";
import type { Envelope, Finding } from "../envelope/index.ts";
import { clearRunBaseSha, writeRunBaseSha } from "./base-sha.ts";
import { openBuilderWorktree, type TempWorktree } from "./builder-worktree.ts";
import { buildContextPack, planPathWarnings } from "./context-pack.ts";
import { parseStageEnvelope } from "./envelope.ts";
import {
	applyPatch,
	builderTaskId,
	readHeadSha,
	readMergeBase,
	readWorktreeChange,
	readWorktreePatch,
	resolveCommit,
	snapshotBeforeBuilder,
} from "./git.ts";
import {
	type FileGraphRefresh,
	type RefreshFileGraph,
	refreshFileGraph,
} from "./graph-refresh.ts";
import { takeHealthHookLog } from "./health-hook-log.ts";
import { parsePlan, requestPaths } from "./plan.ts";
import {
	builderPrompt,
	findingsPrompt,
	reentryPrompt,
	repairPrompt,
	reviewerPrompt,
} from "./prompts.ts";
import { createVerifyProvider } from "./providers/verify.ts";
import {
	createRunRecord,
	saveEnvelope,
	saveFacts,
	saveManifest,
	saveRequest,
	saveStats,
} from "./record.ts";
import {
	openBuilderReviewCheckout,
	openReviewCheckout,
	type ReviewCheckout,
} from "./review-checkout.ts";
import { acquireRunLock } from "./run-lock.ts";
import { writeRunPrBody } from "./run-pr-body.ts";
import type {
	BackendRunInput,
	BackendRunResult,
	BuilderBackend,
	EnvelopeRepair,
	GraphRefreshPoint,
	GraphRefreshRecord,
	LeanLens,
	ParsedPlan,
	RunBudget,
	RunRecord,
	RunStage,
	RunStatus,
	RunTier,
	Signal,
	SignalContext,
	SignalKind,
	SignalProvider,
	SignalReentry,
} from "./types.ts";
import { RUN_RECORD_FILES } from "./types.ts";

export interface RunBuildOptions {
	projectRoot: string;
	/** plan.md, relative to the project root. Exactly one of `planPath` and `request`. */
	planPath?: string;
	/** A direct-tier change with no plan document; it stands in for the plan section. */
	request?: string;
	specPath?: string;
	/**
	 * Verbatim builder prompt, followed only by the envelope instruction.
	 * Without it the host builds the context pack (brief 4.6), or sends the
	 * plan alone when no file graph can be produced.
	 */
	contextPack?: string;
	backend: BuilderBackend;
	reviewerBackend: BuilderBackend;
	providers: readonly SignalProvider[];
	/** Each field wins over `lean.budget` in the project config, which wins over `DEFAULT_RUN_BUDGET`. */
	budget?: Partial<RunBudget>;
	/** Reviewer lenses; `["general"]` when omitted. */
	lenses?: readonly LeanLens[];
	signal?: AbortSignal;
	/**
	 * Brings graph.json up to date at run start and before each provider
	 * pass; defaults to regenerating it with the architecture-map generator.
	 */
	refreshGraph?: RefreshFileGraph;
}

/** Warning prefix for a run whose builder got the plan without a context pack. */
const PLAN_ONLY = "context pack: the builder got the plan alone";

/**
 * Input + output tokens across every session of a run. Cache reads are not
 * counted: Pi sessions read hundreds of thousands of cached tokens each. A
 * run that reaches the re-review is estimated at 29 to 63 minutes.
 */
export const DEFAULT_RUN_BUDGET: RunBudget = {
	tokens: 1_000_000,
	timeMs: 60 * 60_000,
};

/** The longest timer delay Node and Bun honour; a longer `timeMs` is cut to it. */
export const MAX_RUN_TIME_MS = 2 ** 31 - 1;

const DEFAULT_LENSES: readonly LeanLens[] = ["general"];

/** Ruling D-4: only failing verification, failing blast-radius tests and surviving mutants send the builder back. */
const REENTRY_KINDS: ReadonlySet<SignalKind> = new Set([
	"verify",
	"blast-tests",
	"mutation",
]);

/** Findings at these severities send the builder back once (principle 6). */
const BLOCKING_SEVERITIES: ReadonlySet<Finding["severity"]> = new Set([
	"high",
	"medium",
]);

type BuilderStage = "builder-1" | SignalReentry["stage"] | "builder-4";

/** The signal re-entry stages in order: one re-entry per signal kind, two at most. */
const REENTRY_STAGES: readonly SignalReentry["stage"][] = [
	"builder-2",
	"builder-3",
];

type ReviewerStage = "reviewer" | "reviewer-2";

interface Run {
	options: RunBuildOptions;
	record: RunRecord;
	plan: ParsedPlan;
	tier: RunTier;
	lean: ProjectLeanConfig;
	basePrompt: string;
	budget: RunBudget;
	/**
	 * The token budget came from the caller or `lean.budget.tokens`, not the
	 * built-in default: a session that reports no usage then ends the run.
	 */
	explicitTokens: boolean;
	deadline: AbortSignal;
	/** The caller's signal combined with the deadline. */
	signal: AbortSignal;
	stage: string;
	/**
	 * Where builders, providers and the graph refresh run: the builder
	 * worktree once it is open, the project root before that and in a review.
	 */
	worktree: string;
	builder?: TempWorktree;
	/** The last builder attempt's patch; undefined when it could not be written. */
	patch?: string;
}

interface PlanSource {
	tier: RunTier;
	plan: ParsedPlan;
}

/** What the builder and verification left for the reviewer. */
interface Verified {
	builder: Envelope;
	/** Re-entry signals that still fail in the last pass. */
	remaining: Signal[];
}

type StageInput = Omit<BackendRunInput, "signal" | "taskId" | "readonly">;

/**
 * Every builder stage runs in a detached worktree of the attempt-1 snapshot
 * (HEAD for a clean tree), never in the caller's: the providers check it
 * there, `patches/builder-N.patch` records it after each attempt, and only
 * a `done` run applies the last patch to the caller's working tree, never
 * its index. A patch that does not apply blocks the run; the caller's tree
 * is left as it was.
 *
 * graph.json refresh and context pack → builder → host signals → (a
 * re-entry on `reenter` signals, at most one per signal kind, each followed
 * by host signals) → reviewer with every pass as
 * facts (brief §4.7B.6) → when the review has high or medium findings, one
 * builder re-entry with them → host signals → one re-review. The run record
 * is written after every step. The run is `done` only when the last review is
 * done with no high or medium finding, the last verify signal passed and no
 * re-entry signal remains. Stage failures end the run with a status and
 * reason; only a bad plan source or a non-git project throws.
 */
export async function runBuild(options: RunBuildOptions): Promise<RunRecord> {
	const source = await readPlanSource(options);
	const baseSha = await readHeadSha(options.projectRoot);
	const lean = await readLeanConfig(options.projectRoot);
	const record = await createRunRecord({
		projectRoot: options.projectRoot,
		manifest: {
			id: newRunId(),
			baseSha,
			diffBase: baseSha,
			...(options.specPath
				? { specPath: projectPath(options.projectRoot, options.specPath) }
				: {}),
			...(options.planPath
				? { planPath: projectPath(options.projectRoot, options.planPath) }
				: {}),
			tier: source.tier,
			backend: options.backend.kind,
			reentries: 0,
			findingsReentries: 0,
			snapshotRefs: [],
			status: "running",
			createdAt: new Date().toISOString(),
		},
	});
	if (lean.warning) warn(record, lean.warning);
	if (options.request !== undefined)
		await saveRequest(record, options.projectRoot, source.plan.raw);
	return underRunLock(
		{ options, record, source, lean: lean.config },
		async (run) => {
			await prepareBuilder(run);
			await executeRun(run);
		},
	);
}

export interface RunReviewOptions {
	projectRoot: string;
	/** The git ref the change is diffed against; defaults to `defaultReviewBase`. */
	base?: string;
	/** Optional context for the reviewer: a plan.md path or the request text, not both. */
	planPath?: string;
	request?: string;
	reviewerBackend: BuilderBackend;
	/** Reviewer lenses; `["general"]` when omitted. */
	lenses?: readonly LeanLens[];
	budget?: Partial<RunBudget>;
	signal?: AbortSignal;
	/**
	 * Run once over the change before the reviewer, which gets their signals
	 * as facts; `[createVerifyProvider()]` when omitted. The full default set
	 * (`createDefaultProviders()`) is allowed.
	 */
	providers?: readonly SignalProvider[];
	/** As in `runBuild`; called only when a provider reads the file graph. */
	refreshGraph?: RefreshFileGraph;
}

/**
 * Reviews a change that already exists: the working tree against `base`,
 * through `runBuild`'s reviewer stage (review checkout, bounded diff, envelope
 * repair) with no builder, after one pass of the providers. The record's tier
 * is `review`. The run is `done` when the reviewer finished, whatever it
 * found, and the pass's verify signal passed; with no verify signal or one
 * that did not pass it is `blocked` with an "unverified: …" reason. The
 * findings are in the `reviewer` envelope. An empty change is `blocked`
 * before any session starts. Only a bad plan source, an unknown base or a
 * non-git project throws.
 */
export async function runReview(options: RunReviewOptions): Promise<RunRecord> {
	const { projectRoot } = options;
	const source = await readReviewSource(options);
	const base = options.base ?? (await defaultReviewBase(projectRoot));
	const diffBase = await resolveCommit({ cwd: projectRoot, ref: base });
	const lean = await readLeanConfig(projectRoot);
	const record = await createRunRecord({
		projectRoot,
		manifest: {
			id: newRunId(),
			baseSha: await readHeadSha(projectRoot),
			diffBase,
			...(options.planPath
				? { planPath: projectPath(projectRoot, options.planPath) }
				: {}),
			tier: "review",
			backend: options.reviewerBackend.kind,
			reentries: 0,
			snapshotRefs: [],
			status: "running",
			createdAt: new Date().toISOString(),
		},
	});
	if (lean.warning) warn(record, lean.warning);
	if (options.request !== undefined)
		await saveRequest(record, projectRoot, source.plan.raw);
	const { reviewerBackend, base: _base, providers, ...rest } = options;
	const runOptions: RunBuildOptions = {
		...rest,
		backend: reviewerBackend,
		reviewerBackend,
		providers: providers ?? [createVerifyProvider()],
	};
	return underRunLock(
		{ options: runOptions, record, source, lean: lean.config },
		(run) => reviewOnce(run, base),
	);
}

/** Stands in for the builder's envelope in a review's provider pass. */
const UNDER_REVIEW: Envelope = {
	outcome: "done",
	summary: "an existing change under review",
};

async function reviewOnce(run: Run, base: string): Promise<void> {
	await saveManifest(run.record);
	const { changedFiles } = await readWorktreeChange({
		cwd: run.options.projectRoot,
		base: diffBase(run),
		signal: run.signal,
	});
	if (changedFiles.length === 0)
		return finish(
			run,
			"blocked",
			`nothing to review: no change against ${base}`,
		);
	if (run.options.providers.length > 0 && !(await checkPass(run, UNDER_REVIEW)))
		return;
	const review = await runReviewer(run, "reviewer");
	if (!review) return;
	const gap = reviewGap(run);
	if (review.outcome !== "done") {
		const reasons = [`reviewer: ${review.reason}`, ...(gap ? [gap] : [])];
		return finish(run, review.outcome, reasons.join("; "));
	}
	return gap ? finish(run, "blocked", gap) : finish(run, "done");
}

/** `runBuild`'s verification gap, always worded as unverified: a review never re-enters. */
function reviewGap(run: Run): string | undefined {
	const gap = verificationGap(run, [], "");
	if (gap === undefined || gap.startsWith("unverified")) return gap;
	return `unverified: ${gap}`;
}

/** The merge-base of HEAD with local `main`, else `master`; `HEAD` when neither branch exists. */
export async function defaultReviewBase(projectRoot: string): Promise<string> {
	for (const branch of ["main", "master"]) {
		const base = await readMergeBase({ cwd: projectRoot, ref: branch });
		if (base) return base;
	}
	return "HEAD";
}

interface RunStart {
	options: RunBuildOptions;
	record: RunRecord;
	source: PlanSource;
	lean: ProjectLeanConfig;
}

/**
 * Runs `body` holding the worktree's run lock. The lock is released however
 * the body ends, and anything it throws, including taking the lock and
 * starting the run, ends the run `failed`.
 */
async function underRunLock(
	start: RunStart,
	body: (run: Run) => Promise<void>,
): Promise<RunRecord> {
	const { options, record } = start;
	let run: Run | undefined;
	let release: (() => Promise<void>) | undefined;
	try {
		const lock = await acquireRunLock({
			worktree: options.projectRoot,
			runId: record.manifest.id,
		});
		if (!lock.acquired) {
			await finishRecord(record, "blocked", lockedOut(lock.holder));
			return record;
		}
		release = lock.release;
		run = startRun(start);
		await body(run);
	} catch (error) {
		const aborted = run && abortReason(run);
		await finishRecord(
			record,
			"failed",
			aborted ?? `runner error: ${errorMessage(error)}`,
		);
	} finally {
		try {
			if (run) await closeRun(run);
		} finally {
			await release?.();
		}
	}
	return record;
}

/** Writes the pr body, then removes the builder worktree. */
async function closeRun(run: Run): Promise<void> {
	try {
		await recordPrBody(run);
	} finally {
		await disposeBuilder(run);
	}
}

/** A cleanup failure is a warning, never a throw. */
async function disposeBuilder(run: Run): Promise<void> {
	if (!run.builder) return;
	const warnings = await run.builder.dispose();
	if (warnings.length === 0) return;
	for (const warning of warnings)
		warn(run.record, `builder worktree cleanup: ${warning}`);
	await saveManifest(run.record).catch(() => undefined);
}

/**
 * Writes `pr-body.md` once a stage left an envelope or a provider pass ran;
 * a run that produced nothing has nothing to describe. A failed body is a
 * warning; only a manifest that cannot be saved at all throws.
 */
async function recordPrBody(run: Run): Promise<void> {
	const { record } = run;
	const ranAnything =
		Object.keys(record.envelopes).length > 0 || record.facts.passes.length > 0;
	if (!ranAnything) return;
	try {
		await writeRunPrBody({
			record,
			projectRoot: run.options.projectRoot,
			worktree: run.worktree,
			plan: run.plan,
			tier: planTier(run),
		});
	} catch (error) {
		warn(record, `pr body not written: ${errorMessage(error)}`);
	}
	await saveManifestOrWarn(record, "after the pr body");
}

/**
 * Saves the manifest; a failed save is recorded as a warning and retried
 * once, and a second failure throws, for the caller's cleanup to run first.
 */
async function saveManifestOrWarn(
	record: RunRecord,
	when: string,
): Promise<void> {
	try {
		await saveManifest(record);
	} catch (error) {
		warn(record, `manifest save failed ${when}: ${errorMessage(error)}`);
		await saveManifest(record);
	}
}

/** `plan` when a plan document came with the change, else the run's own tier. */
function planTier(run: Run): RunTier {
	return run.options.planPath === undefined ? run.tier : "plan";
}

function lockedOut(holder: string): string {
	return `another lean run (${holder}) is active in this worktree`;
}

/** The plan or request a review is read against; with neither, the tier is `review`. */
async function readReviewSource(
	options: RunReviewOptions,
): Promise<PlanSource> {
	if (options.planPath !== undefined && options.request !== undefined)
		throw new Error("runReview takes planPath or request, not both");
	if (options.planPath === undefined && options.request === undefined)
		return { tier: "review", plan: directPlan("") };
	return readPlanSource(options);
}

async function readPlanSource(
	options: Pick<RunBuildOptions, "projectRoot" | "planPath" | "request">,
): Promise<PlanSource> {
	if ((options.planPath === undefined) === (options.request === undefined))
		throw new Error("runBuild needs exactly one of planPath and request");
	if (options.planPath !== undefined) {
		const planFile = resolve(options.projectRoot, options.planPath);
		return { tier: "plan", plan: parsePlan(await readFile(planFile, "utf-8")) };
	}
	const request = options.request?.trim() ?? "";
	if (request === "") throw new Error("the direct request is empty");
	return { tier: "direct", plan: directPlan(request) };
}

/**
 * A direct request reads as a plan whose approach is the request and whose
 * touches are the paths it names, so the context pack has a repo map.
 */
function directPlan(request: string): ParsedPlan {
	return {
		title: "Direct request",
		approach: request,
		touches: requestPaths(request),
		reuses: [],
		behaviors: [],
		risks: [],
		raw: request,
	};
}

/** `lean` from the project config; an unreadable config leaves defaults and a warning. */
async function readLeanConfig(
	projectRoot: string,
): Promise<{ config: ProjectLeanConfig; warning?: string }> {
	try {
		return { config: (await loadProjectConfig(projectRoot)).lean ?? {} };
	} catch (error) {
		return {
			config: {},
			warning: `lean config: ${errorMessage(error)}; using the default budgets`,
		};
	}
}

function resolveBudget(
	options: RunBuildOptions,
	lean: ProjectLeanConfig,
): RunBudget {
	const timeMs =
		options.budget?.timeMs ?? lean.budget?.timeMs ?? DEFAULT_RUN_BUDGET.timeMs;
	return {
		tokens:
			options.budget?.tokens ??
			lean.budget?.tokens ??
			DEFAULT_RUN_BUDGET.tokens,
		timeMs: Math.min(timeMs, MAX_RUN_TIME_MS),
	};
}

function startRun(start: RunStart): Run {
	const { options, record, source, lean } = start;
	const budget = resolveBudget(options, lean);
	const deadline = AbortSignal.timeout(budget.timeMs);
	const { manifest } = record;
	manifest.budget = budget;
	manifest.lenses = [...(options.lenses ?? DEFAULT_LENSES)];
	if (manifest.tier !== "review") {
		recordHealthHook(record, options.backend);
		if (options.backend.permissions)
			manifest.permissions = options.backend.permissions;
	}
	return {
		options,
		record,
		plan: source.plan,
		tier: source.tier,
		lean,
		basePrompt: builderPrompt({
			plan: source.plan,
			contextPack: options.contextPack,
			tier: source.tier,
		}),
		budget,
		explicitTokens:
			options.budget?.tokens !== undefined || lean.budget?.tokens !== undefined,
		deadline,
		signal: options.signal
			? AbortSignal.any([options.signal, deadline])
			: deadline,
		stage: "builder-1",
		worktree: options.projectRoot,
	};
}

/** The builder's post-edit health hook runs only in Pi sessions (brief 4.7A). */
function recordHealthHook(record: RunRecord, backend: BuilderBackend): void {
	record.manifest.healthHook =
		backend.kind === "pi" ? "pi" : "none (external backend)";
	if (backend.kind !== "pi")
		warn(
			record,
			`${backend.kind}: the post-edit health hook and the lean role guard run only in Pi sessions (brief 4.7A)`,
		);
}

/**
 * Opens the builder worktree, refreshes graph.json there, then replaces the
 * plan-only prompt with the context pack unless the caller supplied one. An
 * already-aborted run skips this so the builder stage reports the abort.
 */
async function prepareBuilder(run: Run): Promise<void> {
	await saveManifest(run.record);
	if (abortReason(run)) return;
	await isolateBuilder(run);
	const refresh = await refreshGraph(run, "start");
	if (run.options.contextPack === undefined) await useContextPack(run, refresh);
	else run.record.manifest.contextPack = "supplied";
	await saveManifest(run.record);
}

/**
 * Takes the attempt-1 snapshot of the caller's tree, which becomes the diff
 * base so work that predates the run is not the builder's, and opens the
 * builder worktree on it (on HEAD when the tree was clean).
 */
async function isolateBuilder(run: Run): Promise<void> {
	run.stage = "builder worktree";
	const { manifest } = run.record;
	const { projectRoot } = run.options;
	const ref = await snapshotBeforeBuilder({
		projectRoot,
		runId: manifest.id,
		attempt: 1,
		signal: run.signal,
	});
	if (ref) {
		manifest.snapshotRefs.push(ref);
		manifest.diffBase = await resolveCommit({
			cwd: projectRoot,
			ref,
			signal: run.signal,
		});
	}
	run.builder = await openBuilderWorktree({
		projectRoot,
		ref: diffBase(run),
		signal: run.signal,
	});
	run.worktree = run.builder.projectDir;
	manifest.builderWorktree = run.worktree;
	await saveManifest(run.record);
}

/** Never fails the run: without a graph or on any error the builder gets the plan alone. */
async function useContextPack(
	run: Run,
	refresh: FileGraphRefresh,
): Promise<void> {
	run.stage = "context pack";
	const { manifest } = run.record;
	manifest.contextPack = "plan-only";
	if (refresh.outcome === "unavailable")
		return warn(
			run.record,
			`${PLAN_ONLY}; graph.json unavailable: ${refresh.reason}`,
		);
	const paths = {
		touches: run.plan.touches,
		reuses: run.plan.reuses,
		graph: refresh.graph,
		projectRoot: run.worktree,
	};
	const warnings = planPathWarnings(paths);
	for (const warning of warnings) warn(run.record, warning);
	try {
		const pack = await buildContextPack({
			...paths,
			planSection: run.plan.raw,
			budget: run.lean.repoMapBudgetTokens ?? DEFAULT_SLICE_BUDGET_TOKENS,
			warnings,
		});
		run.basePrompt = builderPrompt({
			plan: run.plan,
			contextPack: pack,
			tier: run.tier,
		});
		manifest.contextPack = "built";
	} catch (error) {
		warn(run.record, `${PLAN_ONLY}; ${errorMessage(error)}`);
	}
}

/**
 * Keeps graph.json current for the context pack, blast radius and
 * mutation (brief 4.7B.3), recording each check in the manifest. Only an
 * abort or the deadline escapes; a refresher that throws is `unavailable`.
 */
async function refreshGraph(
	run: Run,
	at: GraphRefreshPoint,
): Promise<FileGraphRefresh> {
	run.stage = `graph refresh (${at})`;
	const refresh = run.options.refreshGraph ?? refreshFileGraph;
	const work = refresh({ projectRoot: run.worktree }).catch(
		(error: unknown): FileGraphRefresh => ({
			outcome: "unavailable",
			reason: errorMessage(error),
		}),
	);
	const result = await untilAborted(work, run.signal);
	const { manifest } = run.record;
	manifest.graph = [...(manifest.graph ?? []), graphRecord(at, result)];
	await saveManifest(run.record);
	return result;
}

function graphRecord(
	at: GraphRefreshPoint,
	result: FileGraphRefresh,
): GraphRefreshRecord {
	if (result.outcome === "current") return { at, outcome: "current" };
	if (result.outcome === "unavailable")
		return { at, outcome: "unavailable", reason: result.reason };
	const reason =
		result.detail === undefined
			? result.cause
			: `${result.cause}: ${result.detail}`;
	return { at, outcome: "regenerated", reason };
}

async function executeRun(run: Run): Promise<void> {
	const verified = await buildAndVerify(run);
	if (!verified) return;
	const review = await runReviewer(run, "reviewer");
	if (!review) return;
	const findings = blockingFindings(review);
	if (review.outcome !== "done" || findings.length === 0)
		return conclude(run, "reviewer", review, gapAfterReentry(run, verified));
	await remediate(run, { review, findings, verified });
}

/**
 * builder-1 and its pass, then the D-4 re-entry with its pass. A second
 * re-entry follows only when every signal failing in pass 2 is a kind that
 * did not run in pass 1 (mutation is skipped while verify or blast-tests
 * fail), so that
 * result reaches a builder; a kind that ran in pass 1 and fails now goes to
 * the reviewer instead. Every kind behind the first re-entry ran in pass 1,
 * so no kind re-enters twice, whatever the provider order.
 */
async function buildAndVerify(run: Run): Promise<Verified | undefined> {
	let builder = await runBuilder(run, "builder-1", run.basePrompt);
	let failing = builder && (await checkPass(run, builder));
	for (const stage of REENTRY_STAGES) {
		if (!builder || !failing) return undefined;
		if (!earnsReentry(run, failing)) return { builder, remaining: failing };
		await recordReentry(run, { stage, failing });
		const prompt = reentryPrompt(run.basePrompt, failing);
		builder = await runBuilder(run, stage, prompt);
		failing = builder && (await checkPass(run, builder));
	}
	return builder && failing ? { builder, remaining: failing } : undefined;
}

/** The first failing pass re-enters; a later one only when no failing kind ran in the pass before. */
function earnsReentry(run: Run, failing: readonly Signal[]): boolean {
	if (failing.length === 0) return false;
	if (run.record.manifest.reentries === 0) return true;
	const previous = run.record.facts.passes.at(-2)?.signals ?? [];
	return failing.every((signal) => !ranIn(previous, signal.kind));
}

/** Whether a provider of `kind` ran in a pass: it produced a signal not marked `data.skipped`. */
function ranIn(signals: readonly Signal[], kind: SignalKind): boolean {
	return signals.some(
		(signal) => signal.kind === kind && !dataFlag(signal, "skipped"),
	);
}

function dataFlag(signal: Signal, key: string): boolean {
	const { data } = signal;
	return (
		typeof data === "object" &&
		data !== null &&
		key in data &&
		(data as Record<string, unknown>)[key] === true
	);
}

/** Counts a signal re-entry in `run.json` with the pass and the kinds behind it. */
async function recordReentry(
	run: Run,
	options: { stage: SignalReentry["stage"]; failing: readonly Signal[] },
): Promise<void> {
	const { manifest, facts } = run.record;
	const pass = facts.passes.length;
	const kinds = [...new Set(options.failing.map((signal) => signal.kind))];
	const reason =
		manifest.reentries === 0
			? `pass ${pass}: ${kinds.join(", ")} failing`
			: `pass ${pass}: ${kinds.join(", ")} failing, and did not run in pass ${pass - 1}`;
	manifest.reentries += 1;
	manifest.reentryReasons = [
		...(manifest.reentryReasons ?? []),
		{ stage: options.stage, pass, kinds, reason },
	];
	await saveManifest(run.record);
}

/**
 * The one remediation (principle 6): builder-4 with the high and medium
 * findings, one provider pass with no further builder turn, then one re-review.
 */
async function remediate(
	run: Run,
	first: { review: Envelope; findings: Finding[]; verified: Verified },
): Promise<void> {
	run.record.manifest.findingsReentries = 1;
	await saveManifest(run.record);
	const prompt = findingsPrompt({
		basePrompt: run.basePrompt,
		findings: first.findings,
		failing: first.verified.remaining,
	});
	const builder = await runBuilder(run, "builder-4", prompt);
	const failing = builder && (await checkPass(run, builder));
	if (!builder || !failing) return;
	const review = await runReviewer(run, "reviewer-2", {
		review: first.review,
		builder,
	});
	if (!review) return;
	const gap = verificationGap(run, failing, "after the findings re-entry");
	await conclude(run, "reviewer-2", review, gap);
}

function blockingFindings(review: Envelope): Finding[] {
	return (review.findings ?? []).filter((finding) =>
		BLOCKING_SEVERITIES.has(finding.severity),
	);
}

/** Runs one provider pass; resolves to its re-entry signals, or undefined when the run ended. */
async function checkPass(
	run: Run,
	envelope: Envelope,
): Promise<Signal[] | undefined> {
	const pass = run.record.facts.passes.length + 1;
	if (readsGraph(run)) await refreshGraph(run, `pass-${pass}`);
	const signals = await runProviders(run, envelope, pass);
	if (!signals) return undefined;
	const failing = reentering(run, signals, pass);
	await saveManifest(run.record);
	return failing;
}

/** Providers that walk graph.json; only they need it refreshed before a review's pass. */
const GRAPH_KINDS: ReadonlySet<SignalKind> = new Set([
	"blast-radius",
	"blast-tests",
	"mutation",
]);

/** A build refreshes before every pass; a review, only for a provider that reads the graph. */
function readsGraph(run: Run): boolean {
	const { providers } = run.options;
	if (run.tier !== "review") return providers.length > 0;
	return providers.some((provider) => GRAPH_KINDS.has(provider.kind));
}

async function runBuilder(
	run: Run,
	stage: BuilderStage,
	prompt: string,
): Promise<Envelope | undefined> {
	if (await stopBeforeStage(run, stage)) return undefined;
	await snapshotAttempt(run, stage);
	const { worktree } = run;
	await dropHealthHookLeftover(run, stage);
	await writeRunBaseSha({ worktree, baseSha: diffBase(run) });
	try {
		const envelope = await runStage(run, stage, run.options.backend, {
			prompt,
			worktree,
			role: "lean/builder",
		});
		if (envelope?.outcome === "done") return envelope;
		if (envelope)
			await finish(run, envelope.outcome, `${stage}: ${envelope.reason}`);
		return undefined;
	} finally {
		await afterBuilder(run, stage);
	}
}

/** Keeps the hook log, clears the base-sha marker and records the attempt's patch, whatever the stage did. */
async function afterBuilder(run: Run, stage: BuilderStage): Promise<void> {
	try {
		await keepHealthHookLog(run, stage);
	} finally {
		try {
			await clearRunBaseSha({ worktree: run.worktree });
		} finally {
			await recordPatch(run, stage);
		}
	}
}

/**
 * Writes `patches/<stage>.patch`: the builder worktree against the diff base,
 * so each patch holds every attempt so far. A failure is a warning, and
 * leaves the run with no current patch to apply.
 */
async function recordPatch(run: Run, stage: BuilderStage): Promise<void> {
	if (!run.builder) return;
	run.patch = undefined;
	const path = join(run.record.dir, RUN_RECORD_FILES.patches, `${stage}.patch`);
	try {
		const patch = await readWorktreePatch({
			cwd: run.worktree,
			base: diffBase(run),
		});
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, patch);
		run.patch = path;
		const { manifest } = run.record;
		manifest.patches = [
			...(manifest.patches ?? []),
			relative(run.options.projectRoot, path),
		];
	} catch (error) {
		warn(run.record, `${stage} patch not written: ${errorMessage(error)}`);
	}
	await saveManifest(run.record);
}

/** Drops what an earlier stage or run left in the hook log; a failure is a warning. */
async function dropHealthHookLeftover(
	run: Run,
	stage: BuilderStage,
): Promise<void> {
	try {
		await takeHealthHookLog({ worktree: run.worktree });
	} catch (error) {
		warn(
			run.record,
			`health hook log not cleared before ${stage}: ${errorMessage(error)}`,
		);
	}
}

/**
 * Moves what the health hook logged during `stage` into the run record's
 * `health-hook.jsonl`, each line tagged with the stage. A failure is a
 * warning; only a manifest that cannot be saved at all throws.
 */
async function keepHealthHookLog(run: Run, stage: BuilderStage): Promise<void> {
	try {
		const text = await takeHealthHookLog({ worktree: run.worktree });
		const lines = text
			.split("\n")
			.filter((line) => line.trim() !== "")
			.map((line) => `${tagStage(line, stage)}\n`);
		if (lines.length === 0) return;
		await appendFile(
			join(run.record.dir, RUN_RECORD_FILES.healthHook),
			lines.join(""),
		);
	} catch (error) {
		warn(run.record, `health hook log not kept: ${errorMessage(error)}`);
		await saveManifestOrWarn(run.record, "after the health hook log");
	}
}

/** `{"stage":…,…entry}`; a line that is not a JSON object is kept as it is. */
function tagStage(line: string, stage: BuilderStage): string {
	try {
		const entry: unknown = JSON.parse(line);
		if (typeof entry === "object" && entry !== null && !Array.isArray(entry))
			return JSON.stringify({ stage, ...entry });
	} catch {}
	return line;
}

const ATTEMPTS: Record<BuilderStage, number> = {
	"builder-1": 1,
	"builder-2": 2,
	"builder-3": 3,
	"builder-4": 4,
};

/** Snapshots the builder worktree before a later attempt; `isolateBuilder` took attempt 1. */
async function snapshotAttempt(run: Run, stage: BuilderStage): Promise<void> {
	if (stage === "builder-1") return;
	const { manifest } = run.record;
	const ref = await snapshotBeforeBuilder({
		projectRoot: run.worktree,
		runId: manifest.id,
		attempt: ATTEMPTS[stage],
		signal: run.signal,
	});
	if (!ref) return;
	manifest.snapshotRefs.push(ref);
	await saveManifest(run.record);
}

function diffBase(run: Run): string {
	return run.record.manifest.diffBase ?? run.record.manifest.baseSha;
}

async function runProviders(
	run: Run,
	envelope: Envelope,
	pass: number,
): Promise<Signal[] | undefined> {
	const context = await signalContext(run, envelope);
	const signals: Signal[] = [];
	run.record.facts.passes.push({ pass, signals });
	await saveFacts(run.record);
	for (const provider of run.options.providers) {
		run.stage = `${provider.kind} provider (pass ${pass})`;
		signals.push(
			await runProvider(
				provider,
				{ ...context, priorSignals: [...signals] },
				run.signal,
			),
		);
		await saveFacts(run.record);
		const reason = abortReason(run);
		if (reason) return stopWith(run, reason);
	}
	return signals;
}

async function signalContext(
	run: Run,
	envelope: Envelope,
): Promise<SignalContext> {
	const { worktree } = run;
	const base = diffBase(run);
	const { changedFiles } = await readWorktreeChange({
		cwd: worktree,
		base,
		signal: run.signal,
	});
	return {
		worktree,
		baseSha: base,
		plan: run.plan,
		tier: planTier(run),
		envelope,
		changedFiles,
		budget: run.budget,
		runDir: run.record.dir,
		signal: run.signal,
	};
}

/** A provider that throws informs the reviewer as a `fail`; it never re-enters the builder. */
async function runProvider(
	provider: SignalProvider,
	context: SignalContext,
	signal: AbortSignal,
): Promise<Signal> {
	try {
		return await untilAborted(provider.run(context), signal);
	} catch (error) {
		return {
			kind: provider.kind,
			status: "fail",
			summary: `${provider.kind} provider threw: ${errorMessage(error)}`,
			data: { error: errorMessage(error) },
			reenter: false,
		};
	}
}

/** Signals of other kinds that ask to re-enter stay in the facts as-is and leave a warning. */
function reentering(
	run: Run,
	signals: readonly Signal[],
	pass: number,
): Signal[] {
	for (const signal of signals) {
		if (signal.reenter && !REENTRY_KINDS.has(signal.kind))
			warn(
				run.record,
				`pass ${pass}: ${signal.kind} asked to re-enter the builder; ruling D-4 lets only verify, blast-tests and mutation re-enter`,
			);
	}
	return signals.filter(
		(signal) => signal.reenter && REENTRY_KINDS.has(signal.kind),
	);
}

/** Opens a review checkout, writes the full diff into it, and runs one review. */
async function runReviewer(
	run: Run,
	stage: ReviewerStage,
	earlier?: { review: Envelope; builder: Envelope },
): Promise<Envelope | undefined> {
	if (await stopBeforeStage(run, stage)) return undefined;
	const checkout = await openCheckout(run);
	try {
		await recordCheckout(run, checkout);
		const fullDiffPath = await writeFullDiff(run, stage, checkout);
		return await runStage(run, stage, run.options.reviewerBackend, {
			prompt: reviewerPrompt({
				plan: run.plan,
				tier: run.tier,
				facts: run.record.facts,
				diff: checkout.diff,
				changedFiles: checkout.changedFiles,
				lenses: run.record.manifest.lenses ?? DEFAULT_LENSES,
				fullDiffPath,
				...(earlier ? { earlier } : {}),
			}),
			worktree: checkout.worktree,
			role: "lean/code-reviewer",
		});
	} finally {
		const warning = await checkout.dispose();
		if (warning) {
			warn(run.record, warning);
			await saveManifest(run.record);
		}
	}
}

/** A build's reviewer reads the builder's patch; a review's, the caller's tree. */
function openCheckout(run: Run): Promise<ReviewCheckout> {
	const base = diffBase(run);
	const { projectRoot } = run.options;
	if (!run.builder)
		return openReviewCheckout({ projectRoot, base, signal: run.signal });
	return openBuilderReviewCheckout({
		projectRoot,
		base,
		patchPath: run.patch,
		builderDir: run.worktree,
		signal: run.signal,
	});
}

/**
 * `full.diff` at the root of a private checkout; in place, `<stage>.diff` in the
 * run directory, which the reviewer can read and git ignores.
 */
async function writeFullDiff(
	run: Run,
	stage: ReviewerStage,
	checkout: ReviewCheckout,
): Promise<string> {
	const path =
		checkout.kind === "private"
			? join(checkout.worktree, "full.diff")
			: join(run.record.dir, `${stage}.diff`);
	await writeFile(path, checkout.diff);
	return path;
}

async function recordCheckout(
	run: Run,
	checkout: ReviewCheckout,
): Promise<void> {
	run.record.manifest.reviewWorkspace = checkout.kind;
	for (const warning of checkout.warnings) warn(run.record, warning);
	await saveManifest(run.record);
}

async function conclude(
	run: Run,
	stage: ReviewerStage,
	review: Envelope,
	gap: string | undefined,
): Promise<void> {
	if (review.outcome !== "done") {
		const reasons = [`${stage}: ${review.reason}`, ...(gap ? [gap] : [])];
		return finish(run, review.outcome, reasons.join("; "));
	}
	const open = blockingFindings(review);
	const reasons = [
		...(gap ? [gap] : []),
		...(open.length > 0
			? [
					`${stage} still reports ${open.length} high or medium finding(s): ${open.map((finding) => finding.id).join(", ")}`,
				]
			: []),
	];
	return reasons.length > 0
		? finish(run, "blocked", reasons.join("; "))
		: finish(run, "done");
}

/** No kind re-enters twice, so after two re-entries each failing kind had one. */
function gapAfterReentry(run: Run, verified: Verified): string | undefined {
	const after =
		run.record.manifest.reentries > 1
			? "after one re-entry each"
			: "after one re-entry";
	return verificationGap(run, verified.remaining, after);
}

/** Why the run cannot be `done` whatever the reviewer said, if anything. */
function verificationGap(
	run: Run,
	remaining: readonly Signal[],
	after: string,
): string | undefined {
	if (remaining.length > 0)
		return `re-entry signals still failing ${after}: ${remaining.map((signal) => signal.kind).join(", ")}`;
	if (run.options.providers.length === 0)
		return "unverified: no providers configured";
	const verify =
		run.record.facts.passes
			.at(-1)
			?.signals.filter((signal) => signal.kind === "verify") ?? [];
	if (verify.length === 0) return "unverified: no verify signal";
	const failed = verify.find((signal) => signal.status !== "pass");
	return (
		failed &&
		`verification did not pass (${verifyState(failed)}): ${failed.summary}`
	);
}

function verifyState(signal: Signal): string {
	return dataFlag(signal, "unverified")
		? `${signal.status}, unverified`
		: signal.status;
}

/**
 * Runs one backend session and records its stats and envelope. Output with
 * no valid envelope gets one repair turn; the run ends when that fails too.
 */
async function runStage(
	run: Run,
	stage: RunStage,
	backend: BuilderBackend,
	input: StageInput,
): Promise<Envelope | undefined> {
	const text = await runSession(run, { stage, backend, input, repair: false });
	if (text === undefined) return undefined;
	const parsed = parseStageEnvelope(text);
	if (parsed.ok) return accept(run, stage, parsed.envelope);
	return repairStage(run, {
		stage,
		backend,
		input,
		reason: parsed.reason,
		output: text,
	});
}

/** The same role re-emits only its envelope in a read-only session (ruling M-1). */
async function repairStage(
	run: Run,
	failed: {
		stage: RunStage;
		backend: BuilderBackend;
		input: StageInput;
		reason: string;
		output: string;
	},
): Promise<Envelope | undefined> {
	const { stage, reason } = failed;
	const prompt = repairPrompt({
		reviewer: failed.input.role === "lean/code-reviewer",
		reason,
		output: failed.output,
	});
	const text = await runSession(run, {
		stage,
		backend: failed.backend,
		input: { ...failed.input, prompt },
		repair: true,
	});
	const parsed = text === undefined ? undefined : parseStageEnvelope(text);
	await recordRepair(run, { stage, reason, repaired: parsed?.ok === true });
	if (!parsed) return undefined;
	if (parsed.ok) return accept(run, stage, parsed.envelope);
	return stopWith(
		run,
		`${stage}: invalid envelope: ${reason}; repair turn: ${parsed.reason}`,
	);
}

/** Resolves to the session's final text, or undefined once a backend error has ended the run. */
async function runSession(
	run: Run,
	session: {
		stage: RunStage;
		backend: BuilderBackend;
		input: StageInput;
		repair: boolean;
	},
): Promise<string | undefined> {
	const { stage, repair } = session;
	run.stage = repair ? `${stage} repair` : stage;
	const started = Date.now();
	const work = session.backend.run({
		...session.input,
		taskId: builderTaskId(run.record.manifest.id),
		...(repair ? { readonly: true } : {}),
		signal: run.signal,
	});
	const result = await untilAborted(work, run.signal).catch(
		(error: unknown) => new Error(errorMessage(error)),
	);
	await recordStats(run, session, Date.now() - started, result);
	if (!(result instanceof Error))
		return afterSession(run, session.backend, result);
	const reason =
		abortReason(run) ?? `${run.stage}: backend error: ${result.message}`;
	return stopWith(run, reason);
}

async function accept(
	run: Run,
	stage: RunStage,
	envelope: Envelope,
): Promise<Envelope> {
	await saveEnvelope(run.record, stage, envelope);
	return envelope;
}

async function recordRepair(run: Run, repair: EnvelopeRepair): Promise<void> {
	const { manifest } = run.record;
	manifest.repairs = [...(manifest.repairs ?? []), repair];
	await saveManifest(run.record);
}

/**
 * The session's text, unless its usage ends the run right away, before any
 * provider pass: `failed` once the token budget is overrun, and `blocked`
 * when the caller set a token budget and the backend reported no usage, so
 * the budget cannot be enforced.
 */
async function afterSession(
	run: Run,
	backend: BuilderBackend,
	result: BackendRunResult,
): Promise<string | undefined> {
	if (!result.stats && run.explicitTokens) {
		await finish(
			run,
			"blocked",
			`budget unenforceable (${backend.kind} reported no token usage)`,
		);
		return undefined;
	}
	const overrun = tokenOverrun(run);
	if (overrun) return stopWith(run, overrun);
	return result.text;
}

/**
 * Counts input + output tokens; cache reads and writes do not spend the
 * budget. Under the default budget a session that reports no stats spends
 * none, which the manifest says once; under a caller's budget
 * `afterSession` ends the run instead.
 */
async function recordStats(
	run: Run,
	session: { stage: RunStage; repair: boolean; backend: BuilderBackend },
	durationMs: number,
	result: BackendRunResult | Error,
): Promise<void> {
	const spawn = result instanceof Error ? undefined : result.stats;
	run.record.stats.push({
		stage: session.stage,
		durationMs,
		...(spawn ? { spawn } : {}),
		...(session.repair ? { repair: true } : {}),
	});
	if (spawn) {
		const used = run.record.manifest.tokensUsed ?? 0;
		run.record.manifest.tokensUsed =
			used + spawn.tokens.input + spawn.tokens.output;
	} else if (!(result instanceof Error) && !run.explicitTokens)
		warnOnce(
			run.record,
			`token budget not enforced: ${session.backend.kind} reports no token stats`,
		);
	await saveStats(run.record);
	await saveManifest(run.record);
}

/** Settles with `work`, or rejects as soon as `signal` aborts even if `work` ignores it. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolvePromise, reject) => {
		const onAbort = () => reject(new Error("aborted"));
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		work
			.then(resolvePromise, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

function abortReason(run: Run): string | undefined {
	if (run.options.signal?.aborted) return `aborted at ${run.stage}`;
	if (run.deadline.aborted) return `time budget exceeded at ${run.stage}`;
	return undefined;
}

function tokenOverrun(run: Run): string | undefined {
	const used = run.record.manifest.tokensUsed ?? 0;
	if (used <= run.budget.tokens) return undefined;
	return `token budget exceeded at ${run.stage}: ${used} of ${run.budget.tokens} input and output tokens used`;
}

async function stopBeforeStage(run: Run, stage: RunStage): Promise<boolean> {
	run.stage = stage;
	const reason = abortReason(run) ?? tokenOverrun(run);
	if (!reason) return false;
	await finish(run, "failed", reason);
	return true;
}

async function stopWith(run: Run, reason: string): Promise<undefined> {
	await finish(run, "failed", reason);
	return undefined;
}

function warn(record: RunRecord, warning: string): void {
	const { manifest } = record;
	manifest.warnings = [...(manifest.warnings ?? []), warning];
}

function warnOnce(record: RunRecord, warning: string): void {
	if (!record.manifest.warnings?.includes(warning)) warn(record, warning);
}

/** A build is `done` only once its last patch is in the caller's working tree. */
async function finish(
	run: Run,
	status: Exclude<RunStatus, "running">,
	reason?: string,
): Promise<void> {
	if (status === "done" && run.builder) {
		const failure = await applyFinalPatch(run);
		if (failure) return finishRecord(run.record, "blocked", failure);
	}
	return finishRecord(run.record, status, reason);
}

/**
 * `git apply` of the last builder patch to the caller's working tree; never
 * the index. git applies a patch whole or not at all, so a failure leaves
 * the tree as it was. Resolves to why the patch is not in the tree, if so.
 */
async function applyFinalPatch(run: Run): Promise<string | undefined> {
	run.stage = "patch apply";
	const { projectRoot } = run.options;
	const path = run.patch;
	if (path === undefined)
		return "the builder's last patch was not written, so nothing was applied to the worktree";
	const patchPath = relative(projectRoot, path);
	const { manifest } = run.record;
	try {
		if ((await stat(path)).size > 0)
			await applyPatch({ cwd: projectRoot, patchPath: path });
		manifest.patchApplied = { path: patchPath, ok: true };
		return undefined;
	} catch (error) {
		manifest.patchApplied = {
			path: patchPath,
			ok: false,
			error: errorMessage(error),
		};
		return `builder patch did not apply to the worktree, which is unchanged: ${patchPath}`;
	}
}

async function finishRecord(
	record: RunRecord,
	status: Exclude<RunStatus, "running">,
	reason?: string,
): Promise<void> {
	record.manifest.status = status;
	if (reason) record.manifest.reason = reason;
	await saveManifest(record);
}

function projectPath(projectRoot: string, path: string): string {
	return relative(projectRoot, resolve(projectRoot, path));
}

function newRunId(): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\..*$/, "");
	return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
