/**
 * Tests for the host-owned lean prompts: the reviewer diff bound, the
 * reviewer prompt's subject and the envelope repair prompt.
 */
import { describe, expect, test } from "vitest";
import { parsePlan } from "../../lib/lean-run/plan.ts";
import {
	boundDiff,
	builderPrompt,
	REPAIR_HEADING,
	REVIEW_DIFF_INLINE_BYTES,
	repairPrompt,
	reviewerPrompt,
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

	test("fences the quote with more backticks than any run inside it", () => {
		const output = 'Done.\n```json\n{"outcome":"done"}\n```\nand a ```` run';
		const prompt = repairPrompt({
			reviewer: true,
			reason: "the envelope is fenced",
			output,
		});

		expect(prompt).toContain(`\`\`\`\`\`text\n${output}\n\`\`\`\`\`\n`);
	});

	test("uses a plain three-backtick fence for a reply without backticks", () => {
		const prompt = repairPrompt({
			reviewer: false,
			reason: "no envelope line found",
			output: "I changed it.",
		});

		expect(prompt).toContain("```text\nI changed it.\n```\n");
	});
});

describe("reviewerPrompt", () => {
	const plan = parsePlan("# Demo\n\n## Approach\nAdd a greeting.\n");
	const base = {
		plan,
		facts: { passes: [] },
		diff: "+x\n",
		changedFiles: ["src/x.ts"],
		lenses: ["general" as const],
		fullDiffPath: "/tmp/full.diff",
	};

	test("reads the change against its plan", () => {
		const prompt = reviewerPrompt({ ...base, tier: "plan" });

		expect(prompt).toContain("Review this change against its plan.");
		expect(prompt).toContain("# Plan\n\n# Demo");
	});

	test("has no plan section for a review with neither a plan nor a request", () => {
		const prompt = reviewerPrompt({ ...base, tier: "review" });

		expect(prompt).toContain("no plan or request came with it");
		expect(prompt).not.toContain("# Plan");
		expect(prompt).not.toContain("# Request");
		expect(prompt).toContain("# Changed files\n\nsrc/x.ts");
		expect(prompt).toContain("```diff\n+x\n```");
	});
});

describe("envelope instructions", () => {
	const plan = parsePlan("# Demo\n\n## Approach\nAdd a greeting.\n");

	test("state the evidence kind and result enumerations to the builder", () => {
		const prompt = builderPrompt({ plan });

		expect(prompt).toContain(
			'Each evidence "kind" is one of "test", "command", "file" or "claim"; each evidence "result" is one of "pass", "fail" or "n/a".',
		);
	});

	test("state the severity enumeration to the reviewer", () => {
		const prompt = reviewerPrompt({
			plan,
			facts: { passes: [] },
			diff: "",
			changedFiles: [],
			lenses: ["general"],
			fullDiffPath: "/tmp/full.diff",
		});

		expect(prompt).toContain(
			'Each finding "severity" is one of "high", "medium" or "low".',
		);
	});

	test("repeat the enumerations in the repair turn", () => {
		const prompt = repairPrompt({
			reviewer: false,
			reason: "evidence[0].kind must be one of test, command, file, claim",
			output: "done",
		});

		expect(prompt).toContain('"result" is one of "pass", "fail" or "n/a"');
	});
});
