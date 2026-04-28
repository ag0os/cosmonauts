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
	ParallelGroupStep,
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

/**
 * Execute a full chain of agent stages.
 *
 * Iterates stages sequentially. One-shot stages run once. Loop stages
 * repeat until their completion check passes, bounded by global safety
 * caps (maxTotalIterations, timeoutMs).
 */
export async function runChain(config: ChainConfig): Promise<ChainResult> {
	const chainStart = Date.now();
	const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxTotalIterations =
		config.maxTotalIterations ?? DEFAULT_MAX_TOTAL_ITERATIONS;

	const stageResults: StageResult[] = [];
	const errors: string[] = [];
	const spawner = createPiSpawner(config.registry, resolveDomainsDir(config), {
		resolver: config.resolver,
	});
	let totalIterations = 0;
	let statsDurationMs = 0;

	emit(config, { type: "chain_start", steps: config.steps });

	try {
		for (const [i, step] of config.steps.entries()) {
			if (config.signal?.aborted) break;
			if (Date.now() - chainStart >= timeoutMs) break;

			const constraints: StageConstraints = {
				maxTotalIterations: maxTotalIterations - totalIterations,
				deadlineMs: chainStart + timeoutMs,
			};

			if (isParallelGroupStep(step)) {
				const groupStart = Date.now();
				const { results, success, error } = await runParallelGroup(
					step,
					i,
					config,
					spawner,
					constraints,
				);
				const groupDurationMs = Date.now() - groupStart;

				for (const r of results) {
					stageResults.push(r);
				}

				// Wall-clock contribution is the actual group elapsed time (≈ max member duration).
				statsDurationMs += groupDurationMs;

				if (!success) {
					if (error) errors.push(error);
					break;
				}
			} else {
				const stage = step;
				emit(config, { type: "stage_start", stage, stageIndex: i });

				const result = await runStage(stage, config, spawner, constraints);

				// Only loop stages consume the shared iteration budget.
				if (stage.loop) {
					totalIterations += result.iterations;
				}
				stageResults.push(result);
				statsDurationMs += result.stats?.durationMs ?? 0;

				if (result.stats) {
					emit(config, { type: "stage_stats", stage, stats: result.stats });
				}
				emit(config, { type: "stage_end", stage, result });

				if (!result.success) {
					if (result.error) errors.push(result.error);
					break;
				}
			}
		}
	} finally {
		spawner.dispose();
	}

	const chainStats = buildChainStats(stageResults, statsDurationMs);
	const chainResult: ChainResult = {
		success: errors.length === 0 && !config.signal?.aborted,
		stageResults,
		totalDurationMs: Date.now() - chainStart,
		errors,
		stats: chainStats,
	};

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
		emit(config, { type: "stage_start", stage, stageIndex: stepIndex });
		const result = await runStage(stage, config, spawner, constraints);
		if (result.stats) {
			emit(config, { type: "stage_stats", stage, stats: result.stats });
		}
		emit(config, { type: "stage_end", stage, result });
		return result;
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
	let iterations = 0;

	try {
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

		const model = getModelForRole(
			stage.name,
			config.models,
			config.registry,
			config.domainContext,
		);
		const thinkingLevel = getThinkingForRole(
			stage.name,
			config.thinking,
			config.registry,
			config.domainContext,
		);
		const prompt = buildStagePrompt(stage, config);

		const planSlug = resolvePlanSlug(config);

		if (!stage.loop) {
			// One-shot stage
			iterations = 1;

			let spawnedSessionId: string | undefined;
			const emitSpawned = (sessionId: string) => {
				if (spawnedSessionId !== undefined) return;
				spawnedSessionId = sessionId;
				emit(config, {
					type: "agent_spawned",
					role: stage.name,
					sessionId,
				});
			};
			const onEvent = createSpawnEventForwarder(
				config,
				stage.name,
				emitSpawned,
			);

			const spawnResult = await spawner.spawn({
				role: stage.name,
				domainContext: config.domainContext,
				cwd: config.projectRoot,
				model,
				prompt,
				signal: config.signal,
				projectSkills: config.projectSkills,
				skillPaths: config.skillPaths ? [...config.skillPaths] : undefined,
				thinkingLevel,
				compaction: config.compaction,
				onEvent,
				planSlug,
			});

			if (spawnResult.success) {
				emitSpawned(spawnResult.sessionId);
				emit(config, {
					type: "agent_completed",
					role: stage.name,
					sessionId: spawnResult.sessionId,
				});
			}

			return {
				stage,
				success: spawnResult.success,
				iterations,
				durationMs: Date.now() - stageStart,
				error: spawnResult.error,
				stats: spawnResult.stats,
			};
		}

		// Loop stage — repeat until done or safety cap
		const completionCheck = stage.completionCheck;
		const iterationBudget =
			constraints?.maxTotalIterations ?? DEFAULT_MAX_TOTAL_ITERATIONS;
		const deadline = constraints?.deadlineMs ?? Date.now() + DEFAULT_TIMEOUT_MS;
		let completionReached = false;
		let terminalError: string | undefined;
		let aggregatedStats = emptySpawnStats();
		let hasStats = false;

		// Pre-check once before spawning to avoid unnecessary loop iterations.
		if (completionCheck) {
			completionReached = await completionCheck(config.projectRoot);
		} else {
			const initialState = await evaluateDefaultCompletionState(
				config.projectRoot,
				config.completionLabel,
			);
			if (initialState.status === "complete") {
				completionReached = true;
			}
			if (initialState.status === "terminal") {
				terminalError = initialState.reason;
			}
		}

		if (completionReached) {
			return {
				stage,
				success: true,
				iterations,
				durationMs: Date.now() - stageStart,
			};
		}

		if (terminalError) {
			return {
				stage,
				success: false,
				iterations,
				durationMs: Date.now() - stageStart,
				error: terminalError,
			};
		}

		for (let i = 0; i < iterationBudget; i++) {
			if (config.signal?.aborted) break;
			if (Date.now() >= deadline) break;

			iterations = i + 1;

			emit(config, {
				type: "stage_iteration",
				stage,
				iteration: iterations,
			});

			let spawnedSessionId: string | undefined;
			const emitSpawned = (sessionId: string) => {
				if (spawnedSessionId !== undefined) return;
				spawnedSessionId = sessionId;
				emit(config, {
					type: "agent_spawned",
					role: stage.name,
					sessionId,
				});
			};
			const onEvent = createSpawnEventForwarder(
				config,
				stage.name,
				emitSpawned,
			);

			const spawnResult = await spawner.spawn({
				role: stage.name,
				domainContext: config.domainContext,
				cwd: config.projectRoot,
				model,
				prompt,
				signal: config.signal,
				projectSkills: config.projectSkills,
				skillPaths: config.skillPaths ? [...config.skillPaths] : undefined,
				thinkingLevel,
				compaction: config.compaction,
				onEvent,
				planSlug,
			});

			if (spawnResult.stats) {
				aggregatedStats = addSpawnStats(aggregatedStats, spawnResult.stats);
				hasStats = true;
			}

			if (spawnResult.success) {
				emitSpawned(spawnResult.sessionId);
				emit(config, {
					type: "agent_completed",
					role: stage.name,
					sessionId: spawnResult.sessionId,
				});
			}

			if (!spawnResult.success) {
				return {
					stage,
					success: false,
					iterations,
					durationMs: Date.now() - stageStart,
					error: spawnResult.error,
					stats: hasStats ? aggregatedStats : undefined,
				};
			}

			if (completionCheck) {
				completionReached = await completionCheck(config.projectRoot);
			} else {
				const state = await evaluateDefaultCompletionState(
					config.projectRoot,
					config.completionLabel,
				);
				completionReached = state.status === "complete";
				if (state.status === "terminal") {
					terminalError = state.reason;
				}
			}
			if (completionReached || terminalError) break;
		}

		const loopStats = hasStats ? aggregatedStats : undefined;

		if (terminalError) {
			return {
				stage,
				success: false,
				iterations,
				durationMs: Date.now() - stageStart,
				error: terminalError,
				stats: loopStats,
			};
		}

		if (completionReached) {
			return {
				stage,
				success: true,
				iterations,
				durationMs: Date.now() - stageStart,
				stats: loopStats,
			};
		}

		if (config.signal?.aborted) {
			return {
				stage,
				success: true,
				iterations,
				durationMs: Date.now() - stageStart,
				stats: loopStats,
			};
		}

		if (Date.now() >= deadline) {
			return {
				stage,
				success: false,
				iterations,
				durationMs: Date.now() - stageStart,
				error: `Loop stage "${stage.name}" timed out before completion`,
				stats: loopStats,
			};
		}

		if (iterations >= iterationBudget) {
			return {
				stage,
				success: false,
				iterations,
				durationMs: Date.now() - stageStart,
				error: `Loop stage "${stage.name}" reached max iterations (${iterationBudget}) before completion`,
				stats: loopStats,
			};
		}

		return {
			stage,
			success: false,
			iterations,
			durationMs: Date.now() - stageStart,
			error: `Loop stage "${stage.name}" exited before completion`,
			stats: loopStats,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		emit(config, { type: "error", message, stage });

		return {
			stage,
			success: false,
			iterations,
			durationMs: Date.now() - stageStart,
			error: message,
		};
	}
}
