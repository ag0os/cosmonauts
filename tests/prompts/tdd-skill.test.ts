import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../bundled/coding/coding/skills/tdd/SKILL.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

describe("tdd skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-002
	it("owns implementation testing discipline while routing artifact marker details", async () => {
		const content = await readSkill();

		expect(content).toContain("## The Red-Green-Refactor Loop");
		expect(content).toContain("### RED");
		expect(content).toContain("### GREEN");
		expect(content).toContain("### REFACTOR");
		expect(content).toContain("## Characterization Tests Before Refactoring");
		expect(content).toContain("load `/skill:work-artifacts`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain(
			"Do not duplicate the full behavior-spine format here.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-005
	it("distinguishes planned behavior markers from direct regression tests", async () => {
		const content = await readSkill();

		expect(content).toContain("## Planned Behaviors And Direct Fixes");
		expect(content).toContain("When implementing a planned `B-###` behavior");
		expect(content).toContain("@cosmo-behavior plan:<slug>#B-###");
		expect(content).toContain("near the executable test");
		expect(content).toContain(
			"Direct fixes still require a regression test first",
		);
		expect(content).toContain(
			"do not require behavior IDs or markers unless the fix belongs to a plan",
		);
		expect(content).toContain("A behavior's durable home is the test layer");
		expect(content).toContain(
			"archiving a plan does not remove that regression protection",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-020
	it("keeps optional TDD references directly linked when they exist", async () => {
		const content = await readSkill();

		expect(content).toContain("dispatcher");
		expect(content).toContain("directly linked");
		expect(content).toContain("avoid deep reference chains");
		expect(content).not.toMatch(/references\/[^`\s/]+\/[^`\s]+\.md/);
	});
});
