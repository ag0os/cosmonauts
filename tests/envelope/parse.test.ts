/**
 * Tests for parseEnvelope.
 * Covers every example shape from the lean brief (section 4.5), each rejection
 * path, and tolerant reading of fenced or prose-wrapped agent output.
 */

import { describe, expect, test } from "vitest";
import { type Envelope, parseEnvelope } from "../../lib/envelope/index.ts";

const builderEnvelope: Envelope = {
	outcome: "done",
	summary: "Added the envelope parser.",
	evidence: [
		{ kind: "test", ref: "tests/envelope/parse.test.ts:12", result: "pass" },
		{
			kind: "command",
			ref: "bun run typecheck",
			result: "pass",
			note: "no errors",
		},
	],
	touched: ["lib/envelope/parse.ts", "tests/envelope/parse.test.ts"],
};

const reviewerEnvelope: Envelope = {
	outcome: "done",
	summary: "Two findings.",
	findings: [
		{
			id: "F-1",
			severity: "high",
			file: "lib/envelope/parse.ts:20",
			summary: "Throws on empty input.",
			fix: "Return a rejection instead.",
		},
		{
			id: "F-2",
			severity: "low",
			file: "lib/envelope/render.ts:5",
			summary: "Unused variable.",
			fix: "Remove it.",
		},
	],
};

const verifierEnvelope: Envelope = {
	outcome: "done",
	evidence: [
		{ kind: "file", ref: "lib/envelope/index.ts", result: "n/a" },
		{ kind: "claim", ref: "parser never throws", result: "fail" },
	],
};

const blockedEnvelope: Envelope = {
	outcome: "blocked",
	summary: "Cannot continue.",
	reason: "The plan names a module that does not exist.",
};

const failedEnvelope: Envelope = {
	outcome: "failed",
	reason: "Tests fail after three attempts.",
};

function line(envelope: unknown): string {
	return JSON.stringify(envelope);
}

function rejectionReason(text: string): string {
	const result = parseEnvelope(text);
	if (result.ok) throw new Error("expected a rejection");
	return result.reason;
}

describe("parseEnvelope — brief examples", () => {
	test.each([
		["builder with evidence and touched", builderEnvelope],
		["reviewer with findings", reviewerEnvelope],
		["verifier with evidence", verifierEnvelope],
		["blocked with reason", blockedEnvelope],
		["failed with reason", failedEnvelope],
		["minimal done", { outcome: "done" } satisfies Envelope],
	])("parses a %s envelope", (_name, envelope) => {
		expect(parseEnvelope(line(envelope))).toEqual({ ok: true, envelope });
	});
});

describe("parseEnvelope — tolerant reading", () => {
	const minimal = { ok: true, envelope: { outcome: "done" } };

	test("reads a line wrapped in a json code fence", () => {
		const text = ["```json", line({ outcome: "done" }), "```"].join("\n");
		expect(parseEnvelope(text)).toEqual(minimal);
	});

	test("skips prose after the JSON line", () => {
		const text = `${line({ outcome: "done" })}\nThat is all.\nThanks!`;
		expect(parseEnvelope(text)).toEqual(minimal);
	});

	test("ignores prose before the JSON line", () => {
		const text = `I finished the work.\n\n${line({ outcome: "done" })}`;
		expect(parseEnvelope(text)).toEqual(minimal);
	});

	test("takes the last JSON line when several are present", () => {
		const text = [line(blockedEnvelope), "retrying", line(failedEnvelope)].join(
			"\n",
		);
		expect(parseEnvelope(text)).toEqual({ ok: true, envelope: failedEnvelope });
	});

	test("ignores blank trailing lines and surrounding whitespace", () => {
		const text = `\n   ${line({ outcome: "done" })}   \n\n  \n`;
		expect(parseEnvelope(text)).toEqual(minimal);
	});

	test("reads CRLF line endings", () => {
		const text = `Done.\r\n${line({ outcome: "done" })}\r\n`;
		expect(parseEnvelope(text)).toEqual(minimal);
	});

	test.each([
		["a quoted string", '"Thanks!"'],
		["a number", "42"],
		["a boolean", "true"],
		["an array", "[]"],
	])("skips trailing prose that is %s in JSON", (_name, prose) => {
		const text = `${line({ outcome: "done" })}\n${prose}`;
		expect(parseEnvelope(text)).toEqual(minimal);
	});
});

describe("parseEnvelope — rejections", () => {
	test("rejects empty output", () => {
		expect(rejectionReason("")).toBe("no JSON object line found in output");
	});

	test("rejects output with no JSON line", () => {
		expect(rejectionReason("All done.\n```\n")).toBe(
			"no JSON object line found in output",
		);
	});

	test("rejects an envelope split across several lines", () => {
		const text = JSON.stringify({ outcome: "done" }, null, 2);
		expect(rejectionReason(text)).toMatch(
			/^last JSON object line is not valid JSON: SyntaxError: /,
		);
	});

	test.each([
		["an array", '["done"]'],
		["a string", '"done"'],
		["null", "null"],
	])("rejects output whose only JSON line is %s", (_name, text) => {
		expect(rejectionReason(text)).toBe("no JSON object line found in output");
	});

	test.each([
		["undefined", undefined],
		["null", null],
	])("rejects %s input instead of throwing", (_name, input) => {
		expect(parseEnvelope(input as unknown as string)).toEqual({
			ok: false,
			reason: "input is not a string",
		});
	});

	test("rejects an unparseable brace line after the envelope", () => {
		const text = `${line({ outcome: "done" })}\n{ not json }`;
		expect(rejectionReason(text)).toMatch(
			/^last JSON object line is not valid JSON: SyntaxError: /,
		);
	});

	test("rejects a truncated last envelope instead of reading an earlier one", () => {
		const text = [
			"Previous stage said:",
			line({ outcome: "done", summary: "builder earlier" }),
			"My result:",
			'{"outcome":"failed","reason":"tests fai',
		].join("\n");
		expect(rejectionReason(text)).toMatch(
			/^last JSON object line is not valid JSON: SyntaxError: /,
		);
	});

	test("rejects a missing outcome and names the field", () => {
		expect(rejectionReason(line({ summary: "x" }))).toBe(
			"schema violation: envelope must have required properties outcome",
		);
	});

	test("rejects an unknown outcome and lists the allowed values", () => {
		expect(rejectionReason(line({ outcome: "ok" }))).toBe(
			"schema violation: outcome must be one of done, blocked, failed",
		);
	});

	test("rejects unknown top-level fields", () => {
		expect(rejectionReason(line({ outcome: "done", verdict: "ship" }))).toBe(
			"schema violation: envelope has unknown field(s) verdict",
		);
	});

	test("rejects a wrongly typed nested field and names its path", () => {
		const envelope = {
			outcome: "done",
			evidence: [{ kind: "test", ref: 12, result: "pass" }],
		};
		expect(rejectionReason(line(envelope))).toBe(
			"schema violation: evidence[0].ref must be string",
		);
	});

	test("rejects an unknown finding severity", () => {
		const envelope = {
			outcome: "done",
			findings: [
				{ id: "F-1", severity: "critical", file: "a", summary: "b", fix: "c" },
			],
		};
		expect(rejectionReason(line(envelope))).toBe(
			"schema violation: findings[0].severity must be one of high, medium, low",
		);
	});

	test("reports every schema violation, not only the first", () => {
		expect(
			rejectionReason(line({ outcome: "done", touched: [1, "a", 2] })),
		).toBe(
			"schema violation: touched[0] must be string; touched[2] must be string",
		);
	});

	test.each(["blocked", "failed"])("rejects %s without a reason", (outcome) => {
		expect(rejectionReason(line({ outcome }))).toBe(
			`outcome "${outcome}" requires a non-empty reason`,
		);
	});

	test("rejects a blank reason on a failed envelope", () => {
		expect(rejectionReason(line({ outcome: "failed", reason: "  " }))).toBe(
			'outcome "failed" requires a non-empty reason',
		);
	});
});
