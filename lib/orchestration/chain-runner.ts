/**
 * Chain runner — the main orchestration engine.
 * Executes a chain of agent stages sequentially, supporting both
 * single-pass pipeline stages and iterative loop stages.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TaskManager } from "../tasks/task-manager.ts";
import { isTaskClosed } from "../tasks/task-types.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "./assistant-text.ts";
import {
	createInlineChainEpisodeLifecycle,
	withChainEpisode,
} from "./chain-episodes.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import { getModelForRole, getThinkingForRole } from "./model-resolution.ts";
import { misplacedQualityReviewResult } from "./quality-review-chain.ts";
import {
	launchQualityReview,
	qualityReviewPlacement,
	qualityReviewPlanSlug,
} from "./quality-review-launch.ts";
import {
	assessTaskManagerReviewGate,
	formatReviewRoundBlockError,
	type PlanReviewTarget,
	type ReviewCheck,
	type ReviewRoundBlock,
	validatePlanReviewReport,
	validateReviewRevisionReport,
} from "./review-revision.ts";
import type { StagePromptPurpose } from "./stage-prompts.ts";
import {
	appendBoundReviewTarget,
	buildStagePrompt,
	deriveStagePromptPurpose,
	requiresPlanReviewTarget,
	resolvePlanSlug,
	shouldAppendBoundReviewTarget,
} from "./stage-prompts.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	ChainStats,
	ChainStep,
	InlinePlanReviewState,
	ParallelGroupStep,
	SpawnConfig,
	SpawnEvent,
	SpawnResult,
	SpawnStats,
	StageResult,
	StageStats,
} from "./types.ts";

export { injectUserPrompt } from "./chain-steps.ts";
export { derivePlanSlug, getDefaultStagePrompt } from "./stage-prompts.ts";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MAX_TOTAL_ITERATIONS = 50;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Fallback domains directory derived from this package's source tree. */
const FALLBACK_DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

/** Resolve the domains directory from config, falling back to the package default. */
function resolveDomainsDir(config: ChainConfig): string {
	return config.domainsDir ?? FALLBACK_DOMAINS_DIR;
}

// ============================================================================
// Default Completion Check
// ============================================================================

/**
 * Create a completion check that returns true when all tasks in the
 * project are Done or Cancelled.
 */
export function createDefaultCompletionCheck(
	projectRoot: string,
	label?: string,
): () => Promise<boolean> {
	return async (): Promise<boolean> => {
		const state = await evaluateDefaultCompletionState(projectRoot, label);
		return state.status === "complete";
	};
}

type DefaultCompletionState =
	| { status: "complete" }
	| { status: "pending" }
	| { status: "terminal"; reason: string };

/**
 * Evaluate completion for the default coordinator loop.
 *
 * Terminal states let loop stages exit immediately instead of burning
 * iterations when there is no actionable work left.
 */
async function evaluateDefaultCompletionState(
	projectRoot: string,
	label?: string,
): Promise<DefaultCompletionState> {
	const tm = new TaskManager(projectRoot);
	const tasks = await tm.listTasks(label ? { label } : undefined);

	if (tasks.length === 0) {
		return {
			status: "terminal",
			reason: label
				? `No tasks found for completion label "${label}"`
				: "No tasks found for completion check",
		};
	}

	if (tasks.every(taskCompleteForChain)) {
		return { status: "complete" };
	}

	if (tasks.every((task) => task.status === "Blocked")) {
		return {
			status: "terminal",
			reason: label
				? `All tasks for completion label "${label}" are Blocked`
				: "All tasks are Blocked",
		};
	}

	// A scope whose tasks are all closed (Done or Cancelled) but not yet
	// complete has Done tasks with unchecked criteria; it stays pending, since
	// re-invoking the coordinator is how those criteria get finished.
	const noActionableDetails = await describeNoActionableTasks(tm, tasks);
	if (
		tasks.some((task) => !isTaskClosed(task.status)) &&
		noActionableDetails !== undefined
	) {
		const summary = label
			? `No actionable tasks for completion label "${label}": none is In Progress or To Do with every dependency Done`
			: "No actionable tasks: none is In Progress or To Do with every dependency Done";
		return {
			status: "terminal",
			reason: `${summary}. ${noActionableDetails}`,
		};
	}

	return { status: "pending" };
}

function taskCompleteForChain(
	task: Awaited<ReturnType<TaskManager["listTasks"]>>[number],
): boolean {
	return (
		isTaskClosed(task.status) &&
		(task.status === "Cancelled" || taskAcceptanceCriteriaComplete(task))
	);
}

/**
 * Only an In Progress task, or a To Do task whose dependencies are all Done,
 * can move the scope forward. A Cancelled dependency never becomes Done.
 */
async function describeNoActionableTasks(
	tm: TaskManager,
	tasks: Awaited<ReturnType<TaskManager["listTasks"]>>,
): Promise<string | undefined> {
	if (tasks.some((task) => task.status === "In Progress")) return undefined;
	const todo = tasks.filter((task) => task.status === "To Do");
	const statuses = await tm.getTaskStatuses(
		todo.flatMap((task) => task.dependencies),
	);
	if (
		todo.some((task) =>
			task.dependencies.every(
				(id) => statuses.get(id.toUpperCase()) === "Done",
			),
		)
	) {
		return undefined;
	}

	const details: string[] = [];
	const stranded = todo.map((task) => {
		const unsatisfied = task.dependencies
			.filter((id) => statuses.get(id.toUpperCase()) !== "Done")
			.map((id) => `${id}: ${statuses.get(id.toUpperCase()) ?? "missing"}`);
		return `${task.id} (${unsatisfied.join(", ")})`;
	});
	if (stranded.length > 0) {
		details.push(`Stranded: ${stranded.join("; ")}`);
	}
	const blocked = tasks
		.filter((task) => task.status === "Blocked")
		.map((task) => task.id);
	if (blocked.length > 0) {
		details.push(`Blocked: ${blocked.join(", ")}`);
	}
	return details.join(". ");
}

function taskAcceptanceCriteriaComplete(
	task: Awaited<ReturnType<TaskManager["listTasks"]>>[number],
): boolean {
	return (
		task.acceptanceCriteria.length === 0 ||
		task.acceptanceCriteria.every((criterion) => criterion.checked)
	);
}

// ============================================================================
// Emit Helper
// ============================================================================

function emit(config: ChainConfig, event: ChainEvent): void {
	try {
		config.onEvent?.(event);
	} catch {
		// Listeners must not break the runner.
	}
}

/**
 * Create an onEvent callback for SpawnConfig that forwards selected
 * spawn events as ChainEvent variants through the chain's onEvent.
 * Returns undefined if the chain has no onEvent listener.
 */
function createSpawnEventForwarder(
	config: ChainConfig,
	role: string,
	onSessionObserved?: (sessionId: string) => void,
): ((event: SpawnEvent) => void) | undefined {
	if (!config.onEvent) return undefined;
	return (event: SpawnEvent) => {
		onSessionObserved?.(event.sessionId);

		if (event.type === "turn_start" || event.type === "turn_end") {
			emit(config, {
				type: "agent_turn",
				role,
				sessionId: event.sessionId,
				event,
			});
		} else if (
			event.type === "tool_execution_start" ||
			event.type === "tool_execution_end"
		) {
			emit(config, {
				type: "agent_tool_use",
				role,
				sessionId: event.sessionId,
				event,
			});
		} else if (
			event.type === "compaction_start" ||
			event.type === "compaction_end"
		) {
			// Forward compaction events as agent_turn (lifecycle-level)
			emit(config, {
				type: "agent_turn",
				role,
				sessionId: event.sessionId,
				event,
			});
		}
	};
}

// ============================================================================
// Stats Aggregation Helpers
// ============================================================================

/** Create a zero-valued SpawnStats. */
function emptySpawnStats(): SpawnStats {
	return {
		tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		cost: 0,
		durationMs: 0,
		turns: 0,
		toolCalls: 0,
	};
}

/** Sum two SpawnStats together. */
function addSpawnStats(a: SpawnStats, b: SpawnStats): SpawnStats {
	return {
		tokens: {
			input: a.tokens.input + b.tokens.input,
			output: a.tokens.output + b.tokens.output,
			cacheRead: a.tokens.cacheRead + b.tokens.cacheRead,
			cacheWrite: a.tokens.cacheWrite + b.tokens.cacheWrite,
			total: a.tokens.total + b.tokens.total,
		},
		cost: a.cost + b.cost,
		durationMs: a.durationMs + b.durationMs,
		turns: a.turns + b.turns,
		toolCalls: a.toolCalls + b.toolCalls,
	};
}

/**
 * Build ChainStats from completed stage results.
 * Pass totalDurationMs explicitly to override the sum (e.g. for parallel groups
 * where wall-clock contribution is the max member duration, not the sum).
 */
function buildChainStats(
	stageResults: StageResult[],
	statsDurationMs: number,
): ChainStats {
	const stages: StageStats[] = [];
	let totalCost = 0;
	let totalTokens = 0;

	for (const sr of stageResults) {
		if (sr.stats) {
			stages.push({
				stageName: sr.stage.name,
				iterations: sr.iterations,
				stats: sr.stats,
			});
			totalCost += sr.stats.cost;
			totalTokens += sr.stats.tokens.total;
		}
	}

	return { stages, totalCost, totalTokens, totalDurationMs: statsDurationMs };
}

// ============================================================================
// runChain
// ============================================================================

interface ChainExecutionState {
	chainStart: number;
	timeoutMs: number;
	maxTotalIterations: number;
	stageResults: StageResult[];
	errors: string[];
	totalIterations: number;
	statsDurationMs: number;
	activePlanReview?: InlinePlanReviewState;
}

interface ChainStepOutcome {
	results: StageResult[];
	success: boolean;
	loopIterations: number;
	statsDurationMs: number;
	error?: string;
}

function createChainExecutionState(config: ChainConfig): ChainExecutionState {
	return {
		chainStart: Date.now(),
		timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		maxTotalIterations:
			config.maxTotalIterations ?? DEFAULT_MAX_TOTAL_ITERATIONS,
		stageResults: [],
		errors: [],
		totalIterations: 0,
		statsDurationMs: 0,
	};
}

function shouldStopBeforeStep(
	state: ChainExecutionState,
	config: ChainConfig,
): boolean {
	return (
		config.signal?.aborted === true ||
		Date.now() - state.chainStart >= state.timeoutMs
	);
}

/** Wrap a single stage's result as this step's outcome. */
function singleStageOutcome(
	stage: ChainStage,
	result: StageResult,
): ChainStepOutcome {
	return {
		results: [result],
		success: result.success,
		error: result.error,
		loopIterations: stage.loop ? result.iterations : 0,
		statsDurationMs: result.stats?.durationMs ?? 0,
	};
}

async function runChainStep(
	step: ChainStep,
	stepIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	state: ChainExecutionState,
): Promise<ChainStepOutcome> {
	const constraints: StageConstraints = {
		maxTotalIterations: state.maxTotalIterations - state.totalIterations,
		deadlineMs: state.chainStart + state.timeoutMs,
	};

	if (isParallelGroupStep(step)) {
		const groupStart = Date.now();
		const { results, success, error } = await runParallelGroup(
			step,
			stepIndex,
			config,
			spawner,
			constraints,
			state,
		);

		return {
			results,
			success,
			error,
			loopIterations: 0,
			// Wall-clock contribution is the actual group elapsed time.
			statsDurationMs: Date.now() - groupStart,
		};
	}

	const stage = step;
	if (
		qualityReviewPlacement({
			steps: [stage],
			registry: config.registry,
			domainContext: config.domainContext,
		}) === "terminal"
	) {
		return runQualityReviewChainStep(stage, stepIndex, config);
	}
	const promptContext = stagePromptContext(
		config.steps,
		stepIndex,
		stage,
		state.activePlanReview?.target,
	);
	if (promptContext.purpose.kind === "plan-review") {
		const observation = await runParticipatingPlanReviewer(
			stage,
			stepIndex,
			config,
			spawner,
			constraints,
			promptContext,
		);
		const [result] = await finalizeParticipatingPlanReviewers(
			[observation],
			config,
			state,
		);
		if (!result) throw new Error("Missing participating reviewer result.");
		return singleStageOutcome(stage, result);
	}
	if (
		promptContext.purpose.kind === "revision" &&
		promptContext.purpose.reviewKind === "plan"
	) {
		const result = await runPlanRevisionStage(
			stage,
			stepIndex,
			config,
			spawner,
			constraints,
			promptContext,
			state,
		);
		return singleStageOutcome(stage, result);
	}
	if (promptContext.requiresPlanReviewTarget) {
		const result = await runGuardedTaskManagerStage(
			stage,
			stepIndex,
			config,
			spawner,
			constraints,
			promptContext,
			state,
		);
		return singleStageOutcome(stage, result);
	}
	const result = await runObservedStage(
		stage,
		stepIndex,
		config,
		spawner,
		constraints,
		promptContext,
	);

	return singleStageOutcome(stage, result);
}

async function runQualityReviewChainStep(
	stage: ChainStage,
	stepIndex: number,
	config: ChainConfig,
): Promise<ChainStepOutcome> {
	const started = Date.now();
	const review = await launchQualityReview({
		...config.qualityReview,
		projectRoot: config.projectRoot,
		operatorNote: stage.prompt,
		planSlug: qualityReviewPlanSlug(config),
		signal: config.signal,
	});
	const result: StageResult = {
		stage,
		success: review.stepResult.outcome === "success",
		iterations: 1,
		durationMs: Date.now() - started,
		summary: review.stepResult.summary,
		run: review.ref,
		artifacts: review.stepResult.artifacts,
		...(review.stepResult.outcome === "success"
			? {}
			: { error: review.stepResult.summary }),
	};
	emit(config, { type: "stage_start", stage, stageIndex: stepIndex });
	emitStageCompletion(config, stage, result);
	return singleStageOutcome(stage, result);
}

async function runPlanRevisionStage(
	stage: ChainStage,
	stageIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	promptContext: StagePromptContext,
	state: ChainExecutionState,
): Promise<StageResult> {
	emit(config, { type: "stage_start", stage, stageIndex });
	let assistantText: string | undefined;
	const result = await runStageWithPromptContext(
		stage,
		config,
		spawner,
		constraints,
		promptContext,
		(text) => {
			assistantText = text;
		},
	);
	let finalized = result;

	if (result.success) {
		const check = await validateReviewRevisionReport({
			assistantText: assistantText ?? "",
			projectRoot: config.projectRoot,
			expectedTarget: state.activePlanReview?.target,
		});
		if (check.status === "accepted") {
			const activePlanReview = state.activePlanReview;
			if (activePlanReview) {
				state.activePlanReview = {
					...activePlanReview,
					addressedAtTopologyIndex: stageIndex,
					addressedReviewRound: check.target.reviewRound,
				};
			}
		} else {
			finalized = blockPlanReviewStage(result, check.block, config);
		}
	}

	emitStageCompletion(config, stage, finalized);
	return finalized;
}

async function runGuardedTaskManagerStage(
	stage: ChainStage,
	stageIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	promptContext: StagePromptContext,
	state: ChainExecutionState,
): Promise<StageResult> {
	emit(config, { type: "stage_start", stage, stageIndex });
	const stageStart = Date.now();
	const block = await assessTaskManagerEntry(
		state.activePlanReview,
		stageIndex,
		config,
	);
	if (block) {
		const result = blockPlanReviewStage(
			{
				stage,
				success: false,
				iterations: 0,
				durationMs: Date.now() - stageStart,
			},
			block,
			config,
		);
		emitStageCompletion(config, stage, result);
		return result;
	}

	const result = await runStageWithPromptContext(
		stage,
		config,
		spawner,
		constraints,
		promptContext,
	);
	emitStageCompletion(config, stage, result);
	return result;
}

async function assessTaskManagerEntry(
	activePlanReview: InlinePlanReviewState | undefined,
	taskManagerTopologyIndex: number,
	config: ChainConfig,
): Promise<ReviewRoundBlock | undefined> {
	return assessTaskManagerReviewGate({
		activePlanReview,
		taskManagerTopologyIndex,
		projectRoot: config.projectRoot,
	});
}

async function runObservedStage(
	stage: ChainStage,
	stageIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	promptContext: StagePromptContext,
): Promise<StageResult> {
	emit(config, { type: "stage_start", stage, stageIndex });

	const result = await runStageWithPromptContext(
		stage,
		config,
		spawner,
		constraints,
		promptContext,
	);

	emitStageCompletion(config, stage, result);

	return result;
}

function emitStageCompletion(
	config: ChainConfig,
	stage: ChainStage,
	result: StageResult,
): void {
	if (result.stats) {
		emit(config, { type: "stage_stats", stage, stats: result.stats });
	}
	emit(config, { type: "stage_end", stage, result });
}

interface ParticipatingPlanReviewerObservation {
	stage: ChainStage;
	result: StageResult;
	reviewCheck?: Promise<ReviewCheck>;
}

async function runParticipatingPlanReviewer(
	stage: ChainStage,
	stageIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	promptContext: StagePromptContext,
): Promise<ParticipatingPlanReviewerObservation> {
	emit(config, { type: "stage_start", stage, stageIndex });
	let reviewCheck: Promise<ReviewCheck> | undefined;
	const result = await runStageWithPromptContext(
		stage,
		config,
		spawner,
		constraints,
		promptContext,
		(assistantText) => {
			reviewCheck = validatePlanReviewReport({
				assistantText,
				projectRoot: config.projectRoot,
				expectedPlanSlug: resolvePlanSlug(config),
			});
		},
	);
	return { stage, result, reviewCheck };
}

/** Resolve each reviewer's report; a silent reviewer yields a missing-report block. */
async function resolveReviewChecks(
	observations: readonly ParticipatingPlanReviewerObservation[],
): Promise<Array<ReviewCheck | undefined>> {
	return Promise.all(
		observations.map(async (observation): Promise<ReviewCheck | undefined> => {
			if (!observation.result.success) return undefined;
			return (
				(await observation.reviewCheck) ?? {
					status: "unaddressed",
					block: { reason: "missing-review-report" },
				}
			);
		}),
	);
}

/** Every target a reviewer named, whether its report was accepted or blocked. */
function reportedReviewTargets(
	checks: readonly (ReviewCheck | undefined)[],
): Array<{ index: number; target: PlanReviewTarget }> {
	return checks.flatMap((check, index) => {
		if (check?.status === "accepted") return [{ index, target: check.target }];
		if (
			check?.block.planSlug === undefined ||
			check.block.reviewRound === undefined
		) {
			return [];
		}
		return [
			{
				index,
				target: {
					planSlug: check.block.planSlug,
					reviewRound: check.block.reviewRound,
				},
			},
		];
	});
}

/** Distinct (slug, round) pairs among the reported targets. */
function distinctTargetCount(
	targets: readonly { target: PlanReviewTarget }[],
): number {
	return new Set(
		targets.map(
			({ target }) =>
				`${target.planSlug}\u0000${target.reviewRound.toString()}`,
		),
	).size;
}

/**
 * Settle the group's shared review target: siblings naming different targets are
 * unordered and block as ambiguous, and only a unanimously accepted group binds.
 */
function reconcileReviewTargets(args: {
	checks: readonly (ReviewCheck | undefined)[];
	observations: readonly ParticipatingPlanReviewerObservation[];
	results: StageResult[];
	config: ChainConfig;
	state: ChainExecutionState;
}): void {
	const { checks, observations, results, config, state } = args;
	const reportedTargets = reportedReviewTargets(checks);

	if (distinctTargetCount(reportedTargets) > 1) {
		const first = reportedTargets[0];
		const observation = first ? observations[first.index] : undefined;
		if (first && observation) {
			results[first.index] = blockPlanReviewStage(
				observation.result,
				{ reason: "ambiguous-review-target" },
				config,
			);
		}
		return;
	}

	const accepted = checks.flatMap((check, index) =>
		check?.status === "accepted" ? [{ index, target: check.target }] : [],
	);
	if (accepted.length !== observations.length) return;
	if (!results.every((result) => result.success)) return;

	const target = accepted[0]?.target;
	if (target) state.activePlanReview = { target };
}

async function finalizeParticipatingPlanReviewers(
	observations: readonly ParticipatingPlanReviewerObservation[],
	config: ChainConfig,
	state: ChainExecutionState,
): Promise<StageResult[]> {
	const checks = await resolveReviewChecks(observations);
	const results = observations.map((observation) => observation.result);

	for (const [index, check] of checks.entries()) {
		const observation = observations[index];
		if (check?.status !== "unaddressed" || !observation) continue;
		results[index] = blockPlanReviewStage(
			observation.result,
			check.block,
			config,
		);
	}

	reconcileReviewTargets({ checks, observations, results, config, state });

	for (const [index, observation] of observations.entries()) {
		emitStageCompletion(
			config,
			observation.stage,
			results[index] ?? observation.result,
		);
	}
	return results;
}

function blockPlanReviewStage(
	result: StageResult,
	block: ReviewRoundBlock,
	config: ChainConfig,
): StageResult {
	const error = formatReviewRoundBlockError(block);
	emit(config, {
		type: "unaddressed_review_round",
		stage: result.stage,
		block,
	});
	return { ...result, success: false, error, reviewRoundBlock: block };
}

function recordChainStepOutcome(
	state: ChainExecutionState,
	outcome: ChainStepOutcome,
): void {
	state.stageResults.push(...outcome.results);
	state.totalIterations += outcome.loopIterations;
	state.statsDurationMs += outcome.statsDurationMs;

	if (!outcome.success && outcome.error) {
		state.errors.push(outcome.error);
	}
}

function finalizeChainResult(
	state: ChainExecutionState,
	config: ChainConfig,
	chainStart: number,
): ChainResult {
	const chainStats = buildChainStats(state.stageResults, state.statsDurationMs);

	return {
		success: state.errors.length === 0 && !config.signal?.aborted,
		stageResults: state.stageResults,
		totalDurationMs: Date.now() - chainStart,
		errors: state.errors,
		stats: chainStats,
	};
}

/**
 * Execute a full chain of agent stages.
 *
 * Iterates stages sequentially. One-shot stages run once. Loop stages
 * repeat until their completion check passes, bounded by global safety
 * caps (maxTotalIterations, timeoutMs).
 */
export async function runChain(config: ChainConfig): Promise<ChainResult> {
	const lifecycle = createInlineChainEpisodeLifecycle(config);
	return withChainEpisode(config, lifecycle, () => executeChain(config));
}

async function executeChain(config: ChainConfig): Promise<ChainResult> {
	const refusal = await misplacedQualityReviewResult(config);
	if (refusal) return refusal;
	const state = createChainExecutionState(config);
	const chainStart = state.chainStart;
	const spawner = createPiSpawner(config.registry, resolveDomainsDir(config), {
		resolver: config.resolver,
		spawnTimeoutMs: config.spawnTimeoutMs,
	});

	emit(config, { type: "chain_start", steps: config.steps });

	try {
		for (const [i, step] of config.steps.entries()) {
			if (shouldStopBeforeStep(state, config)) break;

			const outcome = await runChainStep(step, i, config, spawner, state);
			recordChainStepOutcome(state, outcome);
			if (!outcome.success) break;
		}
	} finally {
		spawner.dispose();
	}

	const chainResult = finalizeChainResult(state, config, chainStart);
	const qualityRun = chainResult.stageResults.findLast(
		(result) => result.run,
	)?.run;
	if (qualityRun?.scope === "chain")
		chainResult.run = { runId: qualityRun.runId, scope: "chain" };

	emit(config, { type: "chain_end", result: chainResult });

	return chainResult;
}

// ============================================================================
// runParallelGroup
// ============================================================================

interface ParallelGroupOutcome {
	results: StageResult[];
	success: boolean;
	error?: string;
}

/**
 * Execute all stages in a parallel group concurrently.
 *
 * Emits parallel_start before launching any member, then stage_start /
 * stage_end / stage_stats for each member as it completes. After all members
 * have settled, emits parallel_end with results in declaration order.
 */
type ParallelMemberOutcome =
	| {
			kind: "guarded-task-manager";
			stage: ChainStage;
			promptContext: StagePromptContext;
	  }
	| {
			kind: "participating-reviewer";
			observation: ParticipatingPlanReviewerObservation;
	  }
	| { kind: "ordinary"; result: StageResult };

/**
 * Run one member of a parallel group. Guarded task-managers are deferred so the
 * group can reconcile same-index review targets before any of them spawns.
 */
async function runParallelMember(
	stage: ChainStage,
	stepIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	state: ChainExecutionState,
): Promise<ParallelMemberOutcome> {
	const promptContext = stagePromptContext(
		config.steps,
		stepIndex,
		stage,
		state.activePlanReview?.target,
	);
	if (promptContext.requiresPlanReviewTarget) {
		return { kind: "guarded-task-manager", stage, promptContext };
	}
	if (promptContext.purpose.kind === "plan-review") {
		return {
			kind: "participating-reviewer",
			observation: await runParticipatingPlanReviewer(
				stage,
				stepIndex,
				config,
				spawner,
				constraints,
				promptContext,
			),
		};
	}
	if (
		promptContext.purpose.kind === "revision" &&
		promptContext.purpose.reviewKind === "plan"
	) {
		return {
			kind: "ordinary",
			result: await runPlanRevisionStage(
				stage,
				stepIndex,
				config,
				spawner,
				constraints,
				promptContext,
				state,
			),
		};
	}
	return {
		kind: "ordinary",
		result: await runObservedStage(
			stage,
			stepIndex,
			config,
			spawner,
			constraints,
			promptContext,
		),
	};
}

interface ParallelMemberCollection {
	results: StageResult[];
	participating: Array<{
		index: number;
		observation: ParticipatingPlanReviewerObservation;
	}>;
	guardedTaskManagers: Array<{
		index: number;
		stage: ChainStage;
		promptContext: StagePromptContext;
	}>;
}

/** Await every member and sort the outcomes into declaration-ordered buckets. */
async function collectParallelMembers(
	memberPromises: readonly Promise<ParallelMemberOutcome>[],
	step: ParallelGroupStep,
): Promise<ParallelMemberCollection> {
	const settled = await Promise.allSettled(memberPromises);
	const collection: ParallelMemberCollection = {
		results: new Array(settled.length),
		participating: [],
		guardedTaskManagers: [],
	};

	for (const [index, outcome] of settled.entries()) {
		if (outcome.status === "rejected") {
			// runStage never throws — its catch block always returns a StageResult.
			// This branch guards against unexpected rejections.
			collection.results[index] = {
				stage: step.stages[index] ?? step.stages[0],
				success: false,
				iterations: 0,
				durationMs: 0,
				error: String(outcome.reason),
			} as StageResult;
			continue;
		}
		const member = outcome.value;
		if (member.kind === "guarded-task-manager") {
			collection.guardedTaskManagers.push({
				index,
				stage: member.stage,
				promptContext: member.promptContext,
			});
			continue;
		}
		if (member.kind === "participating-reviewer") {
			collection.participating.push({ index, observation: member.observation });
			collection.results[index] = member.observation.result;
			continue;
		}
		collection.results[index] = member.result;
	}
	return collection;
}

async function runParallelGroup(
	step: ParallelGroupStep,
	stepIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
	state: ChainExecutionState,
): Promise<ParallelGroupOutcome> {
	emit(config, { type: "parallel_start", step, stepIndex });

	// Launch all members concurrently. Participating reviewer completion waits for
	// same-index target reconciliation; ordinary member events remain immediate.
	const memberPromises = step.stages.map((stage) =>
		runParallelMember(stage, stepIndex, config, spawner, constraints, state),
	);

	// Collect results in declaration order.
	const { results, participating, guardedTaskManagers } =
		await collectParallelMembers(memberPromises, step);

	if (participating.length > 0) {
		const finalized = await finalizeParticipatingPlanReviewers(
			participating.map((member) => member.observation),
			config,
			state,
		);
		for (const [reviewerIndex, result] of finalized.entries()) {
			const member = participating[reviewerIndex];
			if (member) results[member.index] = result;
		}
	}

	const guardedResults = await Promise.all(
		guardedTaskManagers.map((member) =>
			runGuardedTaskManagerStage(
				member.stage,
				stepIndex,
				config,
				spawner,
				constraints,
				{
					...member.promptContext,
					...(state.activePlanReview?.target !== undefined && {
						target: state.activePlanReview.target,
					}),
				},
				state,
			),
		),
	);
	for (const [guardedIndex, result] of guardedResults.entries()) {
		const member = guardedTaskManagers[guardedIndex];
		if (member) results[member.index] = result;
	}

	const completeResults = results.filter(
		(result): result is StageResult => result !== undefined,
	);
	const errors = completeResults.flatMap((result) =>
		!result.success && result.error ? [result.error] : [],
	);

	const success = completeResults.every((result) => result.success);
	const error = errors.length > 0 ? errors.join("; ") : undefined;

	emit(config, {
		type: "parallel_end",
		step,
		stepIndex,
		results: completeResults,
		success,
		...(error !== undefined && { error }),
	});

	return { results: completeResults, success, error };
}

// ============================================================================
// runStage
// ============================================================================

interface StageConstraints {
	/** Remaining iteration budget from the chain level */
	maxTotalIterations: number;
	/** Absolute deadline timestamp (ms since epoch) */
	deadlineMs: number;
}

interface StagePromptContext {
	purpose: StagePromptPurpose;
	requiresPlanReviewTarget: boolean;
	target?: PlanReviewTarget;
}

function stagePromptContext(
	steps: readonly ChainStep[],
	topologyIndex: number,
	stage: ChainStage,
	target?: PlanReviewTarget,
): StagePromptContext {
	return {
		purpose: deriveStagePromptPurpose(steps, topologyIndex, stage),
		requiresPlanReviewTarget: requiresPlanReviewTarget(
			steps,
			topologyIndex,
			stage,
		),
		...(target !== undefined && { target }),
	};
}

interface PreparedStageExecutionContext {
	stage: ChainStage;
	config: ChainConfig;
	stageStart: number;
	model: string | undefined;
	thinkingLevel: ReturnType<typeof getThinkingForRole>;
	prompt: string;
	planSlug: string | undefined;
	iterations: number;
	aggregatedStats: SpawnStats;
	hasStats: boolean;
	/** Condensed final-message text from the most recent spawn in this stage */
	lastSummary: string | undefined;
	/** Receives full assistant text before it is condensed for StageResult. */
	onAssistantText?: (assistantText: string) => void;
}

interface StageExecutionContext extends PreparedStageExecutionContext {
	spawner: AgentSpawner;
}

type LoopState =
	| { status: "pending" }
	| { status: "complete" }
	| { status: "terminal"; error?: string }
	| { status: "aborted" }
	| { status: "timed_out" }
	| { status: "budget_exhausted"; iterationBudget: number }
	| { status: "exited" };

/**
 * Execute a single chain stage.
 *
 * - One-shot stages (loop=false): spawn the agent once.
 * - Loop stages (loop=true): repeat until completion check passes,
 *   bounded by the remaining iteration budget and deadline.
 */
export async function runStage(
	stage: ChainStage,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints?: StageConstraints,
): Promise<StageResult> {
	const placement = qualityReviewPlacement({
		steps: [stage],
		registry: config.registry,
		domainContext: config.domainContext,
	});
	if (placement !== "absent") {
		const review = await launchQualityReview({
			...config.qualityReview,
			projectRoot: config.projectRoot,
			operatorNote: stage.prompt,
			planSlug: qualityReviewPlanSlug(config),
			signal: config.signal,
			...(placement === "refused"
				? {
						refusalReason: "Quality Manager must be a terminal non-loop stage.",
					}
				: {}),
		});
		return {
			stage,
			success: review.stepResult.outcome === "success",
			iterations: placement === "refused" ? 0 : 1,
			durationMs: 0,
			summary: review.stepResult.summary,
			run: review.ref,
			artifacts: review.stepResult.artifacts,
			...(review.stepResult.outcome === "success"
				? {}
				: { error: review.stepResult.summary }),
		};
	}
	return runStageWithPromptContext(stage, config, spawner, constraints, {
		purpose: { kind: "default" },
		requiresPlanReviewTarget: false,
	});
}

async function runStageWithPromptContext(
	stage: ChainStage,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints | undefined,
	promptContext: StagePromptContext,
	onAssistantText?: (assistantText: string) => void,
): Promise<StageResult> {
	const stageStart = Date.now();
	let context: StageExecutionContext | undefined;

	try {
		const prepared = prepareStageExecution(
			stage,
			config,
			promptContext,
			onAssistantText,
		);
		if (isStageResult(prepared)) return prepared;

		context = { ...prepared, spawner };
		return stage.loop
			? runLoopStage(context, constraints)
			: runOneShotStage(context);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		emit(config, { type: "error", message, stage });

		return {
			stage,
			success: false,
			iterations: context?.iterations ?? 0,
			durationMs: Date.now() - stageStart,
			error: message,
		};
	}
}

function prepareStageExecution(
	stage: ChainStage,
	config: ChainConfig,
	promptContext: StagePromptContext,
	onAssistantText?: (assistantText: string) => void,
): PreparedStageExecutionContext | StageResult {
	const stageStart = Date.now();
	const stageReference =
		stage.agentReference ??
		config.registry.resolveReference(stage.name, config.domainContext)
			?.reference;
	const executionRole = stageReference?.resolved.qualifiedId ?? stage.name;

	const hasExecutionTarget = stageReference
		? config.registry.getResolvedTarget(executionRole, config.domainContext) !==
			undefined
		: config.registry.has(executionRole, config.domainContext);

	if (!hasExecutionTarget) {
		return unknownStageResult(stage, config, stageStart);
	}

	const resolvedStage =
		stageReference && stage.agentReference === undefined
			? { ...stage, agentReference: stageReference }
			: stage;

	const purposePrompt = buildStagePrompt(stage, {
		completionLabel: config.completionLabel,
		purpose: promptContext.purpose,
	});
	const prompt = shouldAppendBoundReviewTarget(
		promptContext.purpose,
		promptContext.requiresPlanReviewTarget,
	)
		? appendBoundReviewTarget(purposePrompt, promptContext.target)
		: purposePrompt;

	return {
		stage: resolvedStage,
		config,
		stageStart,
		model: getModelForRole(
			stage.name,
			config.models,
			config.registry,
			config.domainContext,
		),
		thinkingLevel: getThinkingForRole(
			stage.name,
			config.thinking,
			config.registry,
			config.domainContext,
		),
		prompt,
		planSlug: resolvePlanSlug(config),
		iterations: 0,
		aggregatedStats: emptySpawnStats(),
		hasStats: false,
		lastSummary: undefined,
		...(onAssistantText !== undefined && { onAssistantText }),
	};
}

function unknownStageResult(
	stage: ChainStage,
	config: ChainConfig,
	stageStart: number,
): StageResult {
	let message = `Unknown agent role "${stage.name}"`;
	const legacyCosmoStageName = "main/cosmo".slice("main/".length);
	if (stage.name === legacyCosmoStageName) {
		message +=
			'\nMigration hint: use "main/cosmo" for the cross-domain orchestrator or "coding/cody" for the coding-domain lead.';
	}
	emit(config, { type: "error", message, stage });
	return {
		stage,
		success: false,
		iterations: 0,
		durationMs: Date.now() - stageStart,
		error: message,
	};
}

function isStageResult(
	value: PreparedStageExecutionContext | StageResult,
): value is StageResult {
	return "success" in value;
}

function createStageSpawnConfig(
	context: StageExecutionContext,
	onEvent: ((event: SpawnEvent) => void) | undefined,
): SpawnConfig {
	const { config, stage } = context;

	return {
		role: stage.name,
		...(stage.agentReference !== undefined && {
			agentReference: stage.agentReference,
		}),
		domainContext: config.domainContext,
		cwd: config.projectRoot,
		model: context.model,
		prompt: context.prompt,
		signal: config.signal,
		projectSkills: config.projectSkills,
		skillPaths: config.skillPaths ? [...config.skillPaths] : undefined,
		thinkingLevel: context.thinkingLevel,
		compaction: config.compaction,
		onEvent,
		planSlug: context.planSlug,
	};
}

async function runOneShotStage(
	context: StageExecutionContext,
): Promise<StageResult> {
	context.iterations = 1;

	const { emitSpawned, onEvent } = createSpawnLifecycle(context);
	const spawnResult = await context.spawner.spawn(
		createStageSpawnConfig(context, onEvent),
	);

	recordSuccessfulSpawn(context, spawnResult, emitSpawned);

	return {
		stage: context.stage,
		success: spawnResult.success,
		iterations: context.iterations,
		durationMs: Date.now() - context.stageStart,
		error: spawnResult.error,
		stats: spawnResult.stats,
		summary: context.lastSummary,
	};
}

function recordStageOutput(
	context: StageExecutionContext,
	messages: unknown[],
): void {
	const assistantText = extractAssistantText(messages, context.stage.name);
	context.onAssistantText?.(assistantText);
	context.lastSummary = summarizeAssistantText(
		assistantText,
		context.stage.name,
	);
}

async function runLoopStage(
	context: StageExecutionContext,
	constraints?: StageConstraints,
): Promise<StageResult> {
	const iterationBudget =
		constraints?.maxTotalIterations ?? DEFAULT_MAX_TOTAL_ITERATIONS;
	const deadline = constraints?.deadlineMs ?? Date.now() + DEFAULT_TIMEOUT_MS;
	let loopState = await evaluateLoopState(context.stage, context.config);

	if (loopState.status !== "pending") {
		return buildLoopExitResult(context, loopState);
	}

	for (let i = 0; i < iterationBudget; i++) {
		if (context.config.signal?.aborted) break;
		if (Date.now() >= deadline) break;

		loopState = await runLoopIteration(context, i);
		if (loopState.status !== "pending") break;
	}

	return buildLoopExitResult(
		context,
		loopState.status === "pending"
			? getLoopCapState(context, deadline, iterationBudget)
			: loopState,
	);
}

async function runLoopIteration(
	context: StageExecutionContext,
	index: number,
): Promise<LoopState> {
	context.iterations = index + 1;
	emit(context.config, {
		type: "stage_iteration",
		stage: context.stage,
		iteration: context.iterations,
	});
	const spawnResult = await spawnLoopIteration(context);
	if (!spawnResult.success)
		return { status: "terminal", error: spawnResult.error };
	return evaluateLoopState(context.stage, context.config);
}

async function evaluateLoopState(
	stage: ChainStage,
	config: ChainConfig,
): Promise<LoopState> {
	if (stage.completionCheck) {
		return (await stage.completionCheck(config.projectRoot))
			? { status: "complete" }
			: { status: "pending" };
	}

	const state = await evaluateDefaultCompletionState(
		config.projectRoot,
		config.completionLabel,
	);

	if (state.status === "complete") return { status: "complete" };
	if (state.status === "terminal") {
		return { status: "terminal", error: state.reason };
	}
	return { status: "pending" };
}

function buildLoopExitResult(
	context: StageExecutionContext,
	loopState: LoopState,
): StageResult {
	const stats = context.hasStats ? context.aggregatedStats : undefined;
	const base = {
		stage: context.stage,
		iterations: context.iterations,
		durationMs: Date.now() - context.stageStart,
		stats,
		summary: context.lastSummary,
	};

	if (loopState.status === "complete" || loopState.status === "aborted") {
		return { ...base, success: true };
	}

	if (loopState.status === "terminal") {
		return { ...base, success: false, error: loopState.error };
	}

	if (loopState.status === "timed_out") {
		return {
			...base,
			success: false,
			error: `Loop stage "${context.stage.name}" timed out before completion`,
		};
	}

	if (loopState.status === "budget_exhausted") {
		return {
			...base,
			success: false,
			error: `Loop stage "${context.stage.name}" reached max iterations (${loopState.iterationBudget}) before completion`,
		};
	}

	return {
		...base,
		success: false,
		error: `Loop stage "${context.stage.name}" exited before completion`,
	};
}

function getLoopCapState(
	context: StageExecutionContext,
	deadline: number,
	iterationBudget: number,
): LoopState {
	if (context.config.signal?.aborted) return { status: "aborted" };
	if (Date.now() >= deadline) return { status: "timed_out" };
	if (context.iterations >= iterationBudget) {
		return { status: "budget_exhausted", iterationBudget };
	}
	return { status: "exited" };
}

async function spawnLoopIteration(
	context: StageExecutionContext,
): Promise<Awaited<ReturnType<AgentSpawner["spawn"]>>> {
	const { emitSpawned, onEvent } = createSpawnLifecycle(context);
	const spawnResult = await context.spawner.spawn(
		createStageSpawnConfig(context, onEvent),
	);

	if (spawnResult.stats) {
		context.aggregatedStats = addSpawnStats(
			context.aggregatedStats,
			spawnResult.stats,
		);
		context.hasStats = true;
	}

	recordSuccessfulSpawn(context, spawnResult, emitSpawned);

	return spawnResult;
}

function recordSuccessfulSpawn(
	context: StageExecutionContext,
	spawnResult: SpawnResult,
	emitSpawned: (sessionId: string) => void,
): void {
	if (!spawnResult.success) return;

	emitSpawned(spawnResult.sessionId);
	recordStageOutput(context, spawnResult.messages);
	emit(context.config, {
		type: "agent_completed",
		role: context.stage.name,
		sessionId: spawnResult.sessionId,
	});
}

function createSpawnLifecycle(context: StageExecutionContext): {
	emitSpawned: (sessionId: string) => void;
	onEvent: ((event: SpawnEvent) => void) | undefined;
} {
	let spawnedSessionId: string | undefined;
	const emitSpawned = (sessionId: string) => {
		if (spawnedSessionId !== undefined) return;
		spawnedSessionId = sessionId;
		emit(context.config, {
			type: "agent_spawned",
			role: context.stage.name,
			sessionId,
		});
	};

	return {
		emitSpawned,
		onEvent: createSpawnEventForwarder(
			context.config,
			context.stage.name,
			emitSpawned,
		),
	};
}
