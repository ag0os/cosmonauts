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
 * duration_ms, num_turns, is_error}`. In verbose mode (`--verbose`, a
 * `viewMode: "verbose"` setting or a global `verbose: true`) it prints an
 * array of every message instead, and the last `type: "result"` element is
 * that object. Its `result` is the final text. Any other stdout is taken as
 * plain text with no stats, and zero input with zero output is no usage.
 */
export function claudeResult(stdout: string): HarnessResult {
	const value =
		resultMessage(parseJson(stdout.trim())) ??
		resultMessage(parseJson(lastLine(stdout)));
	if (value === undefined || typeof value.result !== "string")
		return { text: stdout };
	const stats = claudeStats(value);
	return stats ? { text: value.result, stats } : { text: value.result };
}

/** The result object itself, or the last result element of a verbose message array. */
function resultMessage(value: unknown): Record<string, unknown> | undefined {
	const candidate = Array.isArray(value)
		? value.findLast((entry) => isRecord(entry) && entry.type === "result")
		: value;
	return isRecord(candidate) && candidate.type === "result"
		? candidate
		: undefined;
}

function claudeStats(value: Record<string, unknown>): SpawnStats | undefined {
	const usage = isRecord(value.usage) ? value.usage : undefined;
	const input = count(usage?.input_tokens);
	const output = count(usage?.output_tokens);
	if (input === undefined || output === undefined) return undefined;
	if (input === 0 && output === 0) return undefined;
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
 * The `usage` of the `turn.completed` events `codex exec --json` printed.
 * codex-cli 0.159.3 prints, once per turn (live probe):
 * `{input_tokens, cached_input_tokens, cache_write_input_tokens,
 * output_tokens, reasoning_output_tokens}`. `input_tokens` includes the
 * cached reads (the probe's 18924 against 11136 cached), and cache writes
 * are taken to be inside it too, so `tokens.input` is the rest: neither
 * cache reads nor writes count against a run budget. `reasoning_output_tokens`
 * is part of `output_tokens`, as in OpenAI usage, so output is taken as is.
 * A turn that reports zero input and zero output reported no usage.
 *
 * Whether the usage of a later turn in one exec is that turn's own or the
 * thread's running total is unproven, so turns are always summed. Were they
 * running totals, the sum would over-count, which ends a budgeted run early
 * rather than letting it overspend. No usable event, no stats.
 */
export function codexStats(
	stdout: string,
	durationMs: number,
): SpawnStats | undefined {
	const turns = stdout
		.split(/\r?\n/)
		.map((line) => parseObject(line.trim()))
		.filter((event) => event?.type === "turn.completed")
		.flatMap(
			(event) => codexTurn(isRecord(event?.usage) ? event.usage : {}) ?? [],
		);
	if (turns.length === 0) return undefined;
	const { input, cached, cacheWrite, output } = sumTurns(turns);
	return {
		tokens: {
			input,
			output,
			cacheRead: cached,
			cacheWrite,
			total: input + output + cached + cacheWrite,
		},
		cost: 0,
		durationMs,
		turns: turns.length,
		toolCalls: 0,
	};
}

/**
 * The final message of a `codex exec --json` stream: the text of its last
 * completed `agent_message` item, if any.
 */
export function codexLastMessage(stdout: string): string | undefined {
	const message = stdout
		.split(/\r?\n/)
		.map((line) => parseObject(line.trim()))
		.map((event) => (event?.type === "item.completed" ? event.item : undefined))
		.filter(isRecord)
		.findLast(
			(item) => item.type === "agent_message" && typeof item.text === "string",
		);
	return typeof message?.text === "string" ? message.text : undefined;
}

interface CodexTurn {
	input: number;
	cached: number;
	cacheWrite: number;
	output: number;
}

const CODEX_COUNTS = ["input", "cached", "cacheWrite", "output"] as const;

function sumTurns(turns: readonly CodexTurn[]): CodexTurn {
	const sum: CodexTurn = { input: 0, cached: 0, cacheWrite: 0, output: 0 };
	for (const key of CODEX_COUNTS)
		for (const turn of turns) sum[key] += turn[key];
	return sum;
}

function codexTurn(usage: Record<string, unknown>): CodexTurn | undefined {
	const input = count(usage.input_tokens);
	const output = count(usage.output_tokens);
	if (input === undefined || output === undefined) return undefined;
	if (input === 0 && output === 0) return undefined;
	const cached = Math.min(count(usage.cached_input_tokens) ?? 0, input);
	const cacheWrite = Math.min(
		count(usage.cache_write_input_tokens) ?? 0,
		input - cached,
	);
	return { input: input - cached - cacheWrite, cached, cacheWrite, output };
}

function parseJson(text: string): unknown {
	if (!text.startsWith("{") && !text.startsWith("[")) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function parseObject(text: string): Record<string, unknown> | undefined {
	if (!text.startsWith("{")) return undefined;
	const value = parseJson(text);
	return isRecord(value) ? value : undefined;
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
