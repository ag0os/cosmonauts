import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../bundled/coding/skills/tdd/SKILL.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

describe("tdd skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-020
	it("keeps optional TDD references directly linked when they exist", async () => {
		const content = await readSkill();

		expect(content).toContain("dispatcher");
		expect(content).toContain("directly linked");
		expect(content).toContain("avoid deep reference chains");
		expect(content).not.toMatch(/references\/[^`\s/]+\/[^`\s]+\.md/);
	});
});
