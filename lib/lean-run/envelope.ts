import { type ParseResult, parseEnvelope } from "../envelope/index.ts";

/**
 * `parseEnvelope` plus ruling OD-4: when a line after the last `{` line
 * mentions `"outcome"` without starting with `{`, the agent decorated its
 * real envelope and the earlier object line is only a quote, so reject.
 */
export function parseStageEnvelope(text: string): ParseResult {
	const lines = text.split(/\r?\n/).map((line) => line.trim());
	const candidate = lines.findLastIndex((line) => line.startsWith("{"));
	if (candidate < 0) return { ok: false, reason: "no envelope line found" };
	const decorated = lines
		.slice(candidate + 1)
		.find((line) => line.includes('"outcome"'));
	if (decorated === undefined) return parseEnvelope(text);
	return {
		ok: false,
		reason: `a line after the last JSON object line mentions "outcome" without starting with "{": ${decorated.slice(0, 200)}`,
	};
}
