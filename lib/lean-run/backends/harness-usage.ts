/**
 * Reads the final text and token usage from what Claude Code and Codex
 * print in their JSON output modes, so a lean run can count their sessions
 * against its token budget. Output that does not parse yields no stats;
 * output cut before all of its usage could be read yields stats marked
 * `incomplete`. Never throws.
 */

import type { SessionStats } from "../types.ts";

export interface HarnessResult {
	text: string;
	stats?: SessionStats;
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
 * When `cut` says the runner did not keep all of stdout, a result object
 * that cannot be read is incomplete usage instead of none.
 */
export function claudeResult(stdout: string, cut?: string): HarnessResult {
	const value =
		resultMessage(parseJson(stdout.trim())) ??
		resultMessage(parseJson(lastLine(stdout)));
	if (value === undefined || typeof value.result !== "string")
		return cut === undefined
			? { text: stdout }
			: { text: stdout, stats: incompleteStats(cut) };
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

function claudeStats(value: Record<string, unknown>): SessionStats | undefined {
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

/** Usage that could not be read, with nothing counted. */
function incompleteStats(reason: string): SessionStats {
	return {
		tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		cost: 0,
		durationMs: 0,
		turns: 0,
		toolCalls: 0,
		incomplete: true,
		incompleteReason: reason,
	};
}

/** The longest stdout line held whole; a usage event is far smaller. */
const MAX_LINE_BYTES = 1024 * 1024;
const TURN_COMPLETED = "turn.completed";
/** How codex serializes the start of a usage event's line. */
const TURN_COMPLETED_START = `{"type":"${TURN_COMPLETED}"`;
const NEWLINE = 0x0a;

/** The start of a line that passed `MAX_LINE_BYTES` and was dropped. */
interface Oversized {
	readonly start: string;
}

/**
 * Counts the `usage` of the `turn.completed` events `codex exec --json`
 * prints, line by line as stdout arrives, so the count does not depend on
 * what the child runner's spool keeps. codex-cli 0.159.3 prints, once per
 * turn (live probe): `{input_tokens, cached_input_tokens,
 * cache_write_input_tokens, output_tokens, reasoning_output_tokens}`.
 * `input_tokens` includes the cached reads (the probe's 18924 against 11136
 * cached), and cache writes are taken to be inside it too, so `tokens.input`
 * is the rest: neither cache reads nor writes count against a run budget.
 * `reasoning_output_tokens` is part of `output_tokens`, as in OpenAI usage,
 * so output is taken as is. A turn that reports zero input and zero output
 * reported no usage.
 *
 * Whether the usage of a later turn in one exec is that turn's own or the
 * thread's running total is unproven, so turns are always summed. Were they
 * running totals, the sum would over-count, which ends a budgeted run early
 * rather than letting it overspend.
 */
export class CodexUsageTap {
	private readonly turns: CodexTurn[] = [];
	private readonly gaps: string[] = [];
	private pending: Buffer[] = [];
	private pendingBytes = 0;
	private oversized: Oversized | undefined;
	private seen = 0;

	/** Every stdout byte the tap was given. */
	get observedBytes(): number {
		return this.seen;
	}

	/** The next stdout chunk, in order. */
	push(chunk: Buffer): void {
		this.seen += chunk.length;
		let start = 0;
		for (
			let end = chunk.indexOf(NEWLINE);
			end !== -1;
			end = chunk.indexOf(NEWLINE, start)
		) {
			this.hold(chunk.subarray(start, end));
			this.endLine();
			start = end + 1;
		}
		this.hold(chunk.subarray(start));
	}

	/**
	 * The usage of every completed turn. A last line with no newline is read
	 * as a line; cut-off JSON there, a usage line too long to hold, or a
	 * `cut` from the caller marks the stats incomplete. No usage and nothing
	 * incomplete, no stats.
	 */
	finish(options: {
		durationMs: number;
		cut?: string;
	}): SessionStats | undefined {
		this.finishLastLine();
		if (options.cut !== undefined) this.gaps.push(options.cut);
		if (this.turns.length === 0 && this.gaps.length === 0) return undefined;
		const { input, cached, cacheWrite, output } = sumTurns(this.turns);
		return {
			tokens: {
				input,
				output,
				cacheRead: cached,
				cacheWrite,
				total: input + output + cached + cacheWrite,
			},
			cost: 0,
			durationMs: options.durationMs,
			turns: this.turns.length,
			toolCalls: 0,
			...(this.gaps.length > 0
				? { incomplete: true, incompleteReason: this.gaps.join("; ") }
				: {}),
		};
	}

	private hold(part: Buffer): void {
		if (part.length === 0 || this.oversized !== undefined) return;
		this.pending.push(part);
		this.pendingBytes += part.length;
		if (this.pendingBytes > MAX_LINE_BYTES)
			this.oversized = { start: this.takeLine().slice(0, 64) };
	}

	private endLine(): void {
		const oversized = this.oversized;
		this.oversized = undefined;
		if (oversized === undefined) this.readLine(this.takeLine());
		else if (oversized.start.startsWith(TURN_COMPLETED_START))
			this.gaps.push(
				`a ${TURN_COMPLETED} line over ${MAX_LINE_BYTES} bytes was not read`,
			);
	}

	/** Cut-off JSON when it never parses: the child stopped mid-line. */
	private finishLastLine(): void {
		const oversized = this.oversized;
		if (oversized !== undefined) {
			this.endLine();
			if (oversized.start.startsWith("{"))
				this.gaps.push("stdout ended inside a JSON line");
			return;
		}
		if (this.pendingBytes === 0) return;
		const line = this.takeLine();
		if (line.startsWith("{") && parseObject(line) === undefined)
			this.gaps.push("stdout ended inside a JSON line");
		else this.readLine(line);
	}

	private takeLine(): string {
		const text = Buffer.concat(this.pending).toString("utf8").trim();
		this.pending = [];
		this.pendingBytes = 0;
		return text;
	}

	private readLine(line: string): void {
		if (!line.includes(TURN_COMPLETED)) return;
		const event = parseObject(line);
		if (event?.type !== TURN_COMPLETED) return;
		const turn = codexTurn(isRecord(event.usage) ? event.usage : {});
		if (turn) this.turns.push(turn);
	}
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
