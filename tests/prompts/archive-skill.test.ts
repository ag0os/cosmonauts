import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/archive/SKILL.md",
	import.meta.url,
);

describe("archive skill", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-014
	it("distills supersessions and amend-on-record decisions into key decisions", async () => {
		const content = await readFile(SKILL_PATH, "utf-8");

		expect(content).toContain("supersessions and amend-on-record decisions");
		expect(content).toContain("what it replaced");
	});
});
