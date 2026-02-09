/**
 * Chain runner — the main orchestration engine.
 * Executes a chain of agent stages sequentially, supporting both
 * single-pass pipeline stages and iterative loop stages.
 */

import { TaskManager } from "../tasks/task-manager.ts";
import { createPiSpawner, getModelForRole } from "./agent-spawner.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	StageResult,
} from "./types.ts";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MAX_TOTAL_ITERATIONS = 50;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const ROLE_PROMPTS: Record<string, string> = {
	planner: "Analyze the project and design an implementation plan.",
	"task-manager": "Review the plan and create atomic implementation tasks.",
	coordinator: "Check for ready tasks and delegate them to workers.",
	worker: "Pick up the next ready task and implement it.",
};

const DEFAULT_PROMPT = "Execute your assigned role.";

function getPromptForRole(role: string): string {
	return ROLE_PROMPTS[role] ?? DEFAULT_PROMPT;
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
): () => Promise<boolean> {
	return async (): Promise<boolean> => {
		const tm = new TaskManager(projectRoot);
		const tasks = await tm.listTasks();

		if (tasks.length === 0) {
			return false;
		}

		return tasks.every((task) => task.status === "Done");
	};
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
	const spawner = createPiSpawner();
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

			emit(config, { type: "stage_end", stage, result });

			if (!result.success) {
				if (result.error) errors.push(result.error);
				break;
			}
		}
	} finally {
		spawner.dispose();
	}

	const chainResult: ChainResult = {
		success: errors.length === 0 && !config.signal?.aborted,
		stageResults,
		totalDurationMs: Date.now() - chainStart,
		errors,
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
		const model = getModelForRole(stage.name, config.models);
		const prompt = getPromptForRole(stage.name);

		if (!stage.loop) {
			// One-shot stage
			iterations = 1;

			const spawnResult = await spawner.spawn({
				role: stage.name,
				cwd: config.projectRoot,
				model,
				prompt,
				signal: config.signal,
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
			};
		}

		// Loop stage — repeat until done or safety cap
		const completionCheck =
			stage.completionCheck ??
			createDefaultCompletionCheck(config.projectRoot);
		const iterationBudget =
			constraints?.maxTotalIterations ?? DEFAULT_MAX_TOTAL_ITERATIONS;
		const deadline = constraints?.deadlineMs ?? Date.now() + DEFAULT_TIMEOUT_MS;

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
				cwd: config.projectRoot,
				model,
				prompt,
				signal: config.signal,
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

			if (!spawnResult.success) {
				return {
					stage,
					success: false,
					iterations,
					durationMs: Date.now() - stageStart,
					error: spawnResult.error,
				};
			}

			const done = await completionCheck(config.projectRoot);
			if (done) break;
		}

		return {
			stage,
			success: true,
			iterations,
			durationMs: Date.now() - stageStart,
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
