import {
	EnvelopeSchema,
	EvidenceSchema,
	FindingSchema,
	type ParseResult,
	parseEnvelope,
} from "../envelope/index.ts";

/**
 * `parseEnvelope` (the bare last non-empty line, nothing after it) with one
 * lean-run tolerance: a `null` in a field the schema marks optional reads as
 * the field left out; a required field set to `null` still fails.
 */
export function parseStageEnvelope(text: string): ParseResult {
	const lines = text.split(/\r?\n/);
	const last = lines.findLastIndex((line) => line.trim() !== "");
	const line = lines[last];
	if (line !== undefined) lines[last] = withoutOptionalNulls(line);
	return parseEnvelope(lines.join("\n"));
}

interface ObjectSchema {
	readonly properties: Readonly<Record<string, unknown>>;
	readonly required?: readonly string[];
}

/** The line re-serialized without null optional keys; any line that is not a JSON object is kept as-is. */
function withoutOptionalNulls(line: string): string {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return line;
	}
	if (!isRecord(value)) return line;
	const envelope = stripNulls(value, EnvelopeSchema);
	stripEach(envelope, "evidence", EvidenceSchema);
	stripEach(envelope, "findings", FindingSchema);
	return JSON.stringify(envelope);
}

function stripEach(
	envelope: Record<string, unknown>,
	key: string,
	schema: ObjectSchema,
): void {
	const items = envelope[key];
	if (!Array.isArray(items)) return;
	envelope[key] = items.map((item) =>
		isRecord(item) ? stripNulls(item, schema) : item,
	);
}

function stripNulls(
	value: Record<string, unknown>,
	schema: ObjectSchema,
): Record<string, unknown> {
	const required = new Set(schema.required ?? []);
	return Object.fromEntries(
		Object.entries(value).filter(
			([key, field]) =>
				field !== null || required.has(key) || !(key in schema.properties),
		),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
