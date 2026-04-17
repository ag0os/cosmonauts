import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/planner.md",
	import.meta.url,
);

describe("planner prompt", () => {
	it("adds a tailored plan readiness check before plan_create", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("**Plan Readiness Check**");
		expect(content).toContain("- **Specificity**");
		expect(content).toContain(
			"Scope boundaries and explicit non-goals are named",
		);
		expect(content).toContain("- **Constraints**");
		expect(content).toContain(
			"Module boundaries and dependency direction are explicit",
		);
		expect(content).toContain(
			"Integration seams are named and the contract at each seam is stated",
		);
		expect(content).toContain("- **Context**");
		expect(content).toContain(
			"Key verification points cite real `file:line` references",
		);
		expect(content).toContain("- **Success criteria**");
		expect(content).toContain(
			"The `Quality Contract` satisfies the quality-criteria rule from step 5",
		);
	});

	it("blocks interactively and converts blockers into assumptions autonomously", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"In interactive mode, do not call `plan_create` while any required readiness item is unchecked.",
		);
		expect(content).toContain(
			"Keep clarifying until the blocker is resolved or the human explicitly waives it.",
		);
		expect(content).toContain(
			"In autonomous or non-interactive runs (including chain stages and `--print` mode), do not deadlock on unchecked items.",
		);
		expect(content).toContain(
			"Convert each unmet blocker into an explicit assumption in `Scope` and the corresponding planner-proposed entry in the `Decision Log`, then proceed to `plan_create`.",
		);
	});

	it("keeps the readiness check conversational instead of persisting it in the plan format", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");
		const outputFormat = content.split("## Plan Output Format")[1] ?? "";

		expect(content).toContain(
			"The `Plan Readiness Check` is conversational only. Do not add a persisted `Plan Readiness Check` section to the plan output format below.",
		);
		expect(outputFormat).not.toContain("Plan Readiness Check");
	});
});
