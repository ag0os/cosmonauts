/**
 * Tests for parseStageEnvelope: parseEnvelope's bare-last-line rule, tolerant
 * of null in optional fields.
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
		expect(result.ok ? "" : result.reason).toMatch(
			/^the last line is not a bare JSON object/u,
		);
	});

	test("rejects an envelope line that does not start with {", () => {
		expect(parseStageEnvelope('Result: {"outcome":"done"}')).toEqual({
			ok: false,
			reason:
				'the last line is not a bare JSON object (it is quoted, prefixed or decorated): "Result: {\\"outcome\\":\\"done\\"}"',
		});
	});

	test("says no JSON object line was found for output without any envelope", () => {
		expect(parseStageEnvelope("no envelope here")).toEqual({
			ok: false,
			reason: "no JSON object line found in output",
		});
	});

	test("says no JSON object line was found for blank output", () => {
		expect(parseStageEnvelope("\n  \n")).toEqual({
			ok: false,
			reason: "no JSON object line found in output",
		});
	});

	test("rejects a done envelope followed by prose", () => {
		expect(
			parseStageEnvelope('{"outcome":"done"}\nActually tests failed'),
		).toEqual({
			ok: false,
			reason:
				'text follows the JSON object line; the envelope must be the very last line: "Actually tests failed"',
		});
	});

	test("rejects a closing fence after the envelope line", () => {
		const result = parseStageEnvelope('{"outcome":"done"}\n```\n');
		expect(result.ok ? "" : result.reason).toMatch(/^text follows/u);
	});

	test("accepts a bare final envelope after a stale example", () => {
		const result = parseStageEnvelope(
			'{"outcome":"failed","reason":"example"}\nMine:\n{"outcome":"done"}',
		);
		expect(result).toEqual({ ok: true, envelope: { outcome: "done" } });
	});

	test("accepts trailing whitespace and CRLF on the last line", () => {
		const result = parseStageEnvelope(
			'Done.\r\n{"outcome":"done","reason":null}  \r\n\r\n',
		);
		expect(result).toEqual({ ok: true, envelope: { outcome: "done" } });
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
