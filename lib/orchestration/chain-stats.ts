/**
 * Chain stats aggregation shared by the inline and durable chain runners, plus
 * the parser that reads a persisted `SpawnStats` back from durable run events.
 */

import { hasExactKeys, isRecord } from "./record-shape.ts";
import type {
	ChainStats,
	SpawnStats,
	StageResult,
	StageStats,
	TokenStats,
} from "./types.ts";

/** Create a zero-valued SpawnStats. */
export function emptySpawnStats(): SpawnStats {
	return {
		tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		cost: 0,
		durationMs: 0,
		turns: 0,
		toolCalls: 0,
	};
}

/** Sum two SpawnStats together. */
export function addSpawnStats(a: SpawnStats, b: SpawnStats): SpawnStats {
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
 * `statsDurationMs` defaults to the sum of the stages' spawn durations; pass it
 * explicitly when a parallel group contributes its wall-clock instead.
 */
export function buildChainStats(
	stageResults: readonly StageResult[],
	statsDurationMs?: number,
): ChainStats {
	const stages: StageStats[] = [];
	let totalCost = 0;
	let totalTokens = 0;
	let summedDurationMs = 0;

	for (const sr of stageResults) {
		if (sr.stats) {
			stages.push({
				stageName: sr.stage.name,
				iterations: sr.iterations,
				stats: sr.stats,
			});
			totalCost += sr.stats.cost;
			totalTokens += sr.stats.tokens.total;
			summedDurationMs += sr.stats.durationMs;
		}
	}

	return {
		stages,
		totalCost,
		totalTokens,
		totalDurationMs: statsDurationMs ?? summedDurationMs,
	};
}

/**
 * Copy exactly the SpawnStats fields. Persisting this projection keeps an extra
 * field on the source object (say, a new Pi token count) out of the record that
 * `parseSpawnStats` later reads back with an exact-key check.
 */
export function projectSpawnStats(stats: SpawnStats): SpawnStats {
	const { input, output, cacheRead, cacheWrite, total } = stats.tokens;
	return {
		tokens: { input, output, cacheRead, cacheWrite, total },
		cost: stats.cost,
		durationMs: stats.durationMs,
		turns: stats.turns,
		toolCalls: stats.toolCalls,
	};
}

const TOKEN_KEYS = [
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"total",
] as const satisfies readonly (keyof TokenStats)[];

const SPAWN_STATS_NUMBER_KEYS = [
	"cost",
	"durationMs",
	"turns",
	"toolCalls",
] as const satisfies readonly (keyof SpawnStats)[];

function isNonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Parse an untrusted value into SpawnStats; undefined when the shape is wrong. */
export function parseSpawnStats(value: unknown): SpawnStats | undefined {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ["tokens", ...SPAWN_STATS_NUMBER_KEYS])
	) {
		return undefined;
	}
	const tokens = value.tokens;
	if (!isRecord(tokens) || !hasExactKeys(tokens, TOKEN_KEYS)) return undefined;
	if (!TOKEN_KEYS.every((key) => isNonNegativeNumber(tokens[key]))) {
		return undefined;
	}
	if (
		!SPAWN_STATS_NUMBER_KEYS.every((key) => isNonNegativeNumber(value[key]))
	) {
		return undefined;
	}
	return {
		tokens: {
			input: tokens.input as number,
			output: tokens.output as number,
			cacheRead: tokens.cacheRead as number,
			cacheWrite: tokens.cacheWrite as number,
			total: tokens.total as number,
		},
		cost: value.cost as number,
		durationMs: value.durationMs as number,
		turns: value.turns as number,
		toolCalls: value.toolCalls as number,
	};
}
