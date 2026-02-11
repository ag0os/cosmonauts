/**
 * Tests for chain event logger formatting.
 */

import { describe, expect, test } from "vitest";
import {
	formatChainEvent,
	formatDuration,
} from "../../cli/chain-event-logger.ts";
import type { ChainEvent } from "../../lib/orchestration/types.ts";

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
	test("formats chain_start event", () => {
		const event: ChainEvent = {
			type: "chain_start",
			stages: [
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			],
		};
		expect(formatChainEvent(event)).toBe(
			"[chain] Starting: planner -> coordinator",
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
});
