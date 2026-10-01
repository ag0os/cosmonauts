import { Value } from "typebox/value";
import { type Envelope, EnvelopeSchema } from "./schema.ts";

export type ParseResult =
	| { ok: true; envelope: Envelope }
	| { ok: false; reason: string };

type ValidationError = ReturnType<typeof Value.Errors>[number];

/** How much of a rejected last line a reason quotes. */
const QUOTE_CHARS = 200;

/**
 * Reads the envelope from the last non-empty line of `text`, which must be
 * the bare JSON object and nothing else: prose and blank lines before it are
 * fine, but anything after it (prose, a closing code fence) or around it on
 * the line (a quote marker, a bullet, a label) is rejected, as is a
 * malformed last line. Earlier object lines never count. Never throws.
 */
export function parseEnvelope(text: string): ParseResult {
	if (typeof text !== "string") return reject("input is not a string");
	const lines = nonEmptyLines(text);
	const last = lines.at(-1);
	if (last?.startsWith("{")) return parseObjectLine(last);
	return reject(notBareReason(lines, last));
}

function nonEmptyLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

/** Why the last non-empty line is not a bare JSON object line. */
function notBareReason(lines: readonly string[], last?: string): string {
	if (last === undefined || !lines.some((line) => line.includes("{")))
		return "no JSON object line found in output";
	const quoted = JSON.stringify(last.slice(0, QUOTE_CHARS));
	if (last.includes("{"))
		return `the last line is not a bare JSON object (it is quoted, prefixed or decorated): ${quoted}`;
	if (last.startsWith("}"))
		return `the last line closes a JSON object that spans several lines; the envelope must be one line: ${quoted}`;
	return `text follows the JSON object line; the envelope must be the very last line: ${quoted}`;
}

function parseObjectLine(line: string): ParseResult {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch (error) {
		return reject(`last JSON object line is not valid JSON: ${String(error)}`);
	}
	if (!Value.Check(EnvelopeSchema, value)) {
		return reject(`schema violation: ${describeErrors(value)}`);
	}
	return checkReason(value);
}

function checkReason(envelope: Envelope): ParseResult {
	if (envelope.outcome !== "done" && !envelope.reason?.trim()) {
		return reject(`outcome "${envelope.outcome}" requires a non-empty reason`);
	}
	return { ok: true, envelope };
}

function describeErrors(value: unknown): string {
	return Value.Errors(EnvelopeSchema, value).map(describeError).join("; ");
}

function describeError(error: ValidationError): string {
	return `${fieldName(error.instancePath)} ${errorDetail(error)}`;
}

function errorDetail(error: ValidationError): string {
	if (error.keyword === "enum") {
		return `must be one of ${error.params.allowedValues.join(", ")}`;
	}
	if (error.keyword === "additionalProperties") {
		return `has unknown field(s) ${error.params.additionalProperties.join(", ")}`;
	}
	return error.message;
}

function fieldName(instancePath: string): string {
	if (instancePath === "") return "envelope";
	return instancePath
		.slice(1)
		.split("/")
		.map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
		.join("")
		.slice(1);
}

function reject(reason: string): ParseResult {
	return { ok: false, reason };
}
