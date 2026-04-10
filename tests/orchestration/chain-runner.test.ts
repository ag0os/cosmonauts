/**
 * Tests for chain-runner.ts
 * Covers runStage (one-shot and loop modes), runChain (with mocked spawner module),
 * createDefaultCompletionCheck (with real task system), and event emission.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import {
	createDefaultCompletionCheck,
	derivePlanSlug,
	getDefaultStagePrompt,
	injectUserPrompt,
	runChain,
	runStage,
} from "../../lib/orchestration/chain-runner.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainStage,
	ChainStep,
	ParallelGroupStep,
	SpawnResult,
	SpawnStats,
} from "../../lib/orchestration/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

// ============================================================================
// Mock the agent-spawner module so runChain never creates real Pi sessions.
// Uses vi.hoisted() to make the pre-import mock reference explicit.
// ============================================================================

const spawnerRef = vi.hoisted(() => ({
	current: undefined as AgentSpawner | undefined,
}));

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => spawnerRef.current,
	getModelForRole: () => "test-provider/test-model",
	getThinkingForRole: () => undefined,
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

/** Build a minimal agent definition for testing. */
function makeCodingDef(id: string, loop: boolean): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		projectContext: false,
		session: "ephemeral",
		loop,
		domain: "coding",
	};
}

/** Test registry with the coding domain agents used across chain-runner tests. */
const defaultRegistry = new AgentRegistry([
	makeCodingDef("cosmo", false),
	makeCodingDef("planner", false),
	makeCodingDef("task-manager", false),
	makeCodingDef("coordinator", true),
	makeCodingDef("tdd-coordinator", true),
	makeCodingDef("worker", false),
	makeCodingDef("quality-manager", false),
	makeCodingDef("reviewer", false),
	makeCodingDef("fixer", false),
]);

function makeConfig(
	steps: ChainStep[],
	overrides?: Partial<ChainConfig>,
): ChainConfig {
	return {
		steps,
		projectRoot: "/tmp/test-project",
		registry: defaultRegistry,
		...overrides,
	};
}

describe("getDefaultStagePrompt", () => {
	test("returns a role-specific prompt for adaptation-planner", () => {
		expect(getDefaultStagePrompt("adaptation-planner")).toBe(
			"Study the reference implementation and design an adaptation plan for this project.",
		);
		expect(getDefaultStagePrompt("coding/adaptation-planner")).toBe(
			"Study the reference implementation and design an adaptation plan for this project.",
		);
	});
});

describe("derivePlanSlug", () => {
	test("extracts slug from plan completion labels", () => {
		expect(derivePlanSlug("plan:session-lineage")).toBe("session-lineage");
	});

	test("throws for path traversal slugs", () => {
		expect(() => derivePlanSlug("plan:../../etc/passwd")).toThrow(
			"Invalid plan slug",
		);
	});
});

// ============================================================================
// runStage Tests
// ============================================================================

describe("runStage", () => {
	describe("one-shot (loop=false)", () => {
		test("fails unknown stage role before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("unknown-role", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown agent role "unknown-role"');
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("rejects invalid derived planSlug before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				completionLabel: "plan:../../escape",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid plan slug");
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("rejects invalid explicit planSlug before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				planSlug: "..\\escape",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid plan slug");
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

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

		test("uses custom stage prompt when provided", async () => {
			const spawner = createMockSpawner();
			const stage: ChainStage = {
				name: "planner",
				loop: false,
				prompt: "Custom prompt for this stage",
			};
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({ prompt: "Custom prompt for this stage" }),
			);
		});

		test("uses default prompt when stage has no custom prompt", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: "Analyze the project and design an implementation plan.",
				}),
			);
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

		test("forwards compaction config from ChainConfig to spawn call", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				compaction: { enabled: true, keepRecentTokens: 8000 },
			});

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					compaction: { enabled: true, keepRecentTokens: 8000 },
				}),
			);
		});

		test("does not include compaction when not set in ChainConfig", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			const spawnArgs = (spawner.spawn as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[0];
			expect(spawnArgs?.compaction).toBeUndefined();
		});
	});

	describe("registry via config", () => {
		function makeDef(
			id: string,
			loop: boolean,
			domain?: string,
		): AgentDefinition {
			return {
				id,
				description: `Test ${id}`,
				capabilities: [],
				model: "test/model",
				tools: "none",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop,
				domain,
			};
		}

		test("uses config.registry to validate agent roles", async () => {
			const registry = new AgentRegistry([
				makeDef("custom-agent", false, "ops"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("custom-agent", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("rejects unknown agent when config.registry is provided", async () => {
			const registry = new AgentRegistry([
				makeDef("custom-agent", false, "ops"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("nonexistent", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown agent role "nonexistent"');
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("resolves qualified names via config.registry", async () => {
			const registry = new AgentRegistry([makeDef("runner", false, "ops")]);
			const spawner = createMockSpawner();
			const stage = makeStage("ops/runner", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("uses domainContext to resolve ambiguous unqualified names", async () => {
			const registry = new AgentRegistry([
				makeDef("planner", false, "coding"),
				makeDef("planner", false, "docs"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				registry,
				domainContext: "docs",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					role: "planner",
					domainContext: "docs",
				}),
			);
		});
	});

	describe("loop (loop=true)", () => {
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();

		test("iterates until completion check returns true", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

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
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(true);
			// completion check runs once before first spawn, then after iteration 1
			expect(result.iterations).toBe(1);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("exhausts iteration budget when completion never passes", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner();
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("reached max iterations");
			expect(result.iterations).toBe(3);
			expect(spawner.spawn).toHaveBeenCalledTimes(3);
			// one pre-check + once per iteration
			expect(completionCheck).toHaveBeenCalledTimes(4);
		});

		test("respects abort signal between iterations", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

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
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.iterations).toBeLessThan(10);
			expect(result.success).toBe(true);
		});

		test("stops on spawner failure", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

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
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("agent crashed");
			expect(result.iterations).toBe(2);
			expect(spawner.spawn).toHaveBeenCalledTimes(2);
		});

		test("fails fast when default completion scope has no tasks", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(join(tmpdir(), "chain-runner-stage-empty-"));
			const spawner = createMockSpawner();
			const stage = makeStage("coordinator", true);
			const config = makeConfig([stage], {
				projectRoot: tmpDir,
				completionLabel: "plan:missing",
			});

			try {
				const result = await runStage(stage, config, spawner, {
					maxTotalIterations: 10,
					deadlineMs: FIXED_NOW + 60_000,
				});

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("No tasks found");
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("fails fast when all scoped tasks are blocked", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-blocked-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({
				title: "A",
				labels: ["plan:alpha"],
			});
			const taskB = await tm.createTask({
				title: "B",
				labels: ["plan:alpha"],
			});
			await tm.updateTask(taskA.id, { status: "Blocked" });
			await tm.updateTask(taskB.id, { status: "Blocked" });

			const spawner = createMockSpawner();
			const stage = makeStage("coordinator", true);
			const config = makeConfig([stage], {
				projectRoot: tmpDir,
				completionLabel: "plan:alpha",
			});

			try {
				const result = await runStage(stage, config, spawner, {
					maxTotalIterations: 10,
					deadlineMs: FIXED_NOW + 60_000,
				});

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("Blocked");
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("forwards compaction config to spawn call in loop stage", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
			]);
			const completionCheck = vi
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage], {
				compaction: { enabled: true, keepRecentTokens: 4000 },
			});

			await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					compaction: { enabled: true, keepRecentTokens: 4000 },
				}),
			);
		});

		test("adds label-scoping instructions to coordinator prompt", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
			]);
			const completionCheck = vi
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage], {
				completionLabel: "review-round:1",
			});

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining(
						'Scope constraint: Operate only on tasks labeled "review-round:1"',
					),
				}),
			);
		});

		test("adds label-scoping instructions to tdd-coordinator prompt", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
			]);
			const completionCheck = vi
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);
			const stage = makeStage("tdd-coordinator", true, completionCheck);
			const config = makeConfig([stage], {
				completionLabel: "plan:alpha",
			});

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining(
						'Scope constraint: Operate only on tasks labeled "plan:alpha"',
					),
				}),
			);
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

	test("label scope ignores unrelated incomplete tasks", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const scopedDone = await tm.createTask({
			title: "Scoped done task",
			labels: ["plan:alpha"],
		});
		await tm.createTask({
			title: "Scoped pending task in another plan",
			labels: ["plan:beta"],
		});

		await tm.updateTask(scopedDone.id, { status: "Done" });

		const scopedCheck = createDefaultCompletionCheck(tmpDir, "plan:alpha");
		const unscopedCheck = createDefaultCompletionCheck(tmpDir);

		expect(await scopedCheck()).toBe(true);
		expect(await unscopedCheck()).toBe(false);
	});

	test("label scope returns false when matching set is empty", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		await tm.createTask({ title: "General task", labels: ["backend"] });

		const scopedCheck = createDefaultCompletionCheck(tmpDir, "plan:missing");
		expect(await scopedCheck()).toBe(false);
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
		vi.useFakeTimers();
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(FIXED_NOW);

		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const completionCheck = vi.fn(async () => false);
		const stage = makeStage("coordinator", true, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner, {
			maxTotalIterations: 3,
			deadlineMs: FIXED_NOW + 60_000,
		});

		const iterationEvents = events.filter((e) => e.type === "stage_iteration");
		expect(iterationEvents).toHaveLength(3);
	});

	test("forwards agent_turn and agent_tool_use events from spawner onEvent", async () => {
		const events: ChainEvent[] = [];
		const sessionId = "mock-session";
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				// Simulate events from the spawner's onEvent callback
				config.onEvent?.({ type: "turn_start", sessionId });
				config.onEvent?.({
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tc-1",
					sessionId,
				});
				config.onEvent?.({
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "tc-1",
					isError: false,
					sessionId,
				});
				config.onEvent?.({ type: "turn_end", sessionId });
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const turnEvents = events.filter((e) => e.type === "agent_turn");
		const toolEvents = events.filter((e) => e.type === "agent_tool_use");
		expect(turnEvents).toHaveLength(2);
		expect(toolEvents).toHaveLength(2);

		// Verify structure of forwarded events
		const firstTurn = turnEvents[0] as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>;
		expect(firstTurn.role).toBe("planner");
		expect(firstTurn.sessionId).toBe(sessionId);
		expect(firstTurn.event.type).toBe("turn_start");

		const firstTool = toolEvents[0] as Extract<
			ChainEvent,
			{ type: "agent_tool_use" }
		>;
		expect(firstTool.role).toBe("planner");
		expect(firstTool.sessionId).toBe(sessionId);
		expect(firstTool.event.type).toBe("tool_execution_start");
	});

	test("uses each loop spawn sessionId when forwarding events", async () => {
		const events: ChainEvent[] = [];
		let spawnCount = 0;
		const completionCheck = vi.fn(async () => spawnCount >= 2);
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				spawnCount++;
				const sessionId = `loop-session-${spawnCount}`;
				config.onEvent?.({ type: "turn_start", sessionId });
				config.onEvent?.({ type: "turn_end", sessionId });
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("coordinator", true, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner, {
			maxTotalIterations: 3,
			deadlineMs: Date.now() + 60_000,
		});

		const turnEvents = events.filter((e) => e.type === "agent_turn") as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>[];
		expect(turnEvents.map((event) => event.sessionId)).toEqual([
			"loop-session-1",
			"loop-session-1",
			"loop-session-2",
			"loop-session-2",
		]);
	});

	test("forwards auto_compaction events as agent_turn", async () => {
		const events: ChainEvent[] = [];
		const sessionId = "mock-session";
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				config.onEvent?.({
					type: "auto_compaction_start",
					reason: "threshold",
					sessionId,
				});
				config.onEvent?.({
					type: "auto_compaction_end",
					aborted: false,
					sessionId,
				});
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const turnEvents = events.filter((e) => e.type === "agent_turn") as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>[];
		expect(turnEvents).toHaveLength(2);
		expect(turnEvents[0]?.sessionId).toBe(sessionId);
		expect(turnEvents[0]?.event.type).toBe("auto_compaction_start");
		expect(turnEvents[1]?.sessionId).toBe(sessionId);
		expect(turnEvents[1]?.event.type).toBe("auto_compaction_end");
	});

	test("does not pass onEvent to spawner when chain has no onEvent", async () => {
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				expect(config.onEvent).toBeUndefined();
				return {
					success: true,
					sessionId: "mock-session",
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage]); // no onEvent

		await runStage(stage, config, spawner);

		expect(spawner.spawn).toHaveBeenCalledTimes(1);
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
		spawnerRef.current = createMockSpawner();
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
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
		expect(result.errors).toHaveLength(0);
	});

	test("user prompt injection preserves default first-stage role prompt", async () => {
		const steps = parseChain("planner -> task-manager", defaultRegistry);
		injectUserPrompt(steps, "build auth");

		await runChain(makeConfig(steps));

		expect(spawnerRef.current?.spawn).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "planner",
				prompt:
					"Analyze the project and design an implementation plan.\n\nUser request: build auth",
			}),
		);
	});

	test("parallel first-stage members preserve role prompts with injected user request", async () => {
		const steps = parseChain(
			"[planner, reviewer] -> task-manager",
			defaultRegistry,
		);
		injectUserPrompt(steps, "focus on security");

		await runChain(makeConfig(steps));

		const spawnMock = spawnerRef.current?.spawn;
		expect(spawnMock).toBeDefined();
		if (!spawnMock) return;
		const calls = vi.mocked(spawnMock).mock.calls;
		const plannerCall = calls.find(([args]) => args.role === "planner")?.[0];
		const reviewerCall = calls.find(([args]) => args.role === "reviewer")?.[0];

		expect(plannerCall?.prompt).toBe(
			"Analyze the project and design an implementation plan.\n\nUser request: focus on security",
		);
		expect(reviewerCall?.prompt).toBe(
			"Review the current branch changes against main and write actionable findings.\n\nUser request: focus on security",
		);
	});

	test("stage failure stops chain", async () => {
		spawnerRef.current = createMockSpawner([
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
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(false);
		expect(result.errors).toContain("stage 2 failed");
	});

	test("unknown stage role fails chain immediately", async () => {
		const stages = [
			makeStage("unknown-role", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]?.success).toBe(false);
		expect(result.stageResults[0]?.error).toContain(
			'Unknown agent role "unknown-role"',
		);
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
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				if (spawnCount === 1) {
					controller.abort();
				}
				return { success: true, sessionId: `s-${spawnCount}`, messages: [] };
			}),
			dispose: vi.fn(),
		};

		const stages = [makeStage("planner", false), makeStage("worker", false)];
		const config = makeConfig(stages, { signal: controller.signal });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
	});

	test("spawner disposed after execution", async () => {
		const stages = [makeStage("planner", false)];
		const config = makeConfig(stages);

		await runChain(config);

		expect(spawnerRef.current?.dispose).toHaveBeenCalledTimes(1);
	});

	test("one-shot stages do not consume loop iteration budget", async () => {
		// Chain: 2 one-shot stages then a loop stage with budget of 3.
		// Previously, each one-shot consumed 1 from the budget, leaving only 1
		// for the loop stage. Now one-shot stages are excluded from the budget.
		const completionCheck = vi.fn(async () => false); // never passes

		let spawnCount = 0;
		spawnerRef.current = {
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

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(3);
		// One-shot stages still report iterations=1 in their results
		expect(result.stageResults[0]?.iterations).toBe(1);
		expect(result.stageResults[1]?.iterations).toBe(1);
		// Loop stage gets the full budget of 3, not 3 - 2 = 1
		expect(result.stageResults[2]?.iterations).toBe(3);
		expect(result.stageResults[2]?.success).toBe(false);
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
		spawnerRef.current = {
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

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		// First stage: 1 iteration (pre-check + post-iteration check reaches completion)
		expect(result.stageResults[0]?.iterations).toBe(1);
		// Second stage: remaining budget is 2 (3 - 1 = 2)
		expect(result.stageResults[1]?.iterations).toBe(2);
		expect(result.stageResults[1]?.success).toBe(false);
	});

	test("chain-level timeout stops execution between stages", async () => {
		vi.useFakeTimers();
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(FIXED_NOW);

		let spawnCount = 0;
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				// After first stage completes, advance time past the timeout
				if (spawnCount === 1) {
					vi.setSystemTime(FIXED_NOW + 5000);
				}
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
			makeStage("worker", false),
		];
		const config = makeConfig(stages, { timeoutMs: 3000 });

		const result = await runChain(config);

		// Timeout skips remaining stages — only the first stage ran
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]?.success).toBe(true);
		// Chain reports success since no stage actually failed (timeout is
		// a silent exit, not an error — matching abort signal behavior)
		expect(result.success).toBe(true);
		expect(spawnCount).toBe(1);
	});
});

// ============================================================================
// Qualified Stage End-to-End Tests (parse + run with shared registry)
// ============================================================================

describe("qualified stage chain end-to-end", () => {
	function makeDef(
		id: string,
		loop: boolean,
		domain?: string,
	): AgentDefinition {
		return {
			id,
			description: `Test ${id}`,
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			projectContext: false,
			session: "ephemeral",
			loop,
			domain,
		};
	}

	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	test("qualified one-shot stages parse and run successfully", async () => {
		const registry = new AgentRegistry([
			makeDef("designer", false, "ops"),
			makeDef("builder", false, "ops"),
		]);

		// Parse with the same registry that runChain will use
		const stages = parseChain("ops/designer -> ops/builder", registry);

		expect(stages).toEqual([
			{ name: "ops/designer", loop: false },
			{ name: "ops/builder", loop: false },
		]);

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
	});

	test("qualified loop stage gets loop: true from registry through parse + run", async () => {
		const registry = new AgentRegistry([
			makeDef("scheduler", false, "ops"),
			makeDef("orchestrator", true, "ops"),
		]);

		const stages = parseChain("ops/scheduler -> ops/orchestrator", registry);

		// Verify loop detection used the registry (not false positive)
		expect((stages[0] as ChainStage | undefined)?.loop).toBe(false);
		expect((stages[1] as ChainStage | undefined)?.loop).toBe(true);

		// Attach a completion check so the loop stage terminates
		const completionCheck = vi.fn(async () => true);
		const loopStage = stages[1] as ChainStage | undefined;
		if (loopStage) stages[1] = { ...loopStage, completionCheck };

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
	});

	test("mixed qualified and unqualified names resolve through shared registry", async () => {
		const registry = new AgentRegistry([
			makeDef("planner", false, "coding"),
			makeDef("coordinator", true, "coding"),
		]);

		// "planner" unqualified resolves via scan-all, "coding/coordinator" qualified
		const stages = parseChain("planner -> coding/coordinator", registry);

		expect((stages[0] as ChainStage | undefined)?.loop).toBe(false);
		expect((stages[1] as ChainStage | undefined)?.loop).toBe(true);

		const completionCheck = vi.fn(async () => true);
		const loopStage2 = stages[1] as ChainStage | undefined;
		if (loopStage2) stages[1] = { ...loopStage2, completionCheck };

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
	});

	test("unknown qualified name fails at run time", async () => {
		const registry = new AgentRegistry([makeDef("designer", false, "ops")]);

		const stages = parseChain("ops/designer -> ops/missing", registry);

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(false);
		expect(result.stageResults[1]?.error).toContain(
			'Unknown agent role "ops/missing"',
		);
	});
});

// ============================================================================
// Stats Tracking Tests
// ============================================================================

/** Create a mock SpawnStats with distinguishable values. */
function makeMockStats(seed: number): SpawnStats {
	return {
		tokens: {
			input: seed * 100,
			output: seed * 50,
			cacheRead: seed * 10,
			cacheWrite: seed * 5,
			total: seed * 165,
		},
		cost: seed * 0.01,
		durationMs: seed * 1000,
		turns: seed,
		toolCalls: seed * 2,
	};
}

describe("stats tracking", () => {
	describe("runStage stats", () => {
		test("one-shot stage includes spawn stats in result", async () => {
			const stats = makeMockStats(1);
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.stats).toEqual(stats);
		});

		test("one-shot stage has no stats when spawner returns none", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.stats).toBeUndefined();
		});

		test("loop stage aggregates stats across iterations", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			const stats3 = makeMockStats(3);

			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
				{ success: true, sessionId: "s-3", messages: [], stats: stats3 },
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.iterations).toBe(3);
			expect(result.stats).toBeDefined();
			// Sum of seeds 1+2+3 = 6
			expect(result.stats?.tokens.input).toBe(600);
			expect(result.stats?.tokens.output).toBe(300);
			expect(result.stats?.tokens.cacheRead).toBe(60);
			expect(result.stats?.tokens.cacheWrite).toBe(30);
			expect(result.stats?.tokens.total).toBe(990);
			expect(result.stats?.cost).toBeCloseTo(0.06);
			expect(result.stats?.durationMs).toBe(6000);
			expect(result.stats?.turns).toBe(6);
			expect(result.stats?.toolCalls).toBe(12);
		});

		test("loop stage includes partial stats on spawn failure", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{
					success: false,
					sessionId: "",
					messages: [],
					error: "crashed",
				},
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.stats).toBeDefined();
			expect(result.stats?.tokens.input).toBe(100);
			expect(result.stats?.cost).toBeCloseTo(0.01);
		});
	});

	describe("runChain stats", () => {
		test("chain result includes ChainStats with per-stage breakdown", async () => {
			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
			]);

			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages);

			const result = await runChain(config);

			expect(result.success).toBe(true);
			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(2);
			expect(result.stats?.stages[0]?.stageName).toBe("planner");
			expect(result.stats?.stages[0]?.stats).toEqual(stats1);
			expect(result.stats?.stages[0]?.iterations).toBe(1);
			expect(result.stats?.stages[1]?.stageName).toBe("task-manager");
			expect(result.stats?.stages[1]?.stats).toEqual(stats2);
			// Totals: sum of seeds 1+2 = 3
			expect(result.stats?.totalCost).toBeCloseTo(0.03);
			expect(result.stats?.totalTokens).toBe(495); // 165 + 330
			expect(result.stats?.totalDurationMs).toBe(3000);
		});

		test("chain_end event payload includes ChainStats", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const chainEnd = events.find((e) => e.type === "chain_end");
			expect(chainEnd).toBeDefined();
			if (
				!chainEnd ||
				chainEnd.type !== "chain_end" ||
				!chainEnd.result.stats
			) {
				throw new Error("Expected chain_end event with stats");
			}
			const stats = chainEnd.result.stats;
			expect(stats.totalCost).toBeCloseTo(0.01);
			expect(stats.totalTokens).toBe(165);
		});

		test("stage_stats event emitted after each stage", async () => {
			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
			]);

			const events: ChainEvent[] = [];
			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const stageStatsEvents = events.filter(
				(e) => e.type === "stage_stats",
			) as Extract<ChainEvent, { type: "stage_stats" }>[];
			expect(stageStatsEvents).toHaveLength(2);
			expect(stageStatsEvents[0]?.stage.name).toBe("planner");
			expect(stageStatsEvents[0]?.stats).toEqual(stats1);
			expect(stageStatsEvents[1]?.stage.name).toBe("task-manager");
			expect(stageStatsEvents[1]?.stats).toEqual(stats2);
		});

		test("stage_stats emitted before stage_end", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const eventTypes = events.map((e) => e.type);
			const statsIdx = eventTypes.indexOf("stage_stats");
			const endIdx = eventTypes.indexOf("stage_end");
			expect(statsIdx).toBeGreaterThan(-1);
			expect(endIdx).toBeGreaterThan(statsIdx);
		});

		test("no stage_stats event when spawn has no stats", async () => {
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const stageStatsEvents = events.filter((e) => e.type === "stage_stats");
			expect(stageStatsEvents).toHaveLength(0);
		});

		test("ChainStats excludes stages without stats", async () => {
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
				{
					success: true,
					sessionId: "s-2",
					messages: [],
					stats: makeMockStats(2),
				},
			]);

			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages);

			const result = await runChain(config);

			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(1);
			expect(result.stats?.stages[0]?.stageName).toBe("task-manager");
		});

		test("stats accumulate across loop iterations in chain result", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			const stats3 = makeMockStats(3);

			let spawnIdx = 0;
			const spawnResults: SpawnResult[] = [
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
				{ success: true, sessionId: "s-3", messages: [], stats: stats3 },
			];
			spawnerRef.current = {
				spawn: vi.fn(async () => {
					const fallbackResult = spawnResults[0];
					if (!fallbackResult) {
						throw new Error("Expected at least one spawn result");
					}
					const result = spawnResults[spawnIdx] ?? fallbackResult;
					spawnIdx++;
					return result;
				}),
				dispose: vi.fn(),
			};

			// One-shot stage followed by a 2-iteration loop stage
			let loopChecks = 0;
			const completionCheck = vi.fn(async () => {
				loopChecks++;
				return loopChecks >= 3; // pre-check(1), post-iter1(2), post-iter2(3) → done
			});

			const stages = [
				makeStage("planner", false),
				makeStage("coordinator", true, completionCheck),
			];
			const config = makeConfig(stages, { maxTotalIterations: 10 });

			const result = await runChain(config);

			expect(result.success).toBe(true);
			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(2);

			// First stage: one-shot, stats from seed=1
			expect(result.stats?.stages[0]?.stageName).toBe("planner");
			expect(result.stats?.stages[0]?.iterations).toBe(1);
			expect(result.stats?.stages[0]?.stats.cost).toBeCloseTo(0.01);

			// Second stage: loop with 2 iterations, stats from seeds 2+3
			expect(result.stats?.stages[1]?.stageName).toBe("coordinator");
			expect(result.stats?.stages[1]?.iterations).toBe(2);
			expect(result.stats?.stages[1]?.stats.cost).toBeCloseTo(0.05);
			expect(result.stats?.stages[1]?.stats.tokens.input).toBe(500); // 200+300

			// Totals: seeds 1+2+3
			expect(result.stats?.totalCost).toBeCloseTo(0.06);
			expect(result.stats?.totalTokens).toBe(990);
			expect(result.stats?.totalDurationMs).toBe(6000);
		});
	});

	describe("stats stay ephemeral", () => {
		test("stats are in-memory only — no persistence to disk", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages);

			const result = await runChain(config);

			// Stats exist on the returned object
			expect(result.stats).toBeDefined();
			// No disk writes — stats only live on the returned ChainResult/StageResult
			// (The chain runner writes no files; this test just asserts the stats
			// are returned in-memory and there's no serialization code.)
			expect(result.stageResults[0]?.stats).toEqual(stats1);
		});
	});
});

// ============================================================================
// Parallel Group Tests
// ============================================================================

describe("parallel group execution", () => {
	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	/** Build a parallel group step with a group syntax. */
	function makeParallelStep(
		...stages: [ChainStage, ChainStage, ...ChainStage[]]
	): ParallelGroupStep {
		return { kind: "parallel", stages, syntax: { kind: "group" } };
	}

	test("parallel members are launched concurrently, not sequentially", async () => {
		// Planner blocks until worker has started its spawn.
		// Sequential execution would deadlock; concurrent execution resolves normally.
		const resolvers: Array<() => void> = [];

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					// Block until worker unblocks us.
					await new Promise<void>((r) => resolvers.push(r));
				} else {
					// Worker unblocks planner, then completes.
					resolvers[0]?.();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		// Completing without deadlock proves worker was started while planner was blocked.
		expect(result.success).toBe(true);
		expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(2);
	});

	test("parallel_start fires before member stage_start events; parallel_end fires after all stage_end/stage_stats", async () => {
		const events: ChainEvent[] = [];
		spawnerRef.current = createMockSpawner([
			{
				success: true,
				sessionId: "s-1",
				messages: [],
				stats: makeMockStats(1),
			},
			{
				success: true,
				sessionId: "s-2",
				messages: [],
				stats: makeMockStats(2),
			},
		]);

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		await runChain(makeConfig([step], { onEvent: (e) => events.push(e) }));

		const types = events.map((e) => e.type);
		const parallelStartIdx = types.indexOf("parallel_start");
		const parallelEndIdx = types.indexOf("parallel_end");
		const stageStartIndices: number[] = [];
		const stageEndIndices: number[] = [];
		const stageStatsIndices: number[] = [];
		types.forEach((type, index) => {
			if (type === "stage_start") {
				stageStartIndices.push(index);
			}
			if (type === "stage_end") {
				stageEndIndices.push(index);
			}
			if (type === "stage_stats") {
				stageStatsIndices.push(index);
			}
		});

		expect(parallelStartIdx).toBeGreaterThan(-1);
		expect(parallelEndIdx).toBeGreaterThan(-1);

		// parallel_start precedes every stage_start
		for (const idx of stageStartIndices) {
			expect(parallelStartIdx).toBeLessThan(idx);
		}

		// parallel_end follows every stage_end and stage_stats
		for (const idx of [...stageEndIndices, ...stageStatsIndices]) {
			expect(parallelEndIdx).toBeGreaterThan(idx);
		}
	});

	test("stageResults append members in declaration order regardless of completion order", async () => {
		// Worker finishes first; planner waits for worker before completing.
		let resolveWorker!: () => void;
		const workerDone = new Promise<void>((r) => {
			resolveWorker = r;
		});

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					await workerDone;
				} else {
					// Worker resolves before planner completes.
					resolveWorker();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		// Declaration order: planner first, worker second.
		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		// Worker finished first but results are in declaration order.
		expect(result.stageResults[0]?.stage.name).toBe("planner");
		expect(result.stageResults[1]?.stage.name).toBe("worker");
	});

	test("failing member causes parallel_end with success:false and stops subsequent steps", async () => {
		const events: ChainEvent[] = [];
		spawnerRef.current = createMockSpawner([
			{
				success: false,
				sessionId: "",
				messages: [],
				error: "planner-failed",
			},
			{ success: true, sessionId: "s-worker", messages: [] },
		]);

		const parallelStep = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const nextStep = makeStage("task-manager", false);

		const result = await runChain(
			makeConfig([parallelStep, nextStep], {
				onEvent: (e) => events.push(e),
			}),
		);

		// parallel_end carries success: false
		const parallelEnd = events.find((e) => e.type === "parallel_end") as
			| Extract<ChainEvent, { type: "parallel_end" }>
			| undefined;
		expect(parallelEnd?.success).toBe(false);

		// Both parallel members ran; task-manager was skipped.
		expect(result.stageResults).toHaveLength(2);
		expect(spawnerRef.current?.spawn).not.toHaveBeenCalledWith(
			expect.objectContaining({ role: "task-manager" }),
		);

		// Overall chain failed.
		expect(result.success).toBe(false);
		expect(result.errors).toContain("planner-failed");
	});

	test("all-settled: runner waits for all members before emitting parallel_end", async () => {
		let workerSettled = false;
		let parallelEndEmittedEarly = false;

		const events: ChainEvent[] = [];
		let resolveWorker!: () => void;

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					// Fail immediately — no await.
					return {
						success: false,
						sessionId: "",
						messages: [],
						error: "planner-err",
					};
				}
				// Worker blocks until explicitly resolved.
				await new Promise<void>((r) => {
					resolveWorker = r;
				});
				workerSettled = true;
				return { success: true, sessionId: "s-worker", messages: [] };
			}),
			dispose: vi.fn(),
		};

		const onEvent = (e: ChainEvent) => {
			if (e.type === "parallel_end" && !workerSettled) {
				parallelEndEmittedEarly = true;
			}
			events.push(e);
		};

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const chainPromise = runChain(makeConfig([step], { onEvent }));

		// Yield to let planner's synchronous failure propagate through promises.
		// A macrotask boundary ensures all pending microtasks (planner's chain)
		// have been processed before we assert the intermediate state.
		await new Promise<void>((r) => setTimeout(r, 0));

		// Worker is still blocked — parallel_end must NOT have been emitted yet.
		expect(parallelEndEmittedEarly).toBe(false);

		// Unblock worker.
		resolveWorker();
		await chainPromise;

		// parallel_end now exists and carries the failure.
		expect(workerSettled).toBe(true);
		expect(parallelEndEmittedEarly).toBe(false);
		const pe = events.find((e) => e.type === "parallel_end") as Extract<
			ChainEvent,
			{ type: "parallel_end" }
		>;
		expect(pe?.success).toBe(false);
	});

	test("abort signal between parallel group and next step prevents next step from starting", async () => {
		const controller = new AbortController();

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				// Either parallel member firing abort is sufficient; idempotent.
				if (spawnConfig.role === "planner" || spawnConfig.role === "worker") {
					controller.abort();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const parallelStep = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const afterStep = makeStage("task-manager", false);

		const result = await runChain(
			makeConfig([parallelStep, afterStep], { signal: controller.signal }),
		);

		// Both parallel members ran.
		expect(result.stageResults).toHaveLength(2);
		// task-manager was skipped because signal was aborted.
		expect(spawnerRef.current?.spawn).not.toHaveBeenCalledWith(
			expect.objectContaining({ role: "task-manager" }),
		);
		expect(result.success).toBe(false);
	});

	test("parallel stats sum tokens/cost/turns/toolCalls; totalDurationMs is not the sum of member durations", async () => {
		const stats1 = makeMockStats(1); // durationMs: 1000
		const stats2 = makeMockStats(2); // durationMs: 2000 — sum would be 3000

		spawnerRef.current = createMockSpawner([
			{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
		]);

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		expect(result.success).toBe(true);
		expect(result.stats).toBeDefined();

		// Tokens and cost are summed across parallel members (seeds 1+2).
		expect(result.stats?.totalCost).toBeCloseTo(0.03); // 0.01 + 0.02
		expect(result.stats?.totalTokens).toBe(495); // 165 + 330

		// Both stages are individually tracked in the breakdown.
		expect(result.stats?.stages).toHaveLength(2);
		const plannerStats = result.stats?.stages.find(
			(s) => s.stageName === "planner",
		);
		const workerStats = result.stats?.stages.find(
			(s) => s.stageName === "worker",
		);
		expect(plannerStats?.stats.turns).toBe(1); // seed 1
		expect(workerStats?.stats.turns).toBe(2); // seed 2
		expect(plannerStats?.stats.toolCalls).toBe(2); // seed 1 × 2
		expect(workerStats?.stats.toolCalls).toBe(4); // seed 2 × 2

		// totalDurationMs uses the group wall-clock (≈ max member duration with real
		// concurrency), NOT the sum of spawn-stats durations.
		const sumOfMemberDurations = stats1.durationMs + stats2.durationMs; // 3000
		expect(result.stats?.totalDurationMs).toBeLessThan(sumOfMemberDurations);
	});
});
