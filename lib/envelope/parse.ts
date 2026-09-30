import { Value } from "typebox/value";
import { type Envelope, EnvelopeSchema } from "./schema.ts";

export type ParseResult =
	| { ok: true; envelope: Envelope }
	| { ok: false; reason: string };

type ValidationError = ReturnType<typeof Value.Errors>[number];

/**
 * Reads the envelope from the last line of `text` that starts with `{`.
 * Fences, prose and blank lines around it are skipped; a malformed last
 * object line is rejected rather than passed over. Never throws.
 */
export function parseEnvelope(text: string): ParseResult {
	if (typeof text !== "string") return reject("input is not a string");
	const line = findLastObjectLine(text);
	if (line === undefined) {
		return reject("no JSON object line found in output");
	}
	return parseObjectLine(line);
}

function findLastObjectLine(text: string): string | undefined {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.findLast((line) => line.startsWith("{"));
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
