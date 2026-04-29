/**
 * Tests for chain event logger formatting.
 */

import { describe, expect, test } from "vitest";
import {
	createChainEventLogger,
	formatChainEvent,
	formatDuration,
} from "../../cli/chain-event-logger.ts";
import type { ChainEvent } from "../../lib/orchestration/types.ts";
import { captureCliOutput } from "../helpers/cli.ts";

describe("formatDuration", () => {
	test("formats milliseconds under 1 second", () => {
		expect(formatDuration(500)).toBe("500ms");
		expect(formatDuration(0)).toBe("0ms");
	});

	test("formats seconds under 1 minute", () => {
		expect(formatDuration(1000)).toBe("1s");
		expect(formatDuration(45000)).toBe("45s");
	});

	test("formats minutes with remaining seconds", () => {
		expect(formatDuration(90000)).toBe("1m 30s");
		expect(formatDuration(323000)).toBe("5m 23s");
	});

	test("formats exact minutes without remaining seconds", () => {
		expect(formatDuration(60000)).toBe("1m");
		expect(formatDuration(300000)).toBe("5m");
	});
});

describe("formatChainEvent", () => {
	test("formats chain_start event with sequential steps", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			],
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Starting: planner -> coordinator",
		);
	});

	test("formats chain_start event with parallel group step", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [
				{ name: "planner", loop: false },
				{
					kind: "parallel",
					stages: [
						{ name: "task-manager", loop: false },
						{ name: "reviewer", loop: false },
					],
					syntax: { kind: "group" },
				},
			],
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Starting: planner -> [task-manager, reviewer]",
		);
	});

	test("formats parallel_start event", () => {
		const event: ChainEvent = {
			type: "parallel_start",
			step: {
				kind: "parallel",
				stages: [
					{ name: "task-manager", loop: false },
					{ name: "reviewer", loop: false },
				],
				syntax: { kind: "group" },
			},
			stepIndex: 1,
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Parallel [task-manager, reviewer] starting...",
		);
	});

	test("formats parallel_end success event", () => {
		const event: ChainEvent = {
			type: "parallel_end",
			step: {
				kind: "parallel",
				stages: [
					{ name: "task-manager", loop: false },
					{ name: "reviewer", loop: false },
				],
				syntax: { kind: "group" },
			},
			stepIndex: 1,
			results: [],
			success: true,
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Parallel [task-manager, reviewer] Completed",
		);
	});

	test("formats parallel_end failure event with error", () => {
		const event: ChainEvent = {
			type: "parallel_end",
			step: {
				kind: "parallel",
				stages: [
					{ name: "task-manager", loop: false },
					{ name: "reviewer", loop: false },
				],
				syntax: { kind: "group" },
			},
			stepIndex: 1,
			results: [],
			success: false,
			error: "reviewer timed out",
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Parallel [task-manager, reviewer] Failed — reviewer timed out",
		);
	});

	test("formats chain_end success event", () => {
		const event: ChainEvent = {
			type: "chain_end",
			result: {
				success: true,
				stageResults: [],
				totalDurationMs: 323000,
				errors: [],
			},
		};
		expect(formatChainEvent(event)).toBe("[chain] Complete (5m 23s)");
	});

	test("formats chain_end failure event", () => {
		const event: ChainEvent = {
			type: "chain_end",
			result: {
				success: false,
				stageResults: [],
				totalDurationMs: 5000,
				errors: ["stage failed"],
			},
		};
		expect(formatChainEvent(event)).toBe("[chain] Failed (5s)");
	});

	test("formats stage_start event", () => {
		const event: ChainEvent = {
			type: "stage_start",
			stage: { name: "planner", loop: false },
			stageIndex: 0,
		};
		expect(formatChainEvent(event)).toBe("[planner] Starting...");
	});

	test("formats stage_end success event", () => {
		const event: ChainEvent = {
			type: "stage_end",
			stage: { name: "planner", loop: false },
			result: {
				stage: { name: "planner", loop: false },
				success: true,
				iterations: 1,
				durationMs: 45000,
			},
		};
		expect(formatChainEvent(event)).toBe("[planner] Completed (45s)");
	});

	test("formats stage_end failure event with error", () => {
		const event: ChainEvent = {
			type: "stage_end",
			stage: { name: "worker", loop: false },
			result: {
				stage: { name: "worker", loop: false },
				success: false,
				iterations: 1,
				durationMs: 2000,
				error: "model not found",
			},
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Failed (2s) — model not found",
		);
	});

	test("formats stage_iteration event", () => {
		const event: ChainEvent = {
			type: "stage_iteration",
			stage: { name: "coordinator", loop: true },
			iteration: 3,
		};
		expect(formatChainEvent(event)).toBe(
			"[coordinator] Starting iteration 3...",
		);
	});

	test("formats stage_stats event", () => {
		const event: ChainEvent = {
			type: "stage_stats",
			stage: { name: "planner", loop: false },
			stats: {
				tokens: {
					input: 100,
					output: 50,
					cacheRead: 25,
					cacheWrite: 10,
					total: 185,
				},
				cost: 0.123456,
				durationMs: 2000,
				turns: 2,
				toolCalls: 1,
			},
		};
		expect(formatChainEvent(event)).toBe(
			"[planner] Stats: $0.1235, 185 tokens",
		);
	});

	test("formats agent_spawned event", () => {
		const event: ChainEvent = {
			type: "agent_spawned",
			role: "worker",
			sessionId: "session-abc123",
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Spawned worker (session-abc123)",
		);
	});

	test("formats agent_completed event", () => {
		const event: ChainEvent = {
			type: "agent_completed",
			role: "worker",
			sessionId: "session-abc123",
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Agent completed (session-abc123)",
		);
	});

	test("formats agent_turn event", () => {
		const event: ChainEvent = {
			type: "agent_turn",
			role: "worker",
			sessionId: "session-abc123",
			event: {
				type: "turn_start",
				sessionId: "session-abc123",
			},
		};
		expect(formatChainEvent(event)).toBe("[worker] Turn event: turn_start");
	});

	test("formats agent_tool_use event with tool name", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "worker",
			sessionId: "session-abc123",
			event: {
				type: "tool_execution_start",
				sessionId: "session-abc123",
				toolName: "task_view",
				toolCallId: "tool-call-1",
			},
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Tool event: tool_execution_start (task_view)",
		);
	});

	test("formats agent_tool_use event without tool name", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "worker",
			sessionId: "session-abc123",
			event: {
				type: "auto_compaction_start",
				sessionId: "session-abc123",
				reason: "threshold",
			},
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Tool event: auto_compaction_start",
		);
	});

	test("formats error event with stage", () => {
		const event: ChainEvent = {
			type: "error",
			message: "timeout exceeded",
			stage: { name: "coordinator", loop: true },
		};
		expect(formatChainEvent(event)).toBe(
			"[coordinator] Error: timeout exceeded",
		);
	});

	test("formats error event without stage", () => {
		const event: ChainEvent = {
			type: "error",
			message: "chain aborted",
		};
		expect(formatChainEvent(event)).toBe("Error: chain aborted");
	});

	test("formats spawn_completion success event", () => {
		const event: ChainEvent = {
			type: "spawn_completion",
			spawnId: "spawn-1",
			role: "worker",
			outcome: "success",
			summary: "implemented task",
		};
		expect(formatChainEvent(event)).toBe(
			"[worker] Spawn spawn-1 Completed: implemented task",
		);
	});

	test("formats spawn_completion failure event", () => {
		const event: ChainEvent = {
			type: "spawn_completion",
			spawnId: "spawn-2",
			role: "reviewer",
			outcome: "failure",
			summary: "tests failed",
		};
		expect(formatChainEvent(event)).toBe(
			"[reviewer] Spawn spawn-2 Failed: tests failed",
		);
	});
});

describe("createChainEventLogger", () => {
	test("writes one formatted event line to stderr", () => {
		const output = captureCliOutput();
		try {
			const logger = createChainEventLogger();

			logger({
				type: "stage_start",
				stage: { name: "planner", loop: false },
				stageIndex: 0,
			});

			expect(output.stdout()).toBe("");
			expect(output.stderr()).toBe("[planner] Starting...\n");
		} finally {
			output.restore();
		}
	});
});
