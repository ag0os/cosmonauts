import { normalizeChain, refuseNormalization } from "./chain-normalization.ts";
import { buildTerminalGateContext } from "./terminal-gate.ts";
/**
 * Chain runner — the main orchestration engine.
 * Executes a chain of agent stages sequentially, supporting both
 * single-pass pipeline stages and iterative loop stages.
 */

import { createPiSpawner } from "./agent-spawner.ts";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "./assistant-text.ts";
import {
	createInlineChainEpisodeLifecycle,
	withChainEpisode,
} from "./chain-episodes.ts";
import {
	addSpawnStats,
	buildChainStats,
	emptySpawnStats,
} from "./chain-stats.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import type { getThinkingForRole } from "./model-resolution.ts";

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
	resolvePlanSlug,
	shouldAppendBoundReviewTarget,
} from "./stage-prompts.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	ChainStep,
	InlinePlanReviewState,
	ParallelGroupStep,
	SpawnConfig,
	SpawnEvent,
	SpawnResult,
	SpawnStats,
	StageResult,
} from "./types.ts";

export { injectUserPrompt } from "./chain-steps.ts";
export { derivePlanSlug } from "./stage-prompts.ts";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MAX_TOTAL_ITERATIONS = 50;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Default Completion Check
// ============================================================================

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
// runChain
// ============================================================================

interface ChainExecutionState {
	chainStart: number;
	timeoutMs: number;
	maxTotalIterations: number;
	stageResults: StageResult[];
	errors: string[];
	failed: boolean;
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
		failed: false,
		totalIterations: 0,
		statsDurationMs: 0,
	};
}

/** An abort stops silently; an expired timeout fails the chain with its reason. */
function stopBeforeStep(
	state: ChainExecutionState,
	config: ChainConfig,
	stepIndex: number,
): boolean {
	if (config.signal?.aborted) return true;
	if (Date.now() - state.chainStart < state.timeoutMs) return false;
	state.failed = true;
	state.errors.push(
		`Chain timed out after ${state.timeoutMs}ms before step ${stepIndex + 1} of ${config.steps.length}`,
	);
	return true;
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
	if (stage.terminalGate) return runTerminalChainStep(stage, stepIndex, config);
	const promptContext = stagePromptContext(
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
	if (promptContext.purpose.kind === "plan-revision") {
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

async function runTerminalChainStep(
	stage: ChainStage,
	stepIndex: number,
	config: ChainConfig,
): Promise<ChainStepOutcome> {
	const started = Date.now();
	const gate =
		stage.terminalGate &&
		config.chainAdapter?.terminalGates?.[stage.terminalGate];
	if (!gate) throw new Error("Terminal executor is unavailable.");
	const result: StageResult = {
		...(await gate(buildTerminalGateContext({ ...config, stage }))),
		stage,
		durationMs: Date.now() - started,
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
					addressedStageId: stage.stageId,
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
		stage,
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
	stage?: ChainStage,
): Promise<ReviewRoundBlock | undefined> {
	const block = await assessTaskManagerReviewGate({
		activePlanReview,
		taskManagerTopologyIndex,
		projectRoot: config.projectRoot,
	});
	if (block) return block;
	if (
		stage?.reviewTarget &&
		activePlanReview &&
		!stage.reviewTarget.producerStageIds.includes(
			activePlanReview.addressedStageId ?? "",
		)
	)
		return {
			reason: "mismatched-addressed-evidence",
			...activePlanReview.target,
			taskManagerTopologyIndex,
		};
	return undefined;
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
				expectedPlanSlug: stage.expectedPlanSlug,
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

	if (outcome.success) return;
	state.failed = true;
	if (outcome.error) state.errors.push(outcome.error);
}

function finalizeChainResult(
	state: ChainExecutionState,
	config: ChainConfig,
	chainStart: number,
): ChainResult {
	const chainStats = buildChainStats(state.stageResults, state.statsDurationMs);

	return {
		success: !state.failed && !config.signal?.aborted,
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
	const normalized = normalizeChain(config);
	if (!normalized.ok) {
		return refuseNormalization(config, normalized.errors);
	}
	config = { ...config, steps: normalized.stages };
	const lifecycle = createInlineChainEpisodeLifecycle(config);
	return withChainEpisode(config, lifecycle, () => executeChain(config));
}

async function executeChain(config: ChainConfig): Promise<ChainResult> {
	const state = createChainExecutionState(config);
	const chainStart = state.chainStart;
	const spawner = createPiSpawner(config.registry, config.domainsDir, {
		resolver: config.resolver,
		spawnTimeoutMs: config.spawnTimeoutMs,
		runtime: config.runtime,
		sessionPolicies: config.sessionPolicies,
	});

	emit(config, { type: "chain_start", steps: config.steps });

	try {
		for (const [i, step] of config.steps.entries()) {
			if (stopBeforeStep(state, config, i)) break;

			const outcome = await runChainStep(step, i, config, spawner, state);
			recordChainStepOutcome(state, outcome);
			if (!outcome.success) break;
		}
	} finally {
		spawner.dispose();
	}

	const chainResult = finalizeChainResult(state, config, chainStart);

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
	if (promptContext.purpose.kind === "plan-revision") {
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
	stage: ChainStage,
	target?: PlanReviewTarget,
): StagePromptContext {
	return {
		purpose: stage.purpose ?? { kind: "default" },
		requiresPlanReviewTarget: stage.requiresPlanReviewTarget ?? false,
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
	const normalized = normalizeChain({ ...config, steps: [stage] });
	if (!normalized.ok) {
		const failure = await refuseNormalization(
			{ ...config, steps: [stage] },
			normalized.errors,
		);
		return {
			stage,
			success: false,
			iterations: 0,
			durationMs: failure.totalDurationMs,
			error: failure.errors.join("\n"),
		};
	}
	const first = normalized.stages[0];
	if (!first || isParallelGroupStep(first))
		throw new Error("Expected a single stage.");
	stage = first;
	config = { ...config, steps: normalized.stages };
	const state = createChainExecutionState(config);
	if (constraints) {
		state.maxTotalIterations = constraints.maxTotalIterations;
		state.timeoutMs = Math.max(0, constraints.deadlineMs - state.chainStart);
	}
	const outcome = await runChainStep(stage, 0, config, spawner, state);
	const result = outcome.results[0];
	if (!result) throw new Error("Missing stage result.");
	return result;
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

	const purposePrompt = stage.instruction ?? "";
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
		model: stage.model,
		thinkingLevel: stage.thinkingLevel,
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
	const message = `Unknown agent role "${stage.name}"`;
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
		runtime: config.runtime,
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
	if (stage.completionPolicy?.kind !== "state")
		throw new Error("Loop requires a state completion policy.");
	const state = await stage.completionPolicy.evaluate(config.projectRoot);

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
