import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { DEFAULT_SLICE_BUDGET_TOKENS } from "../architecture-map/index.ts";
import { loadProjectConfig } from "../config/index.ts";
import type { ProjectLeanConfig } from "../config/types.ts";
import type { Envelope, Finding } from "../envelope/index.ts";
import { ownProcesses, ProcessOwner } from "../process/owned-processes.ts";
import { type ListProcesses, listProcesses } from "../process/process-tree.ts";
import { DEFAULT_CHILD_STOP_MS } from "../process/run-child.ts";
import { clearRunBaseSha, writeRunBaseSha } from "./base-sha.ts";
import {
	type BuilderWorkspace,
	openBuilderWorkspace,
} from "./builder-workspace.ts";
import {
	type CallerState,
	checkCallerState,
	describeDrift,
	readCallerState,
	restoreCommand,
} from "./caller-state.ts";
import {
	type CallerTree,
	callerTreeChange,
	callerTreeChangeReason,
	readCallerTree,
} from "./caller-tree.ts";
import {
	confirmGone,
	DEFAULT_CLEANUP_CONFIRM_MS,
	detachedCandidates,
	pathSpellings,
	runningPids,
} from "./cleanup-check.ts";
import { blockedLinksReason } from "./clone-links.ts";
import { buildContextPack, planPathWarnings } from "./context-pack.ts";
import { parseStageEnvelope } from "./envelope.ts";
import {
	applyPatch,
	builderTaskId,
	isAncestor,
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
import { DEFAULT_IGNORED_INPUTS_CAP_BYTES } from "./ignored-inputs.ts";
import { parsePlan, requestPaths } from "./plan.ts";
import {
	builderPrompt,
	findingsPrompt,
	reentryPrompt,
	repairPrompt,
	reviewerPrompt,
	userMessagesSection,
} from "./prompts.ts";
import { createVerifyProvider } from "./providers/verify.ts";
import {
	createRunRecord,
	saveEnvelope,
	saveFacts,
	saveManifest,
	saveRequest,
	saveStats,
	saveUserMessages,
} from "./record.ts";
import {
	openBuilderReviewCheckout,
	openReviewCheckout,
	type ReviewCheckout,
} from "./review-checkout.ts";
import { acquireRunLock, clearUnconfirmedLock } from "./run-lock.ts";
import { writeRunPrBody } from "./run-pr-body.ts";
import { requiredSignalGap, unavailableData } from "./signal-availability.ts";
import type {
	BackendRunInput,
	BackendRunResult,
	BuilderBackend,
	CallerRefDrift,
	DetachedProcess,
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
	SessionStats,
	Signal,
	SignalContext,
	SignalKind,
	SignalProvider,
	SignalReentry,
	StageExitRecord,
	StageProcessExit,
	StageProcessLog,
} from "./types.ts";
import { DEFAULT_REQUIRED_SIGNALS, RUN_RECORD_FILES } from "./types.ts";

export interface RunBuildOptions {
	projectRoot: string;
	/** plan.md, relative to the project root. Exactly one of `planPath` and `request`. */
	planPath?: string;
	/** A direct-tier change with no plan document; it stands in for the plan section. */
	request?: string;
	/**
	 * The user's own messages from the calling session, oldest first. The
	 * builder and reviewer get them verbatim beside the plan or request
	 * (`userMessagesSection`), except in a supplied `contextPack`.
	 */
	userMessages?: readonly string[];
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
	/**
	 * Kinds the last pass must produce, available, for a `done` run. The
	 * host's override (tests, embedding hosts); no tool call sets it. Wins
	 * over `lean.requiredSignals`, which wins over `DEFAULT_REQUIRED_SIGNALS`.
	 */
	requiredSignals?: readonly SignalKind[];
	/** Reviewer lenses; `["general"]` when omitted. */
	lenses?: readonly LeanLens[];
	signal?: AbortSignal;
	/**
	 * Brings graph.json up to date at run start and before each provider
	 * pass; defaults to regenerating it with the architecture-map generator.
	 */
	refreshGraph?: RefreshFileGraph;
	/** How long a stopped stage may take to settle; `STAGE_EXIT_CEILING_MS` when omitted. */
	stageExitCeilingMs?: number;
	/**
	 * How long the run waits at its end for every process it owned to be
	 * gone before it leaves the lock `unconfirmed`; `DEFAULT_CLEANUP_CONFIRM_MS`
	 * (30 s) when omitted.
	 */
	cleanupConfirmMs?: number;
	/**
	 * Start even though the previous run's lock is `unconfirmed` and some of
	 * its processes still run; the cleared pids are recorded in the warnings.
	 */
	clearStaleLock?: boolean;
	/** Test seam: the process listing the cleanup checks take. */
	listProcesses?: ListProcesses;
}

/**
 * How long the host waits for a stage to settle after an abort or the time
 * budget: the child runner's whole escalation, then ten seconds more. A
 * stage still running after it is recorded as unconfirmed and the run ends
 * anyway; its lock is released only once the processes the run owned are
 * confirmed gone (`cleanupConfirmMs`).
 */
export const STAGE_EXIT_CEILING_MS = DEFAULT_CHILD_STOP_MS + 10_000;

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
	/** `userMessagesSection` of the caller's `userMessages`. */
	userSection?: string | undefined;
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
	 * clone's project directory once it is open, the project root before
	 * that and in a review.
	 */
	worktree: string;
	builder?: BuilderWorkspace;
	/** The caller's refs and linked node_modules, read when the builder clone opened. */
	callerState?: CallerState;
	/** The last builder attempt's patch; undefined when it could not be written. */
	patch?: string;
	/** Owns every child process the run starts through the child runner. */
	owner: ProcessOwner;
	/** Owned pids not confirmed gone at the end; the lock keeps them. */
	unconfirmedPids?: number[];
}

interface PlanSource {
	tier: RunTier;
	plan: ParsedPlan;
	userSection?: string | undefined;
}

/** What the builder and verification left for the reviewer. */
interface Verified {
	builder: Envelope;
	/** Re-entry signals that still fail in the last pass. */
	remaining: Signal[];
}

type StageInput = Omit<BackendRunInput, "signal" | "taskId" | "readonly">;

/**
 * Every builder stage runs in a private clone with no remote, detached at
 * the attempt-1 snapshot (HEAD for a clean tree), never in the caller's
 * checkout; the caller's gitignored inputs are copied in and its
 * `node_modules` linked (`openBuilderWorkspace`). The providers check it
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
 * done with no high or medium finding, the last verify signal passed, every
 * required signal kind ran and was available in the last pass, and no
 * re-entry signal remains. Stage failures end the run with a status and
 * reason; only a bad plan source or a non-git project throws.
 */
export async function runBuild(options: RunBuildOptions): Promise<RunRecord> {
	const source: PlanSource = {
		...(await readPlanSource(options)),
		userSection: userMessagesSection(options.userMessages),
	};
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
	if (source.userSection)
		await saveUserMessages(record, options.projectRoot, source.userSection);
	return underRunLock(
		{ options, record, source, lean: lean.config },
		async (run) => {
			await prepareBuilder(run);
			if (!ended(run)) await executeRun(run);
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
	/**
	 * As in `runBuild`, but a required kind with no provider here is not a
	 * gap: only one whose provider ran and could not produce its signal.
	 */
	requiredSignals?: readonly SignalKind[];
	signal?: AbortSignal;
	/**
	 * Run once over the change before the reviewer, which gets their signals
	 * as facts; `[createVerifyProvider()]` when omitted. The full default set
	 * (`createDefaultProviders()`) is allowed.
	 */
	providers?: readonly SignalProvider[];
	/** As in `runBuild`; called only when a provider reads the file graph. */
	refreshGraph?: RefreshFileGraph;
	/** As in `runBuild`. */
	stageExitCeilingMs?: number;
	/** As in `runBuild`. */
	cleanupConfirmMs?: number;
	/** As in `runBuild`. */
	clearStaleLock?: boolean;
	/** As in `runBuild`. */
	listProcesses?: ListProcesses;
}

/**
 * Reviews a change that already exists: the working tree against `base`,
 * through `runBuild`'s reviewer stage (review checkout, bounded diff, envelope
 * repair) with no builder, after one pass of the providers. The record's tier
 * is `review`. The run is `done` when the reviewer finished, whatever it
 * found, and the pass's verify signal passed; with no verify signal or one
 * that did not pass it is `blocked` with an "unverified: …" reason, and with
 * a required signal its provider could not produce, `blocked` with
 * "unverified (<kind> unavailable: <reason>)". The
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
 * Runs `body` holding the worktree's run lock, as the owner of every child
 * process the body starts through the child runner. Anything it throws,
 * including taking the lock and starting the run, ends the run `failed`.
 * Every stage waits for its work to settle (`settleStage`), up to the
 * stage-exit ceiling; then the run waits, up to `cleanupConfirmMs`, for
 * every process it owned to be gone. Only then is the lock released; with
 * processes still running it stays, `unconfirmed`, and names them.
 */
async function underRunLock(
	start: RunStart,
	body: (run: Run) => Promise<void>,
): Promise<RunRecord> {
	const { record } = start;
	let run: Run | undefined;
	let release: ((pids?: readonly number[]) => Promise<void>) | undefined;
	try {
		const lock = await takeRunLock(start);
		if (!lock.acquired) {
			await finishRecord(record, "blocked", lock.reason);
			return record;
		}
		release = lock.release;
		const started = startRun(start);
		run = started;
		await ownProcesses(started.owner, () => body(started));
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
			await release?.(run?.unconfirmedPids);
		}
	}
	return record;
}

type TakenLock =
	| { acquired: true; release(pids?: readonly number[]): Promise<void> }
	| { acquired: false; reason: string };

/**
 * The run lock. A lock the previous run left `unconfirmed` is cleared, with
 * a warning, when none of its pids still runs or the caller set
 * `clearStaleLock`; otherwise the run is refused.
 */
async function takeRunLock(start: RunStart): Promise<TakenLock> {
	const { options, record } = start;
	const lockOptions = {
		worktree: options.projectRoot,
		runId: record.manifest.id,
	};
	const lock = await acquireRunLock(lockOptions);
	if (lock.acquired) return lock;
	if (!lock.unconfirmedPids)
		return { acquired: false, reason: lockedOut(lock.holder) };
	const { running } = await runningPids(lock.unconfirmedPids, {
		list: options.listProcesses ?? listProcesses,
	});
	if (running.length > 0 && !options.clearStaleLock)
		return {
			acquired: false,
			reason: cleanupUnconfirmed(lock.holder, running),
		};
	const cleared = await clearUnconfirmedLock({
		worktree: options.projectRoot,
		runId: lock.holder,
	});
	if (cleared)
		warn(record, clearedLock(lock.holder, lock.unconfirmedPids, running));
	const retried = await acquireRunLock(lockOptions);
	if (retried.acquired) return retried;
	const reason = retried.unconfirmedPids
		? cleanupUnconfirmed(retried.holder, retried.unconfirmedPids)
		: lockedOut(retried.holder);
	return { acquired: false, reason };
}

function cleanupUnconfirmed(holder: string, pids: readonly number[]): string {
	return `previous run cleanup unconfirmed (pids ${pids.join(", ")}): run ${holder} ended while they ran and they may still change this repository; start again once they exit, or with clearStaleLock to proceed anyway`;
}

function clearedLock(
	holder: string,
	pids: readonly number[],
	running: readonly number[],
): string {
	const listed = pids.join(", ");
	if (running.length === 0)
		return `previous run ${holder} left cleanup unconfirmed (pids ${listed}); all have exited, so its lock was cleared`;
	return `clearStaleLock: cleared previous run ${holder}'s unconfirmed lock (pids ${listed}) while pids ${running.join(", ")} still run`;
}

/** Writes the pr body, confirms the run's processes are gone, then deletes the builder clone. */
async function closeRun(run: Run): Promise<void> {
	try {
		await recordPrBody(run);
	} finally {
		try {
			await confirmCleanup(run);
		} finally {
			await disposeBuilder(run);
		}
	}
}

/**
 * Waits up to `cleanupConfirmMs` for every pid the run owns to be gone,
 * including pids a tree listing still running adds meanwhile, with no wait
 * when they already are, and records the rest in `cleanupUnconfirmed`, the
 * reason and a warning; the lock keeps them. Processes outside the run's
 * ownership that name the builder clone are reported as
 * `detachedCandidates`, never counted; children whose descendants could not
 * be enumerated get a warning. Never throws: a check that fails leaves
 * every owned pid unconfirmed.
 */
async function confirmCleanup(run: Run): Promise<void> {
	const owned = run.owner.close();
	run.unconfirmedPids = owned;
	const clone = run.builder?.root;
	if (owned.length === 0 && clone === undefined) return;
	const boundMs = run.options.cleanupConfirmMs ?? DEFAULT_CLEANUP_CONFIRM_MS;
	try {
		const check = await confirmGone(() => run.owner.current(), {
			list: run.options.listProcesses ?? listProcesses,
			boundMs,
			listAlways: clone !== undefined,
		});
		run.unconfirmedPids = check.running;
		if (clone !== undefined && !check.listing)
			warn(
				run.record,
				"detached process scan skipped: no process listing (Windows has none, or ps failed)",
			);
		if (clone !== undefined && check.listing)
			recordDetached(
				run,
				detachedCandidates(check.listing, {
					paths: await pathSpellings(clone),
					owned: [...owned, ...run.owner.current()],
				}),
			);
	} catch (error) {
		warn(run.record, `cleanup check failed: ${errorMessage(error)}`);
	}
	recordUnverifiedTrees(run);
	recordUnconfirmed(run, run.unconfirmedPids, boundMs);
	await saveManifest(run.record).catch(() => undefined);
}

/**
 * Children whose descendants the runner could not enumerate (every natural
 * exit on Windows, a failed `ps`): only their own pids were checked, so
 * their descendants are not confirmed gone and do not hold the lock.
 */
function recordUnverifiedTrees(run: Run): void {
	const trees = run.owner.unverified();
	if (trees.length === 0) return;
	const listed = trees
		.map(
			({ pid, reason, label }) =>
				`pid ${pid} at ${label ?? "an unknown stage"} (${reason})`,
		)
		.join("; ");
	warn(
		run.record,
		`process trees unverified: the descendants of ${listed} could not be enumerated, so they are not confirmed gone and the run lock does not wait for them`,
	);
}

function recordUnconfirmed(
	run: Run,
	pids: readonly number[],
	boundMs: number,
): void {
	if (pids.length === 0) return;
	const { manifest } = run.record;
	manifest.cleanupUnconfirmed = [...pids];
	const note = `cleanup unconfirmed: pids ${pids.join(", ")} the run started were still running ${boundMs} ms after it ended; the run lock stays until they exit`;
	manifest.reason = manifest.reason ? `${manifest.reason}; ${note}` : note;
	warn(run.record, note);
}

function recordDetached(
	run: Run,
	candidates: readonly DetachedProcess[],
): void {
	if (candidates.length === 0) return;
	run.record.manifest.detachedCandidates = [...candidates];
	const listed = candidates
		.map(({ pid, command }) => `${pid} (${command})`)
		.join("; ");
	warn(
		run.record,
		`detached process candidates: still running, not owned by the run and not confirmed gone, their command lines name the builder clone: ${listed}`,
	);
}

/**
 * A cleanup failure is a warning, never a throw. When the last builder
 * attempt's patch was not written, its work exists only in the builder
 * clone, so the clone is kept and its path recorded instead. A clone is a
 * plain directory: deleting it is all the cleanup it needs.
 */
async function disposeBuilder(run: Run): Promise<void> {
	if (!run.builder) return;
	const failure = run.record.manifest.patchFailure;
	if (failure) {
		const { root } = run.builder;
		failure.keptWorktree = root;
		warn(
			run.record,
			`builder clone kept at ${root}: the ${failure.stage} patch was not written, so its work is only there; remove it with \`rm -rf ${dirname(root)}\``,
		);
		await saveManifest(run.record).catch(() => undefined);
		return;
	}
	const warnings = await run.builder.dispose();
	if (warnings.length === 0) return;
	for (const warning of warnings)
		warn(run.record, `builder clone cleanup: ${warning}`);
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

/**
 * `lean` from the project config, with a warning for unknown required kinds;
 * an unreadable config leaves defaults and a warning.
 */
async function readLeanConfig(
	projectRoot: string,
): Promise<{ config: ProjectLeanConfig; warning?: string }> {
	try {
		const config = (await loadProjectConfig(projectRoot)).lean ?? {};
		const warning = unknownRequiredSignalsWarning(config);
		return { config, ...(warning ? { warning } : {}) };
	} catch (error) {
		return {
			config: {},
			warning: `lean config: ${errorMessage(error)}; using the defaults`,
		};
	}
}

function unknownRequiredSignalsWarning(
	lean: ProjectLeanConfig,
): string | undefined {
	const unknown = lean.unknownRequiredSignals ?? [];
	if (unknown.length === 0) return undefined;
	const fallback =
		lean.requiredSignals === undefined
			? "; using the default required signals"
			: "";
	return `lean.requiredSignals: ignored unknown signal kinds ${unknown.join(", ")}${fallback}`;
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

/** The host's override, else `lean.requiredSignals`, else the default; each kind once. */
function resolveRequiredSignals(
	options: RunBuildOptions,
	lean: ProjectLeanConfig,
): SignalKind[] {
	const kinds =
		options.requiredSignals ?? lean.requiredSignals ?? DEFAULT_REQUIRED_SIGNALS;
	return [...new Set(kinds)];
}

function startRun(start: RunStart): Run {
	const { options, record, source, lean } = start;
	const budget = resolveBudget(options, lean);
	const deadline = AbortSignal.timeout(budget.timeMs);
	const { manifest } = record;
	manifest.budget = budget;
	manifest.requiredSignals = resolveRequiredSignals(options, lean);
	manifest.lenses = [...(options.lenses ?? DEFAULT_LENSES)];
	if (manifest.tier !== "review") {
		recordHealthHook(record, options.backend);
		if (options.backend.permissions)
			manifest.permissions = options.backend.permissions;
		if (options.backend.deniedTools)
			manifest.deniedTools = [...options.backend.deniedTools];
	}
	const run: Run = {
		options,
		record,
		plan: source.plan,
		tier: source.tier,
		userSection: source.userSection,
		lean,
		basePrompt: builderPrompt({
			plan: source.plan,
			contextPack: options.contextPack,
			tier: source.tier,
			userSection: source.userSection,
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
		owner: new ProcessOwner({ label: () => run.stage }),
	};
	return run;
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
 * Opens the builder clone, refreshes graph.json there, then replaces the
 * plan-only prompt with the context pack unless the caller supplied one. An
 * already-aborted run skips this so the builder stage reports the abort.
 */
async function prepareBuilder(run: Run): Promise<void> {
	await saveManifest(run.record);
	if (abortReason(run)) return;
	await isolateBuilder(run);
	if (ended(run)) return;
	const refresh = await refreshGraph(run, "start");
	if (run.options.contextPack === undefined) await useContextPack(run, refresh);
	else run.record.manifest.contextPack = "supplied";
	await saveManifest(run.record);
}

/**
 * Takes the attempt-1 snapshot of the caller's tree, which becomes the diff
 * base so work that predates the run is not the builder's, and opens the
 * builder clone on it (on HEAD when the tree was clean), with the snapshot
 * ref fetched in. Then reads the caller's refs and linked `node_modules`,
 * for `isolationBreach`.
 */
async function isolateBuilder(run: Run): Promise<void> {
	run.stage = "builder clone";
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
	run.builder = await openBuilderWorkspace({
		projectRoot,
		commit: diffBase(run),
		...(ref ? { ref } : {}),
		capBytes:
			run.lean.ignoredInputsCapBytes ?? DEFAULT_IGNORED_INPUTS_CAP_BYTES,
		signal: run.signal,
	});
	run.worktree = run.builder.projectDir;
	manifest.builderWorktree = run.worktree;
	manifest.builderInputs = run.builder.inputs;
	for (const warning of run.builder.warnings) warn(run.record, warning);
	const { blocked } = run.builder.inputs.links;
	if (blocked.length > 0)
		return finish(
			run,
			"blocked",
			`${run.stage}: ${blockedLinksReason(blocked)}`,
		);
	run.callerState = await readCallerState({
		projectRoot,
		dependencies: run.builder.dependencies,
	});
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
			userSection: run.userSection,
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
	const settled = await settleStage(run, work);
	if (settled.stoppedBy) {
		await recordStageExit(run, stageExit(run.stage, settled));
		throw new Error("aborted");
	}
	const result = settledValue(settled.result);
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
		const tree = await watchCallerTree(run, stage);
		if (!tree) return undefined;
		const envelope = await runStage(run, stage, run.options.backend, {
			prompt,
			worktree,
			role: "lean/builder",
		});
		if (await callerTreeChanged(run, stage, tree)) return undefined;
		if (!envelope) return undefined;
		const breach = await isolationBreach(run);
		if (breach) {
			await finish(run, "blocked", `${stage}: ${breach}; nothing was applied`);
			return undefined;
		}
		if (envelope.outcome === "done") return envelope;
		await finish(run, envelope.outcome, `${stage}: ${envelope.reason}`);
		return undefined;
	} finally {
		await afterBuilder(run, stage);
	}
}

/** The caller's tree before a builder stage; a tree that cannot be read ends the run `blocked`. */
async function watchCallerTree(
	run: Run,
	stage: BuilderStage,
): Promise<CallerTree | undefined> {
	try {
		return await readCallerTree(run.options.projectRoot);
	} catch (error) {
		await finish(
			run,
			"blocked",
			`${stage}: could not read the caller's working tree before the stage: ${errorMessage(error)}; nothing was applied`,
		);
		return undefined;
	}
}

/** The whole caller-tree compare after a stage that already ended the run. */
const COMPARE_AFTER_STOP_MS = 60_000;

/**
 * Compares the caller's tree with `tree`, also after a stage that ended the
 * run, within `COMPARE_AFTER_STOP_MS` then, and ends the run `blocked` on
 * any change, or when the compare cannot run, keeping a stage's earlier
 * ending in the reason. A stage that had not ended still gets its
 * `isolationBreach`, so ref drift is recorded and named too. Nothing is
 * undone.
 */
async function callerTreeChanged(
	run: Run,
	stage: BuilderStage,
	tree: CallerTree,
): Promise<boolean> {
	const stopped = ended(run);
	let reason: string;
	try {
		const paths = await tree.changes(
			stopped ? { timeoutMs: COMPARE_AFTER_STOP_MS } : {},
		);
		if (paths.length === 0) return false;
		const change = callerTreeChange(stage, paths);
		run.record.manifest.callerTreeChange = change;
		reason = callerTreeChangeReason(change);
	} catch (error) {
		reason = `${stage}: could not compare the caller's working tree after the stage: ${errorMessage(error)}; nothing was applied`;
	}
	const { status, reason: earlier } = run.record.manifest;
	const ending = stopped
		? `; the stage had already ended ${status}: ${earlier}`
		: "";
	const breach = stopped ? undefined : await isolationBreach(run);
	const also = breach ? `; also: ${breach}` : "";
	await finish(run, "blocked", `${reason}${also}${ending}`);
	return true;
}

/**
 * Why the builder's patch cannot go to the caller, if so: the builder
 * clone left the run's snapshot behind, so its patch would undo work that
 * predates the run, or the caller's branch or HEAD moved, a branch or tag
 * of the caller now names an object the builder made, or a linked
 * `node_modules` lost entries, since the clone opened. Every branch or tag
 * drift is recorded as `callerRefDrift`, and drift that is not the
 * builder's is a warning, as is a moved stash. Nothing is repaired. A
 * check that cannot run counts.
 */
async function isolationBreach(run: Run): Promise<string | undefined> {
	const { callerState } = run;
	if (!callerState) return undefined;
	try {
		const base = diffBase(run);
		const descends = await isAncestor({
			cwd: run.worktree,
			ancestor: base,
			ref: "HEAD",
		});
		if (!descends)
			return `the builder clone no longer descends from the run's snapshot ${base}`;
		const check = await checkCallerState(callerState, {
			projectRoot: run.options.projectRoot,
			clone: run.worktree,
		});
		recordRefDrift(run, check.drift);
		for (const warning of check.warnings ?? []) warnOnce(run.record, warning);
		return check.breach;
	} catch (error) {
		return `could not check the builder clone against the caller: ${errorMessage(error)}`;
	}
}

/** Keeps the latest state of every drifted ref in `run.json` and warns once per drift that was not the builder's. */
function recordRefDrift(run: Run, drift: readonly CallerRefDrift[]): void {
	if (drift.length === 0) return;
	const { manifest } = run.record;
	const byRef = new Map(
		(manifest.callerRefDrift ?? []).map((change) => [change.ref, change]),
	);
	for (const change of drift) {
		byRef.set(change.ref, change);
		if (change.action === "warned")
			warnOnce(
				run.record,
				`the caller's branches or tags drifted during the run, not to the builder's objects (reported, not blocked): ${describeDrift(change)}; restore with: ${restoreCommand(change)}`,
			);
	}
	manifest.callerRefDrift = [...byRef.values()];
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
 * Writes `patches/<stage>.patch`: the builder clone against the diff base,
 * so each patch holds every attempt so far. A failure is a warning and
 * `patchFailure`, and leaves the run with no current patch to apply.
 */
async function recordPatch(run: Run, stage: BuilderStage): Promise<void> {
	if (!run.builder) return;
	run.patch = undefined;
	const { manifest } = run.record;
	const path = join(run.record.dir, RUN_RECORD_FILES.patches, `${stage}.patch`);
	try {
		const patch = await readWorktreePatch({
			cwd: run.worktree,
			base: diffBase(run),
		});
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, patch);
		run.patch = path;
		manifest.patches = [
			...(manifest.patches ?? []),
			relative(run.options.projectRoot, path),
		];
		delete manifest.patchFailure;
	} catch (error) {
		manifest.patchFailure = { stage, error: errorMessage(error) };
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

/**
 * Snapshots the builder clone before a later attempt; `isolateBuilder` took
 * attempt 1 in the caller's tree. The ref lives in the clone, so it goes
 * with it; the attempt's patch is the durable record.
 */
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
			await runProvider(run, provider, {
				...context,
				priorSignals: [...signals],
			}),
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

/**
 * A provider that throws informs the reviewer as a `fail` marked
 * unavailable, so a required kind is a gap; it never re-enters the builder. A stopped provider is waited for like any stage.
 */
async function runProvider(
	run: Run,
	provider: SignalProvider,
	context: SignalContext,
): Promise<Signal> {
	const settled = await settleStage(
		run,
		Promise.resolve().then(() => provider.run(context)),
	);
	if (settled.stoppedBy)
		await recordStageExit(run, stageExit(run.stage, settled));
	const { result } = settled;
	if (result.kind === "value") return result.value;
	const message =
		result.kind === "error" ? errorMessage(result.error) : "aborted";
	const summary = `${provider.kind} provider threw: ${message}`;
	return {
		kind: provider.kind,
		status: "fail",
		summary,
		data: { error: message, ...unavailableData(summary) },
		reenter: false,
	};
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
				userSection: run.userSection,
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
		base,
		patchPath: run.patch,
		builderDir: run.worktree,
		signal: run.signal,
	});
}

/**
 * `full.diff` in a private checkout's `worktree`, where its reviewer runs
 * (in a build, the checkout's project directory); in place, `<stage>.diff`
 * in the run directory, which the reviewer can read and git ignores.
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
	const missing = requiredGap(run);
	if (missing) return missing;
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

/** A required kind the last pass could not produce; a review counts only the kinds it ran. */
function requiredGap(run: Run): string | undefined {
	return requiredSignalGap({
		required: run.record.manifest.requiredSignals ?? DEFAULT_REQUIRED_SIGNALS,
		signals: run.record.facts.passes.at(-1)?.signals ?? [],
		absentIsGap: run.record.manifest.tier !== "review",
	});
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
	await recordRequestedModel(run, session);
	const started = Date.now();
	const log = sessionLog(run, repair ? `${stage}-repair` : stage);
	const work = Promise.resolve().then(() =>
		session.backend.run({
			...session.input,
			taskId: builderTaskId(run.record.manifest.id),
			...(repair ? { readonly: true } : {}),
			signal: run.signal,
			processLog: log.processLog,
		}),
	);
	const settled = await settleStage(run, work);
	if (settled.stoppedBy || log.reported)
		await recordStageExit(run, {
			...stageExit(run.stage, settled),
			...(log.reported
				? { process: log.reported, logs: log.relativePaths }
				: {}),
		});
	const result = sessionResult(settled);
	await recordStats(run, session, Date.now() - started, result);
	if (!(result instanceof Error))
		return afterSession(run, session.backend, result);
	const reason =
		abortReason(run) ?? `${run.stage}: backend error: ${result.message}`;
	return stopWith(run, reason);
}

/**
 * The model and effort the backend asks its harness for, once per role,
 * saved with the session's stats. A package that cannot be resolved records
 * nothing; the session then fails with that error itself.
 */
async function recordRequestedModel(
	run: Run,
	session: { backend: BuilderBackend; input: StageInput },
): Promise<void> {
	const { backend, input } = session;
	const key = input.role.slice(input.role.indexOf("/") + 1);
	const { manifest } = run.record;
	if (!backend.requestedModel || manifest.models?.[key]) return;
	const requested = await backend
		.requestedModel(input.role)
		.catch(() => undefined);
	if (requested) manifest.models = { ...manifest.models, [key]: requested };
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
 * provider pass: `failed` once the token budget is overrun, counting what
 * usage was read (a lower bound, which the reason says, when the session's
 * usage is incomplete), and `blocked` when the caller set a token budget and
 * the backend reported no usage or incomplete usage, so the budget cannot be
 * enforced.
 */
async function afterSession(
	run: Run,
	backend: BuilderBackend,
	result: BackendRunResult,
): Promise<string | undefined> {
	const gap = usageGap(backend, result.stats);
	const overrun = tokenOverrun(run);
	if (overrun) {
		const partial = result.stats?.incomplete ? gap : undefined;
		if (partial === undefined) return stopWith(run, overrun);
		warnOnce(run.record, notFullyEnforced(partial));
		return stopWith(
			run,
			`${overrun} (${partial}; counted usage is a lower bound)`,
		);
	}
	if (gap && run.explicitTokens) {
		await finish(run, "blocked", `budget unenforceable (${gap})`);
		return undefined;
	}
	return result.text;
}

/** Why a session's usage cannot be held against the budget, if it cannot. */
function usageGap(
	backend: BuilderBackend,
	stats: SessionStats | undefined,
): string | undefined {
	if (!stats) return `${backend.kind} reported no token usage`;
	if (!stats.incomplete) return undefined;
	return `${backend.kind} usage incomplete: ${stats.incompleteReason ?? "no reason given"}`;
}

function notFullyEnforced(gap: string | undefined): string {
	return `token budget not fully enforced: ${gap}`;
}

/**
 * Counts input + output tokens; cache reads and writes do not spend the
 * budget. Under the default budget a session that reports no stats spends
 * none and one with incomplete stats spends what was read, which the
 * manifest says; under a caller's budget `afterSession` ends the run
 * instead.
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
	if (spawn?.incomplete && !run.explicitTokens)
		warnOnce(run.record, notFullyEnforced(usageGap(session.backend, spawn)));
	await saveStats(run.record);
	await saveManifest(run.record);
}

/** How a stage's work settled, as the host saw it. */
type Settlement<T> =
	| { kind: "value"; value: T }
	| { kind: "error"; error: unknown }
	/** Still running when the ceiling after the stop passed. */
	| { kind: "unconfirmed" };

interface StageSettlement<T> {
	result: Settlement<T>;
	/** Set when an abort or the time budget arrived before the work settled. */
	stoppedBy?: StageExitRecord["stoppedBy"];
}

/**
 * Waits for `work` to settle. An abort or the time budget does not abandon
 * it: the work holds the signal, and an external backend's child runner ends
 * the process tree it can find before it settles (`StageProcessExit` says
 * how that went). Only once `stageExitCeilingMs` has passed since the stop
 * does the host stop waiting, with `unconfirmed`; the processes that work
 * started then hold the lock (`confirmCleanup`), but in-process work and
 * processes started outside the child runner may outlive it.
 */
async function settleStage<T>(
	run: Run,
	work: Promise<T>,
): Promise<StageSettlement<T>> {
	let settled = false;
	let stoppedBy: StageExitRecord["stoppedBy"];
	let timer: NodeJS.Timeout | undefined;
	let onStop = (): void => {};
	const outcome = work.then(
		(value): Settlement<T> => {
			settled = true;
			return { kind: "value", value };
		},
		(error: unknown): Settlement<T> => {
			settled = true;
			return { kind: "error", error };
		},
	);
	const ceiling = new Promise<Settlement<T>>((resolveCeiling) => {
		onStop = () => {
			if (settled) return;
			stoppedBy = stopCause(run);
			timer = setTimeout(
				() => resolveCeiling({ kind: "unconfirmed" }),
				stageExitCeiling(run),
			);
		};
	});
	if (run.signal.aborted) onStop();
	else run.signal.addEventListener("abort", onStop, { once: true });
	try {
		const result = await Promise.race([outcome, ceiling]);
		return stoppedBy ? { result, stoppedBy } : { result };
	} finally {
		clearTimeout(timer);
		run.signal.removeEventListener("abort", onStop);
	}
}

function stopCause(run: Run): NonNullable<StageExitRecord["stoppedBy"]> {
	return run.options.signal?.aborted ? "abort" : "time budget";
}

function stageExitCeiling(run: Run): number {
	return run.options.stageExitCeilingMs ?? STAGE_EXIT_CEILING_MS;
}

/** A stopped stage's work counts as aborted, whatever it settled with. */
function sessionResult(
	settled: StageSettlement<BackendRunResult>,
): BackendRunResult | Error {
	const { result } = settled;
	if (settled.stoppedBy || result.kind === "unconfirmed")
		return new Error("aborted");
	if (result.kind === "error") return new Error(errorMessage(result.error));
	return result.value;
}

/** The value of work that settled unstopped and cannot reject. */
function settledValue<T>(result: Settlement<T>): T {
	if (result.kind === "value") return result.value;
	throw result.kind === "error" ? result.error : new Error("aborted");
}

function stageExit(
	stage: string,
	settled: StageSettlement<unknown>,
): StageExitRecord {
	return {
		stage,
		...(settled.stoppedBy ? { stoppedBy: settled.stoppedBy } : {}),
		settled: settled.result.kind !== "unconfirmed",
	};
}

/** Records how a stage ended, with a warning for anything that may still be running. */
async function recordStageExit(run: Run, exit: StageExitRecord): Promise<void> {
	const { manifest } = run.record;
	manifest.stageExits = [...(manifest.stageExits ?? []), exit];
	if (!exit.settled)
		warn(
			run.record,
			`${exit.stage}: stage did not confirm exit within ${stageExitCeiling(run)} ms after the ${exit.stoppedBy ?? "stop"}; it may still be running`,
		);
	if (exit.process?.tree === "survived")
		warn(
			run.record,
			`${exit.stage}: process tree survived: ${exit.process.detail ?? "unknown"}`,
		);
	for (const stream of exit.process?.truncated ?? [])
		warn(
			run.record,
			`${exit.stage}: ${stream} passed the output cap; its middle was dropped, the head and tail are in ${exit.logs?.[stream] ?? "its log"}`,
		);
	await saveManifest(run.record);
}

interface SessionLog {
	processLog: StageProcessLog;
	relativePaths: { stdout: string; stderr: string };
	reported?: StageProcessExit;
}

/** `logs/<name>.stdout.log` and `.stderr.log` in the run directory, for a backend's child process. */
function sessionLog(run: Run, name: string): SessionLog {
	const relativePaths = {
		stdout: join(RUN_RECORD_FILES.logs, `${name}.stdout.log`),
		stderr: join(RUN_RECORD_FILES.logs, `${name}.stderr.log`),
	};
	const log: SessionLog = {
		relativePaths,
		processLog: {
			stdout: join(run.record.dir, relativePaths.stdout),
			stderr: join(run.record.dir, relativePaths.stderr),
			report: (exit) => {
				log.reported = exit;
			},
		},
	};
	return log;
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

function ended(run: Run): boolean {
	return run.record.manifest.status !== "running";
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
 * the tree as it was. Resolves to why the patch is not in the tree, if so;
 * an isolation breach since the last builder stage keeps it out too.
 */
async function applyFinalPatch(run: Run): Promise<string | undefined> {
	run.stage = "patch apply";
	const { projectRoot } = run.options;
	const path = run.patch;
	if (path === undefined)
		return "the builder's last patch was not written, so nothing was applied to the worktree";
	const patchPath = relative(projectRoot, path);
	const breach = await isolationBreach(run);
	if (breach) return `${breach}; patch not applied: ${patchPath}`;
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
