/**
 * Tests for chain-runner.ts
 * Covers runStage (one-shot and loop modes), runChain (with mocked spawner module),
 * createDefaultCompletionCheck (with real task system), and event emission.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainStage,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import {
	runStage,
	runChain,
	createDefaultCompletionCheck,
} from "../../lib/orchestration/chain-runner.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

// ============================================================================
// Mock the agent-spawner module so runChain never creates real Pi sessions
// ============================================================================

let mockSpawnerForModule: AgentSpawner;

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => mockSpawnerForModule,
	getModelForRole: () => "anthropic/claude-sonnet-4-5",
}));

// ============================================================================
// Mock Spawner Helper
// ============================================================================

function createMockSpawner(results?: SpawnResult[]): AgentSpawner {
	let callIndex = 0;
	const defaultResult: SpawnResult = {
		success: true,
		sessionId: "mock-session",
		messages: [],
	};
	return {
		spawn: vi.fn(async () => {
			const result = results?.[callIndex] ?? defaultResult;
			callIndex++;
			return result;
		}),
		dispose: vi.fn(),
	};
}

// ============================================================================
// Helpers
// ============================================================================

function makeStage(
	name: string,
	loop: boolean,
	completionCheck?: (projectRoot: string) => Promise<boolean>,
): ChainStage {
	const stage: ChainStage = { name, loop };
	if (completionCheck) stage.completionCheck = completionCheck;
	return stage;
}

function makeConfig(
	stages: ChainStage[],
	overrides?: Partial<ChainConfig>,
): ChainConfig {
	return {
		stages,
		projectRoot: "/tmp/test-project",
		...overrides,
	};
}

// ============================================================================
// runStage Tests
// ============================================================================

describe("runStage", () => {
	describe("one-shot (loop=false)", () => {
		test("spawns agent once and returns success with iterations=1", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(1);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("records duration >= 0", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		test("returns failure with error when spawner fails", async () => {
			const spawner = createMockSpawner([
				{ success: false, sessionId: "", messages: [], error: "boom" },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toBe("boom");
			expect(result.iterations).toBe(1);
		});
	});

	describe("loop (loop=true)", () => {
		test("iterates until completion check returns true", async () => {
			const spawner = createMockSpawner();
			let callCount = 0;
			const completionCheck = vi.fn(async () => {
				callCount++;
				return callCount >= 2;
			});
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 10,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(2);
			expect(spawner.spawn).toHaveBeenCalledTimes(2);
		});

		test("exhausts iteration budget when completion never passes", async () => {
			const spawner = createMockSpawner();
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(3);
			expect(spawner.spawn).toHaveBeenCalledTimes(3);
			expect(completionCheck).toHaveBeenCalledTimes(3);
		});

		test("respects abort signal between iterations", async () => {
			const controller = new AbortController();
			let spawnCallCount = 0;

			const spawner: AgentSpawner = {
				spawn: vi.fn(async () => {
					spawnCallCount++;
					// Abort after the first iteration completes
					if (spawnCallCount === 1) {
						controller.abort();
					}
					return {
						success: true,
						sessionId: `session-${spawnCallCount}`,
						messages: [],
					};
				}),
				dispose: vi.fn(),
			};

			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("worker", true, completionCheck);
			const config = makeConfig([stage], { signal: controller.signal });

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 10,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.iterations).toBeLessThan(10);
			expect(result.success).toBe(true);
		});

		test("stops on spawner failure", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
				{
					success: false,
					sessionId: "",
					messages: [],
					error: "agent crashed",
				},
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("agent crashed");
			expect(result.iterations).toBe(2);
			expect(spawner.spawn).toHaveBeenCalledTimes(2);
		});
	});
});

// ============================================================================
// createDefaultCompletionCheck Tests
// ============================================================================

describe("createDefaultCompletionCheck", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "chain-runner-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns false for empty project", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns false when tasks not all Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		await tm.createTask({ title: "Task A" });
		await tm.createTask({ title: "Task B" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns true when all tasks Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const taskA = await tm.createTask({ title: "Task A" });
		const taskB = await tm.createTask({ title: "Task B" });

		await tm.updateTask(taskA.id, { status: "Done" });
		await tm.updateTask(taskB.id, { status: "Done" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(true);
	});

	test("returns false when only some Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const taskA = await tm.createTask({ title: "Task A" });
		await tm.createTask({ title: "Task B" });

		await tm.updateTask(taskA.id, { status: "Done" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe("event emission", () => {
	test("emits agent_spawned and agent_completed for one-shot stage", async () => {
		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes).toContain("agent_spawned");
		expect(eventTypes).toContain("agent_completed");
	});

	test("emits stage_iteration events for loop stages", async () => {
		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const completionCheck = vi.fn(async () => false);
		const stage = makeStage("coordinator", true, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner, {
			maxTotalIterations: 3,
			deadlineMs: Date.now() + 60_000,
		});

		const iterationEvents = events.filter(
			(e) => e.type === "stage_iteration",
		);
		expect(iterationEvents).toHaveLength(3);
	});

	test("onEvent errors are swallowed", async () => {
		const spawner = createMockSpawner();
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: () => {
				throw new Error("listener error");
			},
		});

		// Should not reject even though the listener throws
		const result = await runStage(stage, config, spawner);
		expect(result.success).toBe(true);
	});
});

// ============================================================================
// runChain Tests (module-level mock of agent-spawner)
// ============================================================================

describe("runChain", () => {
	beforeEach(() => {
		mockSpawnerForModule = createMockSpawner();
	});

	test("sequential one-shot stages succeed", async () => {
		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]!.success).toBe(true);
		expect(result.stageResults[1]!.success).toBe(true);
		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
		expect(result.errors).toHaveLength(0);
	});

	test("stage failure stops chain", async () => {
		mockSpawnerForModule = createMockSpawner([
			{ success: true, sessionId: "session-1", messages: [] },
			{
				success: false,
				sessionId: "",
				messages: [],
				error: "stage 2 failed",
			},
		]);

		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]!.success).toBe(true);
		expect(result.stageResults[1]!.success).toBe(false);
		expect(result.errors).toContain("stage 2 failed");
	});

	test("emits chain_start and chain_end events", async () => {
		const events: ChainEvent[] = [];
		const stages = [makeStage("planner", false)];
		const config = makeConfig(stages, {
			onEvent: (event) => events.push(event),
		});

		await runChain(config);

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes[0]).toBe("chain_start");
		expect(eventTypes[eventTypes.length - 1]).toBe("chain_end");
	});

	test("abort signal between stages", async () => {
		const controller = new AbortController();

		// Abort after first stage
		let spawnCount = 0;
		mockSpawnerForModule = {
			spawn: vi.fn(async () => {
				spawnCount++;
				if (spawnCount === 1) {
					controller.abort();
				}
				return { success: true, sessionId: `s-${spawnCount}`, messages: [] };
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("planner", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages, { signal: controller.signal });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
	});

	test("spawner disposed after execution", async () => {
		const stages = [makeStage("planner", false)];
		const config = makeConfig(stages);

		await runChain(config);

		expect(mockSpawnerForModule.dispose).toHaveBeenCalledTimes(1);
	});

	test("one-shot stages do not consume loop iteration budget", async () => {
		// Chain: 2 one-shot stages then a loop stage with budget of 3.
		// Previously, each one-shot consumed 1 from the budget, leaving only 1
		// for the loop stage. Now one-shot stages are excluded from the budget.
		const completionCheck = vi.fn(async () => false); // never passes

		let spawnCount = 0;
		mockSpawnerForModule = {
			spawn: vi.fn(async () => {
				spawnCount++;
				return {
					success: true,
					sessionId: `s-${spawnCount}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
			makeStage("coordinator", true, completionCheck),
		];
		const config = makeConfig(stages, { maxTotalIterations: 3 });

		const result = await runChain(config);

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(3);
		// One-shot stages still report iterations=1 in their results
		expect(result.stageResults[0]!.iterations).toBe(1);
		expect(result.stageResults[1]!.iterations).toBe(1);
		// Loop stage gets the full budget of 3, not 3 - 2 = 1
		expect(result.stageResults[2]!.iterations).toBe(3);
	});

	test("maxTotalIterations budget shared across stages", async () => {
		// First loop stage uses 2 iterations, second loop stage gets remaining 1
		let firstStageChecks = 0;
		const firstCheck = vi.fn(async () => {
			firstStageChecks++;
			return firstStageChecks >= 2; // passes after 2 iterations
		});

		const secondCheck = vi.fn(async () => false); // never passes

		let spawnCount = 0;
		mockSpawnerForModule = {
			spawn: vi.fn(async () => {
				spawnCount++;
				return {
					success: true,
					sessionId: `s-${spawnCount}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("coordinator", true, firstCheck),
			makeStage("worker", true, secondCheck),
		];
		const config = makeConfig(stages, { maxTotalIterations: 3 });

		const result = await runChain(config);

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		// First stage: 2 iterations (completion check passes after 2)
		expect(result.stageResults[0]!.iterations).toBe(2);
		// Second stage: only 1 iteration left in budget (3 - 2 = 1)
		expect(result.stageResults[1]!.iterations).toBe(1);
	});
});
