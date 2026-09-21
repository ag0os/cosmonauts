import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const skillPath = join(
	process.cwd(),
	"domains",
	"shared",
	"skills",
	"agent-packaging",
	"SKILL.md",
);

async function readSkill(): Promise<string> {
	return readFile(skillPath, "utf-8");
}

describe("agent-packaging skill", () => {
	test("exists as a non-empty directory skill with agent-packaging frontmatter", async () => {
		const content = await readSkill();

		expect(content.trim().length).toBeGreaterThan(0);
		expect(content).toMatch(/^---\n[\s\S]*^name:\s*agent-packaging$/m);
		expect(content).toMatch(/^description:\s*.+$/m);
	});
});
