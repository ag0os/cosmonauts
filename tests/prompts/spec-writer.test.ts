import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/spec-writer.md",
	import.meta.url,
);

describe("spec-writer prompt", () => {
	it("defines the mandatory phase transitions", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"I understand the purpose and user. Moving to the user flow and scope unless you want to revisit.",
		);
		expect(content).toContain(
			"The flow and scope are clear. Moving to acceptance criteria, assumptions, and readiness unless you want to adjust anything first.",
		);
		expect(content).toContain(
			"Here’s the readiness check and what I’ll write — approve, correct, or expand?",
		);
	});

	it("keeps the readiness rubric visible and blocked until waived", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("- **Specificity**");
		expect(content).toContain("- **Constraints**");
		expect(content).toContain("- **Context**");
		expect(content).toContain("- **Success criteria**");
		expect(content).toContain(
			"Required items that are not satisfied must stay visibly unchecked.",
		);
		expect(content).toContain(
			"In interactive mode, do not write the spec while any required readiness item is unchecked.",
		);
		expect(content).toContain("`proceed with assumptions`");
	});

	it("defines critical assumption categories, escalation, and autonomous fallback", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Classify an assumption as critical when it changes user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria.",
		);
		expect(content).toContain(
			"If `critical >= 3` in interactive mode, run one more clarification round before writing unless the human explicitly waives with `proceed with assumptions`.",
		);
		expect(content).toContain(
			"convert every unmet required readiness item into an explicit item in `Assumptions` or `Open Questions` instead of silently filling the gap.",
		);
	});
});
