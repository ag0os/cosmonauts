/**
 * Chain runner — the main orchestration engine.
 * Executes a chain of agent stages sequentially, supporting both
 * single-pass pipeline stages and iterative loop stages.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unqualifyRole } from "../agents/qualified-role.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { TaskManager } from "../tasks/task-manager.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import { isParallelGroupStep, resolveStagePrompt } from "./chain-steps.ts";
import { getModelForRole, getThinkingForRole } from "./model-resolution.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	ChainStats,
	ChainStep,
	ParallelGroupStep,
	SpawnConfig,
	SpawnEvent,
	SpawnStats,
	StageResult,
	StageStats,
} from "./types.ts";

export { injectUserPrompt } from "./chain-steps.ts";

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

/** Default operational prompts for chain stages (not agent identity prompts). */
const DEFAULT_STAGE_PROMPTS: Record<string, string> = {
	planner: "Analyze the project and design an implementation plan.",
	"adaptation-planner":
		"Study the reference implementation and design an adaptation plan for this project.",
	"task-manager": "Review the plan and create atomic implementation tasks.",
	coordinator: "Check for ready tasks and delegate them to workers.",
	worker: "Pick up the next ready task and implement it.",
	"quality-manager":
		"Run quality gates, review the diff against main, and orchestrate fixes until merge-ready.",
	"integration-verifier":
		"Read the active plan, verify implementation against declared contracts, and write missions/plans/<slug>/integration-report.md.",
	reviewer:
		"Review the current branch changes against main and write actionable findings.",
	"plan-reviewer":
		"Review the active plan and verify its claims against the codebase. Write structured findings.",
	fixer:
		"Apply targeted fixes for review findings and verify they pass checks.",
	"tdd-planner":
		"Analyze the project and design a behavior-driven plan with testable specifications.",
	"behavior-reviewer":
		"Review the active plan's ## Behaviors section and write structured findings to missions/plans/<slug>/behavior-review.md.",
	"tdd-coordinator":
		"Check for ready tasks and run the Red-Green-Refactor cycle for each.",
	"test-writer":
		"Write failing tests that capture the task's acceptance criteria as executable specifications.",
	implementer:
		"Write the minimum production code to make the failing tests pass.",
	refactorer: "Improve code structure while keeping all tests green.",
};

const DEFAULT_PROMPT = "Execute your assigned role.";

/**
 * Derive planSlug from a completionLabel that follows the `plan:<slug>` pattern.
 * Returns undefined when completionLabel is absent or uses a different format.
 * Throws when a derived slug fails plan slug validation.
 */
export function derivePlanSlug(completionLabel?: string): string | undefined {
	if (!completionLabel?.startsWith("plan:")) return undefined;
	const planSlug = completionLabel.slice("plan:".length);
	if (!planSlug) return undefined;
	validateSlug(planSlug);
	return planSlug;
}

function resolvePlanSlug(config: ChainConfig): string | undefined {
	if (config.planSlug) {
		validateSlug(config.planSlug);
		return config.planSlug;
	}
	return derivePlanSlug(config.completionLabel);
}

export function getDefaultStagePrompt(role: string): string {
	return DEFAULT_STAGE_PROMPTS[unqualifyRole(role)] ?? DEFAULT_PROMPT;
}

function buildStagePrompt(stage: ChainStage, config: ChainConfig): string {
	const basePrompt = resolveStagePrompt(
		stage.prompt,
		getDefaultStagePrompt(stage.name),
	);

	// When loop completion is label-scoped, loop coordinators must process only
	// that subset to avoid touching unrelated ready tasks.
	if (
		["coordinator", "tdd-coordinator"].includes(unqualifyRole(stage.name)) &&
		config.completionLabel
	) {
		return `${basePrompt}\n\nScope constraint: Operate only on tasks labeled "${config.completionLabel}". Filter all task selection to this label and do not modify tasks without it.`;
	}

	return basePrompt;
}

// ============================================================================
// Default Completion Check
// ============================================================================

/**
 * Create a completion check that returns true when all tasks in the
 * project have status "Done".
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

	if (tasks.every((task) => task.status === "Done")) {
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

	return { status: "pending" };
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
			event.type === "auto_compaction_start" ||
			event.type === "auto_compaction_end"
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
	const result = await runObservedStage(
		stage,
		stepIndex,
		config,
		spawner,
		constraints,
	);

	return {
		results: [result],
		success: result.success,
		error: result.error,
		loopIterations: stage.loop ? result.iterations : 0,
		statsDurationMs: result.stats?.durationMs ?? 0,
	};
}

async function runObservedStage(
	stage: ChainStage,
	stageIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
): Promise<StageResult> {
	emit(config, { type: "stage_start", stage, stageIndex });

	const result = await runStage(stage, config, spawner, constraints);

	if (result.stats) {
		emit(config, { type: "stage_stats", stage, stats: result.stats });
	}
	emit(config, { type: "stage_end", stage, result });

	return result;
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
	const state = createChainExecutionState(config);
	const chainStart = state.chainStart;
	const spawner = createPiSpawner(config.registry, resolveDomainsDir(config), {
		resolver: config.resolver,
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
async function runParallelGroup(
	step: ParallelGroupStep,
	stepIndex: number,
	config: ChainConfig,
	spawner: AgentSpawner,
	constraints: StageConstraints,
): Promise<ParallelGroupOutcome> {
	emit(config, { type: "parallel_start", step, stepIndex });

	// Launch all members concurrently; emit per-member events in completion order.
	const memberPromises = step.stages.map(async (stage) => {
		return runObservedStage(stage, stepIndex, config, spawner, constraints);
	});

	// Collect results in declaration order.
	const settled = await Promise.allSettled(memberPromises);
	const results: StageResult[] = [];
	const errors: string[] = [];

	for (const [idx, outcome] of settled.entries()) {
		if (outcome.status === "fulfilled") {
			results.push(outcome.value);
			if (!outcome.value.success && outcome.value.error) {
				errors.push(outcome.value.error);
			}
		} else {
			// runStage never throws — its catch block always returns a StageResult.
			// This branch guards against unexpected rejections.
			const message = String(outcome.reason);
			const fallbackStage = step.stages[idx] ?? step.stages[0];
			errors.push(message);
			results.push({
				stage: fallbackStage,
				success: false,
				iterations: 0,
				durationMs: 0,
				error: message,
			});
		}
	}

	const success = results.every((r) => r.success);
	const error = errors.length > 0 ? errors.join("; ") : undefined;

	emit(config, {
		type: "parallel_end",
		step,
		stepIndex,
		results,
		success,
		...(error !== undefined && { error }),
	});

	return { results, success, error };
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
	const stageStart = Date.now();
	let context: StageExecutionContext | undefined;

	try {
		const prepared = prepareStageExecution(stage, config);
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
): PreparedStageExecutionContext | StageResult {
	const stageStart = Date.now();

	if (!config.registry.has(stage.name, config.domainContext)) {
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

	return {
		stage,
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
		prompt: buildStagePrompt(stage, config),
		planSlug: resolvePlanSlug(config),
		iterations: 0,
		aggregatedStats: emptySpawnStats(),
		hasStats: false,
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

	if (spawnResult.success) {
		emitSpawned(spawnResult.sessionId);
		emit(context.config, {
			type: "agent_completed",
			role: context.stage.name,
			sessionId: spawnResult.sessionId,
		});
	}

	return {
		stage: context.stage,
		success: spawnResult.success,
		iterations: context.iterations,
		durationMs: Date.now() - context.stageStart,
		error: spawnResult.error,
		stats: spawnResult.stats,
	};
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

		context.iterations = i + 1;
		emit(context.config, {
			type: "stage_iteration",
			stage: context.stage,
			iteration: context.iterations,
		});

		const spawnResult = await spawnLoopIteration(context);
		if (!spawnResult.success) {
			return buildLoopExitResult(context, {
				status: "terminal",
				error: spawnResult.error,
			});
		}

		loopState = await evaluateLoopState(context.stage, context.config);
		if (loopState.status !== "pending") break;
	}

	return buildLoopExitResult(
		context,
		loopState.status === "pending"
			? getLoopCapState(context, deadline, iterationBudget)
			: loopState,
	);
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

	if (spawnResult.success) {
		emitSpawned(spawnResult.sessionId);
		emit(context.config, {
			type: "agent_completed",
			role: context.stage.name,
			sessionId: spawnResult.sessionId,
		});
	}

	return spawnResult;
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
