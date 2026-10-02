/**
 * Tests for chain-stats.ts.
 * Covers ChainStats aggregation and parsing persisted SpawnStats.
 */

import { describe, expect, test } from "vitest";
import {
	buildChainStats,
	parseSpawnStats,
} from "../../lib/orchestration/chain-stats.ts";
import type { SpawnStats, StageResult } from "../../lib/orchestration/types.ts";

function stats(seed: number): SpawnStats {
	return {
		tokens: {
			input: seed * 100,
			output: seed * 10,
			cacheRead: seed * 1000,
			cacheWrite: seed,
			total: seed * 1111,
		},
		cost: seed * 0.5,
		durationMs: seed * 1000,
		turns: seed,
		toolCalls: seed * 2,
	};
}

function stageResult(name: string, spawnStats?: SpawnStats): StageResult {
	return {
		stage: { name, loop: false },
		success: true,
		iterations: 1,
		durationMs: 0,
		...(spawnStats && { stats: spawnStats }),
	};
}

describe("buildChainStats", () => {
	test("sums stage spawn durations when no total duration is given", () => {
		const result = buildChainStats([
			stageResult("planner", stats(1)),
			stageResult("reviewer", stats(2)),
		]);

		expect(result).toEqual({
			stages: [
				{ stageName: "planner", iterations: 1, stats: stats(1) },
				{ stageName: "reviewer", iterations: 1, stats: stats(2) },
			],
			totalCost: 1.5,
			totalTokens: 3333,
			totalDurationMs: 3000,
		});
	});

	test("uses an explicit total duration over the summed stage durations", () => {
		const result = buildChainStats([stageResult("planner", stats(1))], 42);

		expect(result.totalDurationMs).toBe(42);
	});

	test("skips stages without stats", () => {
		const result = buildChainStats([
			stageResult("planner"),
			stageResult("reviewer", stats(2)),
		]);

		expect(result.stages.map((stage) => stage.stageName)).toEqual(["reviewer"]);
	});
});

describe("parseSpawnStats", () => {
	test("returns the stats for a well-formed payload", () => {
		expect(parseSpawnStats(JSON.parse(JSON.stringify(stats(3))))).toEqual(
			stats(3),
		);
	});

	test("rejects a payload missing a token field", () => {
		const { cacheWrite: _omitted, ...tokens } = stats(1).tokens;

		expect(parseSpawnStats({ ...stats(1), tokens })).toBeUndefined();
	});

	test("rejects a payload with an extra key", () => {
		expect(parseSpawnStats({ ...stats(1), model: "x" })).toBeUndefined();
	});

	test("rejects a negative counter", () => {
		expect(parseSpawnStats({ ...stats(1), toolCalls: -1 })).toBeUndefined();
	});

	test("rejects a non-object payload", () => {
		expect(parseSpawnStats("6000 tokens")).toBeUndefined();
	});
});
