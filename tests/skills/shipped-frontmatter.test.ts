import { basename, join } from "node:path";
import { describe, expect, test } from "vitest";
import { discoverSkills } from "../../lib/skills/discovery.ts";

const SHIPPED_SKILL_ROOTS = [
	{ domain: "shared", skillsDir: join("domains", "shared", "skills") },
	{ domain: "main", skillsDir: join("domains", "main", "skills") },
	{ domain: "coding", skillsDir: join("bundled", "coding", "skills") },
].map((root) => ({
	...root,
	skillsDir: join(process.cwd(), root.skillsDir),
}));

describe("shipped skill frontmatter", () => {
	test("every shipped skill is discovered under its directory name with a description", async () => {
		const skills = await discoverSkills([], SHIPPED_SKILL_ROOTS);

		expect(skills.length).toBeGreaterThan(0);
		for (const skill of skills) {
			// Agent definitions and `/skill:<name>` resolve skills by name, and the
			// description is the only text an agent sees before loading one.
			expect(skill.name, skill.dirPath).toBe(basename(skill.dirPath));
			expect(skill.description.trim(), skill.dirPath).not.toBe("");
		}
	});
});
