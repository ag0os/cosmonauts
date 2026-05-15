import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/plan/SKILL.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

describe("plan skill", () => {
	it("documents behaviors and quality contracts as plan sections", async () => {
		const content = await readSkill();

		expect(content).toContain("**Behaviors**");
		expect(content).toContain("context, action, and expected result");
		expect(content).toContain("**Quality Contract**");
		expect(content).toContain("Use 3-8 criteria");
	});

	it("owns the conversational plan readiness check", async () => {
		const content = await readSkill();

		expect(content).toContain("## Plan Readiness Check");
		expect(content).toContain("This is conversational output only");
		expect(content).toContain("**Specificity**");
		expect(content).toContain("**Constraints**");
		expect(content).toContain("**Context**");
		expect(content).toContain("**Success criteria**");
	});

	it("connects program structure with procedure structure", async () => {
		const content = await readSkill();

		expect(content).toContain("## Healthy Structure Requirements");
		expect(content).toContain("**Program structure**");
		expect(content).toContain("**Procedure structure**");
		expect(content).toContain("For every important behavior");
	});
});
