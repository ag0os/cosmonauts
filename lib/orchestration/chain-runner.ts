/**
 * Chain runner — the main orchestration engine.
 * Executes a chain of agent stages sequentially, supporting both
 * single-pass pipeline stages and iterative loop stages.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unqualifyRole } from "../agents/qualified-role.ts";
import { TaskManager } from "../tasks/task-manager.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import { getModelForRole, getThinkingForRole } from "./model-resolution.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	ChainStats,
	SpawnEvent,
	SpawnStats,
	StageResult,
	StageStats,
} from "./types.ts";

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
	reviewer:
		"Review the current branch changes against main and write actionable findings.",
	fixer:
		"Apply targeted fixes for review findings and verify they pass checks.",
	"tdd-planner":
		"Analyze the project and design a behavior-driven plan with testable specifications.",
	"tdd-coordinator":
		"Check for ready tasks and run the Red-Green-Refactor cycle for each.",
	"test-writer":
		"Write failing tests that capture the task's acceptance criteria as executable specifications.",
	implementer:
		"Write the minimum production code to make the failing tests pass.",
	refactorer: "Improve code structure while keeping all tests green.",
};

const DEFAULT_PROMPT = "Execute your assigned role.";

export function getDefaultStagePrompt(role: string): string {
	return DEFAULT_STAGE_PROMPTS[unqualifyRole(role)] ?? DEFAULT_PROMPT;
}

function buildStagePrompt(stage: ChainStage, config: ChainConfig): string {
	const basePrompt = stage.prompt ?? getDefaultStagePrompt(stage.name);

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

/**
 * Inject a user prompt into the first chain stage by appending it to that
 * stage's default operational prompt.
 */
export function injectUserPrompt(
	stages: ChainStage[],
	prompt: string | undefined,
): void {
	const first = stages[0];
	if (!prompt || !first) return;

	const defaultPrompt = getDefaultStagePrompt(first.name);
	stages[0] = {
		...first,
		prompt: `${defaultPrompt}\n\nUser request: ${prompt}`,
	};
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
): ((event: SpawnEvent) => void) | undefined {
	if (!config.onEvent) return undefined;
	return (event: SpawnEvent) => {
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

/** Build ChainStats from completed stage results. */
function buildChainStats(stageResults: StageResult[]): ChainStats {
	const stages: StageStats[] = [];
	let totalCost = 0;
	let totalTokens = 0;
	let totalDurationMs = 0;

	for (const sr of stageResults) {
		if (sr.stats) {
			stages.push({
				stageName: sr.stage.name,
				iterations: sr.iterations,
				stats: sr.stats,
			});
			totalCost += sr.stats.cost;
			totalTokens += sr.stats.tokens.total;
			totalDurationMs += sr.stats.durationMs;
		}
	}

	return { stages, totalCost, totalTokens, totalDurationMs };
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

	emit(config, { type: "chain_start", stages: config.stages });

	try {
		for (const [i, stage] of config.stages.entries()) {
			if (config.signal?.aborted) break;
			if (Date.now() - chainStart >= timeoutMs) break;

			emit(config, { type: "stage_start", stage, stageIndex: i });

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: maxTotalIterations - totalIterations,
				deadlineMs: chainStart + timeoutMs,
			});

			// Only loop stages consume the shared iteration budget.
			// One-shot stages always report iterations=1 but shouldn't
			// starve downstream loop stages of their budget.
			if (stage.loop) {
				totalIterations += result.iterations;
			}
			stageResults.push(result);

			if (result.stats) {
				emit(config, { type: "stage_stats", stage, stats: result.stats });
			}
			emit(config, { type: "stage_end", stage, result });

			if (!result.success) {
				if (result.error) errors.push(result.error);
				break;
			}
		}
	} finally {
		spawner.dispose();
	}

	const chainStats = buildChainStats(stageResults);
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

		if (!stage.loop) {
			// One-shot stage
			iterations = 1;

			const onEvent = createSpawnEventForwarder(config, stage.name);

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
			});

			if (spawnResult.success) {
				emit(config, {
					type: "agent_spawned",
					role: stage.name,
					sessionId: spawnResult.sessionId,
				});
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

		const onEvent = createSpawnEventForwarder(config, stage.name);

		for (let i = 0; i < iterationBudget; i++) {
			if (config.signal?.aborted) break;
			if (Date.now() >= deadline) break;

			iterations = i + 1;

			emit(config, {
				type: "stage_iteration",
				stage,
				iteration: iterations,
			});

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
			});

			if (spawnResult.stats) {
				aggregatedStats = addSpawnStats(aggregatedStats, spawnResult.stats);
				hasStats = true;
			}

			if (spawnResult.success) {
				emit(config, {
					type: "agent_spawned",
					role: stage.name,
					sessionId: spawnResult.sessionId,
				});
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
