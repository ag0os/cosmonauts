/**
 * Tests for renderEnvelope.
 * Covers the headline and each optional section, including omission when absent.
 */

import { describe, expect, test } from "vitest";
import { renderEnvelope } from "../../lib/envelope/index.ts";

describe("renderEnvelope", () => {
	test("renders a minimal envelope as the outcome alone", () => {
		expect(renderEnvelope({ outcome: "done" })).toBe("DONE");
	});

	test("puts the summary on the headline", () => {
		expect(renderEnvelope({ outcome: "done", summary: "Shipped." })).toBe(
			"DONE: Shipped.",
		);
	});

	test("lists evidence with result, kind, ref and optional note", () => {
		const text = renderEnvelope({
			outcome: "done",
			evidence: [
				{ kind: "test", ref: "tests/a.test.ts:3", result: "pass" },
				{
					kind: "command",
					ref: "bun run lint",
					result: "fail",
					note: "2 errors",
				},
			],
		});
		expect(text).toBe(
			[
				"DONE",
				"Evidence:",
				"  - [pass] test tests/a.test.ts:3",
				"  - [fail] command bun run lint (2 errors)",
			].join("\n"),
		);
	});

	test("lists findings with severity, location and fix", () => {
		const text = renderEnvelope({
			outcome: "done",
			findings: [
				{
					id: "F-1",
					severity: "medium",
					file: "lib/a.ts:9",
					summary: "Swallowed error.",
					fix: "Rethrow it.",
				},
			],
		});
		expect(text).toBe(
			[
				"DONE",
				"Findings:",
				"  - F-1 [medium] lib/a.ts:9: Swallowed error.",
				"    fix: Rethrow it.",
			].join("\n"),
		);
	});

	test("lists touched paths", () => {
		expect(renderEnvelope({ outcome: "done", touched: ["a.ts", "b.ts"] })).toBe(
			["DONE", "Touched:", "  - a.ts", "  - b.ts"].join("\n"),
		);
	});

	test("ends with the reason for a blocked envelope", () => {
		expect(
			renderEnvelope({
				outcome: "blocked",
				summary: "Stuck.",
				reason: "Missing spec.",
			}),
		).toBe(["BLOCKED: Stuck.", "Reason: Missing spec."].join("\n"));
	});

	test("indents continuation lines of multi-line values", () => {
		const text = renderEnvelope({
			outcome: "blocked",
			summary: "Stuck\non two things.",
			evidence: [
				{ kind: "claim", ref: "a", result: "n/a", note: "first\nsecond" },
			],
			findings: [
				{
					id: "F-1",
					severity: "low",
					file: "lib/a.ts:1",
					summary: "Two\nlines.",
					fix: "Do this\nthen that.",
				},
			],
			touched: ["p\nq"],
			reason: "Missing\r\nspec.",
		});
		expect(text).toBe(
			[
				"BLOCKED: Stuck",
				"  on two things.",
				"Evidence:",
				"  - [n/a] claim a (first",
				"    second)",
				"Findings:",
				"  - F-1 [low] lib/a.ts:1: Two",
				"    lines.",
				"    fix: Do this",
				"      then that.",
				"Touched:",
				"  - p",
				"    q",
				"Reason: Missing",
				"  spec.",
			].join("\n"),
		);
	});

	test("omits sections whose lists are empty", () => {
		expect(
			renderEnvelope({
				outcome: "failed",
				evidence: [],
				findings: [],
				touched: [],
				reason: "Timed out.",
			}),
		).toBe(["FAILED", "Reason: Timed out."].join("\n"));
	});
});
