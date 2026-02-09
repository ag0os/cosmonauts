/**
 * Tests for chain-runner.ts
 * Covers runStage (pipeline and loop modes), runChain (with mocked spawner module),
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
	maxIterations: number,
	completionCheck?: (projectRoot: string) => Promise<boolean>,
): ChainStage {
	const stage: ChainStage = { name, maxIterations };
	if (completionCheck) {
		stage.completionCheck = completionCheck;
	}
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
	describe("pipeline (single pass)", () => {
		test("spawns agent once when maxIterations is 1", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", 1);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(1);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("records duration > 0", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", 1);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		test("returns failure when spawner fails", async () => {
			const spawner = createMockSpawner([
				{ success: false, sessionId: "", messages: [], error: "boom" },
			]);
			const stage = makeStage("planner", 1);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toBe("boom");
			expect(result.iterations).toBe(1);
		});
	});

	describe("loop stage", () => {
		test("iterates maxIterations times when completion check always returns false", async () => {
			const spawner = createMockSpawner();
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", 3, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(3);
			expect(spawner.spawn).toHaveBeenCalledTimes(3);
			expect(completionCheck).toHaveBeenCalledTimes(3);
		});

		test("exits early when completion check returns true", async () => {
			const spawner = createMockSpawner();
			let callCount = 0;
			const completionCheck = vi.fn(async () => {
				callCount++;
				return callCount >= 2;
			});
			const stage = makeStage("coordinator", 5, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(2);
			expect(spawner.spawn).toHaveBeenCalledTimes(2);
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
			const stage = makeStage("worker", 10, completionCheck);
			const config = makeConfig([stage], { signal: controller.signal });

			const result = await runStage(stage, config, spawner);

			expect(result.iterations).toBeLessThan(10);
			expect(result.success).toBe(true);
		});

		test("stops iteration on spawner failure", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
				{ success: false, sessionId: "", messages: [], error: "agent crashed" },
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", 5, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

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

	test("returns false when there are no tasks", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns false when tasks exist but are not all Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		await tm.createTask({ title: "Task A" });
		await tm.createTask({ title: "Task B" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns true when all tasks are Done", async () => {
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

	test("returns false when some tasks are Done but not all", async () => {
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
	test("emits stage_start, agent_spawned, agent_completed, stage_end for pipeline stage via runChain", async () => {
		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const stage = makeStage("planner", 1);
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
		const stage = makeStage("coordinator", 3, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const iterationEvents = events.filter(
			(e) => e.type === "stage_iteration",
		);
		expect(iterationEvents).toHaveLength(3);
	});

	test("does not throw when onEvent callback throws", async () => {
		const spawner = createMockSpawner();
		const stage = makeStage("planner", 1);
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

	test("executes sequential stages successfully", async () => {
		const stages = [makeStage("planner", 1), makeStage("task-manager", 1)];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]!.success).toBe(true);
		expect(result.stageResults[1]!.success).toBe(true);
		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
		expect(result.errors).toHaveLength(0);
	});

	test("stops chain on stage failure", async () => {
		mockSpawnerForModule = createMockSpawner([
			{ success: true, sessionId: "session-1", messages: [] },
			{ success: false, sessionId: "", messages: [], error: "stage 2 failed" },
		]);

		const stages = [
			makeStage("planner", 1),
			makeStage("task-manager", 1),
			makeStage("worker", 1),
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
		const stages = [makeStage("planner", 1)];
		const config = makeConfig(stages, {
			onEvent: (event) => events.push(event),
		});

		await runChain(config);

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes[0]).toBe("chain_start");
		expect(eventTypes[eventTypes.length - 1]).toBe("chain_end");
	});

	test("respects abort signal between stages", async () => {
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

		const stages = [makeStage("planner", 1), makeStage("worker", 1)];
		const config = makeConfig(stages, { signal: controller.signal });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
	});

	test("disposes spawner after execution", async () => {
		const stages = [makeStage("planner", 1)];
		const config = makeConfig(stages);

		await runChain(config);

		expect(mockSpawnerForModule.dispose).toHaveBeenCalledTimes(1);
	});
});
