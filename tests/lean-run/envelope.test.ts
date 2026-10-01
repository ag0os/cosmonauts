/**
 * Tests for parseStageEnvelope: parseEnvelope hardened with ruling OD-4 and
 * tolerant of null in optional fields.
 */
import { describe, expect, test } from "vitest";
import { parseStageEnvelope } from "../../lib/lean-run/envelope.ts";

describe("parseStageEnvelope", () => {
	test("accepts a plain final envelope line", () => {
		const result = parseStageEnvelope(
			'Done.\n{"outcome":"done","summary":"ok"}\n',
		);
		expect(result).toEqual({
			ok: true,
			envelope: { outcome: "done", summary: "ok" },
		});
	});

	test("rejects a decorated final envelope after a quoted one", () => {
		const text = [
			"The format looks like this:",
			'{"outcome":"done","summary":"example"}',
			"Here is mine:",
			'Envelope: {"outcome":"failed","reason":"tests fail"}',
		].join("\n");
		const result = parseStageEnvelope(text);
		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain(
			'mentions "outcome" without starting with "{"',
		);
	});

	test("says no envelope line was found when no line starts with {", () => {
		expect(parseStageEnvelope('Result: {"outcome":"done"}')).toEqual({
			ok: false,
			reason: "no envelope line found",
		});
	});

	test("says no envelope line was found for output without any envelope", () => {
		expect(parseStageEnvelope("no envelope here")).toEqual({
			ok: false,
			reason: "no envelope line found",
		});
	});

	test("ignores later lines that do not mention outcome", () => {
		const result = parseStageEnvelope('{"outcome":"done"}\n```\n');
		expect(result.ok).toBe(true);
	});

	test("reads a null optional field as the field left out", () => {
		const result = parseStageEnvelope(
			'{"outcome":"done","summary":"ok","reason":null,"evidence":[{"kind":"test","ref":"t","result":"pass","note":null}]}',
		);
		expect(result).toEqual({
			ok: true,
			envelope: {
				outcome: "done",
				summary: "ok",
				evidence: [{ kind: "test", ref: "t", result: "pass" }],
			},
		});
	});

	test("still rejects a required field set to null", () => {
		const result = parseStageEnvelope(
			'{"outcome":"done","findings":[{"id":"F-1","severity":"low","file":"a.ts","summary":"s","fix":null}]}',
		);
		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("findings[0].fix");
	});

	test("still requires a reason when the outcome is not done", () => {
		const result = parseStageEnvelope('{"outcome":"blocked","reason":null}');
		expect(result).toEqual({
			ok: false,
			reason: 'outcome "blocked" requires a non-empty reason',
		});
	});

	test("rejects a null field the schema does not know", () => {
		const result = parseStageEnvelope('{"outcome":"done","extra":null}');
		expect(result.ok ? "" : result.reason).toContain("unknown field(s) extra");
	});
});
