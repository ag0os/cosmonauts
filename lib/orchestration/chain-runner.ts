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
// Default Prompts per Role
// ============================================================================

const ROLE_PROMPTS: Record<string, string> = {
	planner: "Analyze the project and design an implementation plan.",
	"task-manager": "Review the plan and create atomic implementation tasks.",
	coordinator: "Check for ready tasks and delegate them to workers.",
	worker: "Pick up the next ready task and implement it.",
};

const DEFAULT_PROMPT = "Execute your assigned role.";

/**
 * Return a role-appropriate prompt for an agent stage.
 */
function getPromptForRole(role: string): string {
	return ROLE_PROMPTS[role] ?? DEFAULT_PROMPT;
}

// ============================================================================
// Default Completion Check
// ============================================================================

/**
 * Create a completion check that returns true when all tasks in the
 * project have status "Done".
 *
 * @param projectRoot - Project root directory containing the task system
 * @returns An async function that resolves to true when all tasks are done
 */
export function createDefaultCompletionCheck(
	projectRoot: string,
): () => Promise<boolean> {
	return async (): Promise<boolean> => {
		const tm = new TaskManager(projectRoot);
		const tasks = await tm.listTasks();

		// If there are no tasks at all, treat as not complete
		// (avoids vacuous truth on empty projects).
		if (tasks.length === 0) {
			return false;
		}

		return tasks.every((task) => task.status === "Done");
	};
}

// ============================================================================
// Emit Helper
// ============================================================================

/**
 * Safely emit an event via the config callback.
 * Never throws — swallows any error from the listener.
 */
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
 * Creates a spawner internally, iterates through stages sequentially,
 * and collects results. If any stage fails the chain stops and returns
 * partial results. Respects `config.signal` for cancellation between stages.
 *
 * @param config - Chain execution configuration
 * @returns Aggregated chain result with per-stage details
 */
export async function runChain(config: ChainConfig): Promise<ChainResult> {
	const chainStart = Date.now();
	const stageResults: StageResult[] = [];
	const errors: string[] = [];
	const spawner = createPiSpawner();

	emit(config, { type: "chain_start", stages: config.stages });

	try {
		for (const [i, stage] of config.stages.entries()) {
			// Check abort signal between stages
			if (config.signal?.aborted) {
				break;
			}

			emit(config, { type: "stage_start", stage, stageIndex: i });

			const result = await runStage(stage, config, spawner);
			stageResults.push(result);

			emit(config, { type: "stage_end", stage, result });

			if (!result.success) {
				if (result.error) {
					errors.push(result.error);
				}
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

/**
 * Execute a single chain stage.
 *
 * - Pipeline stages (maxIterations === 1): spawn the agent once.
 * - Loop stages (maxIterations > 1): iterate up to maxIterations, checking
 *   a completion condition after each spawn. If no completionCheck is
 *   provided on the stage, the default "all tasks Done" check is used.
 *
 * @param stage   - The stage definition
 * @param config  - The overall chain config (for project root, models, signal, events)
 * @param spawner - The agent spawner to use
 * @returns Stage result with timing and iteration count
 */
export async function runStage(
	stage: ChainStage,
	config: ChainConfig,
	spawner: AgentSpawner,
): Promise<StageResult> {
	const stageStart = Date.now();
	let iterations = 0;

	try {
		const model = getModelForRole(stage.name, config.models);
		const prompt = getPromptForRole(stage.name);

		if (stage.maxIterations === 1) {
			// Pipeline stage — single pass
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

		// Loop stage — iterate up to maxIterations
		const completionCheck =
			stage.completionCheck ?? createDefaultCompletionCheck(config.projectRoot);

		for (let i = 0; i < stage.maxIterations; i++) {
			// Check abort signal between iterations
			if (config.signal?.aborted) {
				break;
			}

			iterations = i + 1;

			emit(config, {
				type: "stage_iteration",
				stage,
				iteration: iterations,
				maxIterations: stage.maxIterations,
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

			// Check completion after each iteration
			const done = await completionCheck(config.projectRoot);
			if (done) {
				break;
			}
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
