/**
 * Reads the final text and token usage from what Claude Code and Codex
 * print in their JSON output modes, so a lean run can count their sessions
 * against its token budget. Output that does not parse yields no stats;
 * never throws.
 */

import type { SpawnStats } from "../../orchestration/types.ts";

export interface HarnessResult {
	text: string;
	stats?: SpawnStats;
}

/**
 * `claude -p --output-format json` prints one result object:
 * `{type: "result", result, usage: {input_tokens, output_tokens,
 * cache_creation_input_tokens, cache_read_input_tokens}, total_cost_usd,
 * duration_ms, num_turns, is_error}`. Its `result` is the final text. Any
 * other stdout is taken as plain text with no stats.
 */
export function claudeResult(stdout: string): HarnessResult {
	const value = parseObject(stdout.trim()) ?? parseObject(lastLine(stdout));
	if (value?.type !== "result" || typeof value.result !== "string")
		return { text: stdout };
	const stats = claudeStats(value);
	return stats ? { text: value.result, stats } : { text: value.result };
}

function claudeStats(value: Record<string, unknown>): SpawnStats | undefined {
	const usage = isRecord(value.usage) ? value.usage : undefined;
	const input = count(usage?.input_tokens);
	const output = count(usage?.output_tokens);
	if (input === undefined || output === undefined) return undefined;
	const cacheRead = count(usage?.cache_read_input_tokens) ?? 0;
	const cacheWrite = count(usage?.cache_creation_input_tokens) ?? 0;
	return {
		tokens: {
			input,
			output,
			cacheRead,
			cacheWrite,
			total: input + output + cacheRead + cacheWrite,
		},
		cost: count(value.total_cost_usd) ?? 0,
		durationMs: count(value.duration_ms) ?? 0,
		turns: count(value.num_turns) ?? 0,
		toolCalls: 0,
	};
}

/**
 * Sums the `usage` of every `turn.completed` event `codex exec --json`
 * printed: `{input_tokens, cached_input_tokens, output_tokens}`. Codex's
 * `input_tokens` includes the cached ones, so `tokens.input` is the
 * uncached part and the cached part is `cacheRead`, which a run budget does
 * not count. No such event, no stats.
 */
export function codexStats(
	stdout: string,
	durationMs: number,
): SpawnStats | undefined {
	const usages = stdout
		.split(/\r?\n/)
		.map((line) => parseObject(line.trim()))
		.filter((event) => event?.type === "turn.completed")
		.map((event) => (isRecord(event?.usage) ? event.usage : {}));
	const turns = usages.flatMap((usage) => codexTurn(usage) ?? []);
	if (turns.length === 0) return undefined;
	const sum = (key: keyof CodexTurn) =>
		turns.reduce((total, turn) => total + turn[key], 0);
	const input = sum("input");
	const output = sum("output");
	const cacheRead = sum("cached");
	return {
		tokens: {
			input,
			output,
			cacheRead,
			cacheWrite: 0,
			total: input + output + cacheRead,
		},
		cost: 0,
		durationMs,
		turns: turns.length,
		toolCalls: 0,
	};
}

interface CodexTurn {
	input: number;
	cached: number;
	output: number;
}

function codexTurn(usage: Record<string, unknown>): CodexTurn | undefined {
	const input = count(usage.input_tokens);
	const output = count(usage.output_tokens);
	if (input === undefined || output === undefined) return undefined;
	const cached = Math.min(count(usage.cached_input_tokens) ?? 0, input);
	return { input: input - cached, cached, output };
}

function parseObject(text: string): Record<string, unknown> | undefined {
	if (!text.startsWith("{")) return undefined;
	try {
		const value: unknown = JSON.parse(text);
		return isRecord(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function lastLine(text: string): string {
	return (
		text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.findLast((line) => line !== "") ?? ""
	);
}

/** A finite, non-negative number; anything else is not a count. */
function count(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
