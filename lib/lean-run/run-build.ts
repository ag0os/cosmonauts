import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Envelope } from "../envelope/index.ts";
import { clearRunBaseSha, writeRunBaseSha } from "./base-sha.ts";
import { parseStageEnvelope } from "./envelope.ts";
import {
	builderTaskId,
	readHeadSha,
	readWorktreeChange,
	resolveCommit,
	snapshotBeforeBuilder,
} from "./git.ts";
import { parsePlan } from "./plan.ts";
import { builderPrompt, reentryPrompt, reviewerPrompt } from "./prompts.ts";
import {
	createRunRecord,
	saveEnvelope,
	saveFacts,
	saveManifest,
	saveStats,
} from "./record.ts";
import { openReviewCheckout, type ReviewCheckout } from "./review-checkout.ts";
import type {
	BackendRunInput,
	BackendRunResult,
	BuilderBackend,
	ParsedPlan,
	RunBudget,
	RunRecord,
	RunStage,
	RunStatus,
	Signal,
	SignalContext,
	SignalKind,
	SignalProvider,
} from "./types.ts";

export interface RunBuildOptions {
	projectRoot: string;
	planPath: string;
	specPath?: string;
	/** Verbatim builder prompt; without it the builder gets the plan and the envelope instruction. */
	contextPack?: string;
	backend: BuilderBackend;
	reviewerBackend: BuilderBackend;
	providers: readonly SignalProvider[];
	budget?: RunBudget;
	signal?: AbortSignal;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
	tokens: 200_000,
	timeMs: 30 * 60_000,
};

/** Ruling D-4: only failing verification and surviving mutants send the builder back. */
const REENTRY_KINDS: ReadonlySet<SignalKind> = new Set(["verify", "mutation"]);

interface Run {
	options: RunBuildOptions;
	record: RunRecord;
	plan: ParsedPlan;
	basePrompt: string;
	budget: RunBudget;
	deadline: AbortSignal;
	/** The caller's signal combined with the deadline. */
	signal: AbortSignal;
	stage: string;
}

type StageInput = Omit<BackendRunInput, "signal" | "taskId">;

/**
 * builder → host signals → (one re-entry on `reenter` signals) → host signals
 * → reviewer with every pass as facts (brief §4.7B.6), writing the run record
 * after every step. The run is `done` only when the reviewer is done, the last
 * verify signal passed and no re-entry signal remains. Stage failures end the
 * run with a status and reason; only a missing plan or a non-git project throws.
 */
export async function runBuild(options: RunBuildOptions): Promise<RunRecord> {
	const planFile = resolve(options.projectRoot, options.planPath);
	const plan = parsePlan(await readFile(planFile, "utf-8"));
	const baseSha = await readHeadSha(options.projectRoot);
	const record = await createRunRecord({
		projectRoot: options.projectRoot,
		manifest: {
			id: newRunId(),
			baseSha,
			diffBase: baseSha,
			...(options.specPath
				? { specPath: projectPath(options.projectRoot, options.specPath) }
				: {}),
			planPath: projectPath(options.projectRoot, options.planPath),
			backend: options.backend.kind,
			reentries: 0,
			snapshotRefs: [],
			status: "running",
			createdAt: new Date().toISOString(),
		},
	});
	const run = startRun(options, record, plan);
	try {
		await executeRun(run);
	} catch (error) {
		await finish(
			run,
			"failed",
			abortReason(run) ?? `runner error: ${errorMessage(error)}`,
		);
	}
	return record;
}

function startRun(
	options: RunBuildOptions,
	record: RunRecord,
	plan: ParsedPlan,
): Run {
	const budget = options.budget ?? DEFAULT_RUN_BUDGET;
	const deadline = AbortSignal.timeout(budget.timeMs);
	return {
		options,
		record,
		plan,
		basePrompt: builderPrompt({ plan, contextPack: options.contextPack }),
		budget,
		deadline,
		signal: options.signal
			? AbortSignal.any([options.signal, deadline])
			: deadline,
		stage: "builder-1",
	};
}

async function executeRun(run: Run): Promise<void> {
	const first = await runBuilder(run, "builder-1", run.basePrompt);
	const failing = first && (await checkPass(run, first, 1));
	if (!failing) return;
	const remaining = failing.length > 0 ? await reenter(run, failing) : [];
	if (remaining) await runReviewer(run, remaining);
}

/** Runs one provider pass; resolves to its re-entry signals, or undefined when the run ended. */
async function checkPass(
	run: Run,
	envelope: Envelope,
	pass: number,
): Promise<Signal[] | undefined> {
	const signals = await runProviders(run, envelope, pass);
	if (!signals) return undefined;
	const failing = reentering(run, signals, pass);
	await saveManifest(run.record);
	return failing;
}

async function reenter(
	run: Run,
	failing: readonly Signal[],
): Promise<Signal[] | undefined> {
	run.record.manifest.reentries = 1;
	await saveManifest(run.record);
	const prompt = reentryPrompt(run.basePrompt, failing);
	const second = await runBuilder(run, "builder-2", prompt);
	return second && checkPass(run, second, 2);
}

async function runBuilder(
	run: Run,
	stage: "builder-1" | "builder-2",
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

/** The attempt-1 snapshot becomes the diff base, so work that predates the run is not the builder's. */
async function snapshotAttempt(
	run: Run,
	stage: "builder-1" | "builder-2",
): Promise<void> {
	const { manifest } = run.record;
	const ref = await snapshotBeforeBuilder({
		projectRoot: run.options.projectRoot,
		runId: manifest.id,
		attempt: stage === "builder-1" ? 1 : 2,
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
		signals.push(await runProvider(provider, context, run.signal));
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
				run,
				`pass ${pass}: ${signal.kind} asked to re-enter the builder; ruling D-4 lets only verify and mutation re-enter`,
			);
	}
	return signals.filter(
		(signal) => signal.reenter && REENTRY_KINDS.has(signal.kind),
	);
}

async function runReviewer(
	run: Run,
	remaining: readonly Signal[],
): Promise<void> {
	if (await stopBeforeStage(run, "reviewer")) return;
	const checkout = await openReviewCheckout({
		projectRoot: run.options.projectRoot,
		base: diffBase(run),
		signal: run.signal,
	});
	try {
		await recordCheckout(run, checkout);
		const envelope = await runStage(
			run,
			"reviewer",
			run.options.reviewerBackend,
			{
				prompt: reviewerPrompt({
					plan: run.plan,
					facts: run.record.facts,
					diff: checkout.diff,
					changedFiles: checkout.changedFiles,
				}),
				worktree: checkout.worktree,
				role: "lean/code-reviewer",
			},
		);
		if (envelope) await conclude(run, envelope, remaining);
	} finally {
		const warning = await checkout.dispose();
		if (warning) {
			warn(run, warning);
			await saveManifest(run.record);
		}
	}
}

async function recordCheckout(
	run: Run,
	checkout: ReviewCheckout,
): Promise<void> {
	run.record.manifest.reviewWorkspace = checkout.kind;
	for (const warning of checkout.warnings) warn(run, warning);
	await saveManifest(run.record);
}

async function conclude(
	run: Run,
	review: Envelope,
	remaining: readonly Signal[],
): Promise<void> {
	const gap = verificationGap(run, remaining);
	if (review.outcome !== "done") {
		const reasons = [`reviewer: ${review.reason}`, ...(gap ? [gap] : [])];
		return finish(run, review.outcome, reasons.join("; "));
	}
	return gap ? finish(run, "blocked", gap) : finish(run, "done");
}

/** Why the run cannot be `done` whatever the reviewer said, if anything. */
function verificationGap(
	run: Run,
	remaining: readonly Signal[],
): string | undefined {
	if (remaining.length > 0)
		return `re-entry signals still failing after one re-entry: ${remaining.map((signal) => signal.kind).join(", ")}`;
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

/** Runs one backend session, records its stats and envelope, and ends the run when the output has no valid envelope. */
async function runStage(
	run: Run,
	stage: RunStage,
	backend: BuilderBackend,
	input: StageInput,
): Promise<Envelope | undefined> {
	run.stage = stage;
	const started = Date.now();
	const work = backend.run({
		...input,
		taskId: builderTaskId(run.record.manifest.id),
		signal: run.signal,
	});
	const result = await untilAborted(work, run.signal).catch(
		(error: unknown) => new Error(errorMessage(error)),
	);
	await recordStats(run, stage, Date.now() - started, result);
	if (result instanceof Error) {
		const reason =
			abortReason(run) ?? `${stage}: backend error: ${result.message}`;
		return stopWith(run, reason);
	}
	const parsed = parseStageEnvelope(result.text);
	if (!parsed.ok)
		return stopWith(run, `${stage}: invalid envelope: ${parsed.reason}`);
	await saveEnvelope(run.record, stage, parsed.envelope);
	return parsed.envelope;
}

async function recordStats(
	run: Run,
	stage: RunStage,
	durationMs: number,
	result: BackendRunResult | Error,
): Promise<void> {
	const spawn = result instanceof Error ? undefined : result.stats;
	run.record.stats.push({ stage, durationMs, ...(spawn ? { spawn } : {}) });
	if (spawn) {
		const used = run.record.manifest.tokensUsed ?? 0;
		run.record.manifest.tokensUsed = used + spawn.tokens.total;
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
	return `token budget exceeded at ${run.stage}: ${used} of ${run.budget.tokens} tokens used`;
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

function warn(run: Run, warning: string): void {
	const { manifest } = run.record;
	manifest.warnings = [...(manifest.warnings ?? []), warning];
}

async function finish(
	run: Run,
	status: Exclude<RunStatus, "running">,
	reason?: string,
): Promise<void> {
	run.record.manifest.status = status;
	if (reason) run.record.manifest.reason = reason;
	await saveManifest(run.record);
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
