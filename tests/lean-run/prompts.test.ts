/**
 * Tests for the host-owned lean prompts: the reviewer diff bound and the
 * envelope repair prompt.
 */
import { describe, expect, test } from "vitest";
import {
	boundDiff,
	REPAIR_HEADING,
	REVIEW_DIFF_INLINE_BYTES,
	repairPrompt,
} from "../../lib/lean-run/prompts.ts";

describe("boundDiff", () => {
	test("keeps a diff under the cap whole", () => {
		expect(boundDiff("+a\n-b\n")).toEqual({
			text: "+a\n-b\n",
			truncated: false,
		});
	});

	test("cuts an oversized diff at the last line end within the cap", () => {
		const line = `+${"y".repeat(98)}\n`;
		const diff = line.repeat(REVIEW_DIFF_INLINE_BYTES / 50);

		const { text, truncated } = boundDiff(diff);

		expect(truncated).toBe(true);
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
			REVIEW_DIFF_INLINE_BYTES,
		);
		expect(text.endsWith(line)).toBe(true);
	});

	test("never splits a multi-byte character", () => {
		const diff = `+${"é".repeat(REVIEW_DIFF_INLINE_BYTES)}\n`;

		const { text } = boundDiff(diff);

		expect(text).not.toContain("�");
	});
});

describe("repairPrompt", () => {
	test("quotes only the end of a long reply", () => {
		const prompt = repairPrompt({
			reviewer: false,
			reason: "no envelope line found",
			output: `START${"x".repeat(20_000)}END`,
		});

		expect(prompt.startsWith(REPAIR_HEADING)).toBe(true);
		expect(prompt).toContain("END");
		expect(prompt).not.toContain("START");
	});
});
