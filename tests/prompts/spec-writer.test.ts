import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/spec-writer.md",
	import.meta.url,
);

describe("spec-writer prompt", () => {
	it("captures the WHAT/WHY and stays out of architecture", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("WHAT and WHY");
		expect(content).toContain("You do **not** design the HOW");
		expect(content).toContain("hand off to the planner");
		expect(content).toContain("/skill:plan");
	});

	it("puts the end user first", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("## Users first");
		expect(content).toContain(
			"Every change you spec must trace to an end user.",
		);
		expect(content).toContain("there's always one, and they come first");
		expect(content).toContain(
			"Spec a change you can't tie to a user. If you can't say who benefits and how, it's not ready.",
		);
	});

	it("is a creative brainstorming partner, not a stenographer", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("creative like an artist");
		expect(content).toContain("a brainstorming partner, not a stenographer");
		expect(content).toContain(
			"the spec reflects the *human's* choices, not your pet ideas",
		);
		expect(content).toContain(
			"Carry an unpicked framing into the spec. Propose freely; the spec reflects only what the human chose.",
		);
	});

	it("runs the mandatory Frame -> Shape -> Detail cadence with a fuzzy-idea diverge step", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Frame → Shape → Detail");
		expect(content).toContain(
			"This cadence is mandatory; move through it in order.",
		);
		expect(content).toContain("diverge before you converge");
		expect(content).toContain("minimum lovable version");
	});

	it("keeps the readiness check visible and blocking until waived", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Readiness check before you write.");
		expect(content).toContain(
			"Required items that aren't met stay visibly unchecked — never quietly mark one passed.",
		);
		expect(content).toContain(
			"In interactive mode, don't write the spec while a required item is unchecked unless the human explicitly waives it.",
		);
		expect(content).toContain("3+ *critical* ones");
	});

	it("falls back to assumptions/open-questions in autonomous runs", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Autonomous / non-interactive runs");
		expect(content).toContain(
			"convert every unmet readiness item into an explicit `Assumptions` or `Open Questions` entry — never a silent default.",
		);
	});
});
