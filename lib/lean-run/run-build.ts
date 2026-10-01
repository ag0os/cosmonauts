import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { DEFAULT_SLICE_BUDGET_TOKENS } from "../architecture-map/index.ts";
import { loadProjectConfig } from "../config/index.ts";
import type { ProjectLeanConfig } from "../config/types.ts";
import type { Envelope, Finding } from "../envelope/index.ts";
import { clearRunBaseSha, writeRunBaseSha } from "./base-sha.ts";
import { buildContextPack } from "./context-pack.ts";
import { parseStageEnvelope } from "./envelope.ts";
import {
	builderTaskId,
	readHeadSha,
	readWorktreeChange,
	resolveCommit,
	snapshotBeforeBuilder,
} from "./git.ts";
import {
	type FileGraphRefresh,
	type RefreshFileGraph,
	refreshFileGraph,
} from "./graph-refresh.ts";
import { parsePlan } from "./plan.ts";
import {
	builderPrompt,
	findingsPrompt,
	reentryPrompt,
	repairPrompt,
	reviewerPrompt,
} from "./prompts.ts";
import {
	createRunRecord,
	saveEnvelope,
	saveFacts,
	saveManifest,
	saveRequest,
	saveStats,
} from "./record.ts";
import { openReviewCheckout, type ReviewCheckout } from "./review-checkout.ts";
import { acquireRunLock } from "./run-lock.ts";
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
} from "./types.ts";

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
 * counted: Pi sessions read hundreds of thousands of cached tokens each.
 */
export const DEFAULT_RUN_BUDGET: RunBudget = {
	tokens: 1_000_000,
	timeMs: 30 * 60_000,
};

const DEFAULT_LENSES: readonly LeanLens[] = ["general"];

/** Ruling D-4: only failing verification and surviving mutants send the builder back. */
const REENTRY_KINDS: ReadonlySet<SignalKind> = new Set(["verify", "mutation"]);

/** Findings at these severities send the builder back once (principle 6). */
const BLOCKING_SEVERITIES: ReadonlySet<Finding["severity"]> = new Set([
	"high",
	"medium",
]);

type BuilderStage = "builder-1" | "builder-2" | "builder-3";
type ReviewerStage = "reviewer" | "reviewer-2";

interface Run {
	options: RunBuildOptions;
	record: RunRecord;
	plan: ParsedPlan;
	tier: RunTier;
	lean: ProjectLeanConfig;
	basePrompt: string;
	budget: RunBudget;
	deadline: AbortSignal;
	/** The caller's signal combined with the deadline. */
	signal: AbortSignal;
	stage: string;
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
 * graph.json refresh and context pack → builder → host signals → (one
 * re-entry on `reenter` signals) → host signals → reviewer with every pass as
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
	const lock = await acquireRunLock({
		worktree: options.projectRoot,
		runId: record.manifest.id,
	});
	if (!lock.acquired) {
		await finishRecord(record, "blocked", lockedOut(lock.holder));
		return record;
	}
	const run = startRun({ options, record, source, lean: lean.config });
	try {
		await prepareBuilder(run);
		await executeRun(run);
	} catch (error) {
		await finish(
			run,
			"failed",
			abortReason(run) ?? `runner error: ${errorMessage(error)}`,
		);
	} finally {
		await lock.release();
	}
	return record;
}

function lockedOut(holder: string): string {
	return `another lean run (${holder}) is active in this worktree`;
}

async function readPlanSource(options: RunBuildOptions): Promise<PlanSource> {
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

/** A direct request reads as a plan whose approach is the request and whose lists are empty. */
function directPlan(request: string): ParsedPlan {
	return {
		title: "Direct request",
		approach: request,
		touches: [],
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
	return {
		tokens:
			options.budget?.tokens ??
			lean.budget?.tokens ??
			DEFAULT_RUN_BUDGET.tokens,
		timeMs:
			options.budget?.timeMs ??
			lean.budget?.timeMs ??
			DEFAULT_RUN_BUDGET.timeMs,
	};
}

function startRun(start: {
	options: RunBuildOptions;
	record: RunRecord;
	source: PlanSource;
	lean: ProjectLeanConfig;
}): Run {
	const { options, record, source, lean } = start;
	const budget = resolveBudget(options, lean);
	const deadline = AbortSignal.timeout(budget.timeMs);
	const { manifest } = record;
	manifest.budget = budget;
	manifest.lenses = [...(options.lenses ?? DEFAULT_LENSES)];
	manifest.healthHook =
		options.backend.kind === "pi" ? "pi" : "none (external backend)";
	if (options.backend.kind !== "pi")
		warn(
			record,
			`${options.backend.kind}: the post-edit health hook and the lean role guard run only in Pi sessions (brief 4.7A)`,
		);
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
		deadline,
		signal: options.signal
			? AbortSignal.any([options.signal, deadline])
			: deadline,
		stage: "builder-1",
	};
}

/**
 * Refreshes graph.json, then replaces the plan-only prompt with the context
 * pack unless the caller supplied one. An already-aborted run skips this so
 * the builder stage reports the abort.
 */
async function prepareBuilder(run: Run): Promise<void> {
	await saveManifest(run.record);
	if (abortReason(run)) return;
	const refresh = await refreshGraph(run, "start");
	if (run.options.contextPack === undefined) await useContextPack(run, refresh);
	else run.record.manifest.contextPack = "supplied";
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
	try {
		const pack = await buildContextPack({
			planSection: run.plan.raw,
			touches: run.plan.touches,
			reuses: run.plan.reuses,
			graph: refresh.graph,
			budget: run.lean.repoMapBudgetTokens ?? DEFAULT_SLICE_BUDGET_TOKENS,
			projectRoot: run.options.projectRoot,
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
	const work = refresh({ projectRoot: run.options.projectRoot }).catch(
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

/** builder-1, its pass, and the D-4 re-entry with its pass when signals ask for one. */
async function buildAndVerify(run: Run): Promise<Verified | undefined> {
	const first = await runBuilder(run, "builder-1", run.basePrompt);
	const failing = first && (await checkPass(run, first));
	if (!first || !failing) return undefined;
	if (failing.length === 0) return { builder: first, remaining: [] };
	run.record.manifest.reentries = 1;
	await saveManifest(run.record);
	const prompt = reentryPrompt(run.basePrompt, failing);
	const second = await runBuilder(run, "builder-2", prompt);
	const remaining = second && (await checkPass(run, second));
	return second && remaining ? { builder: second, remaining } : undefined;
}

/**
 * The one remediation (principle 6): builder-3 with the high and medium
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
	const builder = await runBuilder(run, "builder-3", prompt);
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
	if (run.options.providers.length > 0) await refreshGraph(run, `pass-${pass}`);
	const signals = await runProviders(run, envelope, pass);
	if (!signals) return undefined;
	const failing = reentering(run, signals, pass);
	await saveManifest(run.record);
	return failing;
}

async function runBuilder(
	run: Run,
	stage: BuilderStage,
	prompt: string,
): Promise<Envelope | undefined> {
	if (await stopBeforeStage(run, stage)) return undefined;
	await snapshotAttempt(run, stage);
	const worktree = run.options.projectRoot;
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
		await clearRunBaseSha({ worktree });
	}
}

const ATTEMPTS: Record<BuilderStage, number> = {
	"builder-1": 1,
	"builder-2": 2,
	"builder-3": 3,
};

/** The attempt-1 snapshot becomes the diff base, so work that predates the run is not the builder's. */
async function snapshotAttempt(run: Run, stage: BuilderStage): Promise<void> {
	const { manifest } = run.record;
	const ref = await snapshotBeforeBuilder({
		projectRoot: run.options.projectRoot,
		runId: manifest.id,
		attempt: ATTEMPTS[stage],
		signal: run.signal,
	});
	if (!ref) return;
	manifest.snapshotRefs.push(ref);
	if (stage === "builder-1")
		manifest.diffBase = await resolveCommit({
			cwd: run.options.projectRoot,
			ref,
			signal: run.signal,
		});
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
	const worktree = run.options.projectRoot;
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
				`pass ${pass}: ${signal.kind} asked to re-enter the builder; ruling D-4 lets only verify and mutation re-enter`,
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
	const checkout = await openReviewCheckout({
		projectRoot: run.options.projectRoot,
		base: diffBase(run),
		signal: run.signal,
	});
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

/**
 * `full.diff` at the root of a private clone; in place, `<stage>.diff` in the
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

function gapAfterReentry(run: Run, verified: Verified): string | undefined {
	return verificationGap(run, verified.remaining, "after one re-entry");
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
	const data = signal.data;
	const unverified =
		typeof data === "object" &&
		data !== null &&
		"unverified" in data &&
		data.unverified === true;
	return unverified ? `${signal.status}, unverified` : signal.status;
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
	await recordStats(run, { stage, repair }, Date.now() - started, result);
	if (!(result instanceof Error)) return result.text;
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

/** Counts input + output tokens; cache reads and writes do not spend the budget. */
async function recordStats(
	run: Run,
	session: { stage: RunStage; repair: boolean },
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
	}
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

function finish(
	run: Run,
	status: Exclude<RunStatus, "running">,
	reason?: string,
): Promise<void> {
	return finishRecord(run.record, status, reason);
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
