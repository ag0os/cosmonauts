import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import { discoverSkills } from "../../lib/skills/discovery.ts";

const DISCOVERED_ROOTS = [
	{ domain: "shared", skillsDir: join("domains", "shared", "skills") },
	{ domain: "main", skillsDir: join("domains", "main", "skills") },
	{ domain: "coding", skillsDir: join("bundled", "coding", "skills") },
].map((root) => ({
	...root,
	skillsDir: join(process.cwd(), root.skillsDir),
}));
const EXPORTED_ROOT = join(process.cwd(), "external-skills");

async function skillFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { recursive: true });
	return entries
		.filter((entry) => basename(entry) === "SKILL.md")
		.map((entry) => join(root, entry));
}

describe("shipped skill frontmatter", () => {
	test("every shipped SKILL.md declares a name and a description", async () => {
		const files = (
			await Promise.all(
				[...DISCOVERED_ROOTS.map((root) => root.skillsDir), EXPORTED_ROOT].map(
					skillFiles,
				),
			)
		).flat();

		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			// Discovery falls back to the directory name and an empty description,
			// so a missing key is silent there; other harnesses read the keys.
			const { data } = matter(await readFile(file, "utf-8"));
			expect(String(data.name ?? "").trim(), file).not.toBe("");
			expect(String(data.description ?? "").trim(), file).not.toBe("");
		}
	});

	test("discovery finds every SKILL.md under the domain skill roots", async () => {
		const files = (
			await Promise.all(
				DISCOVERED_ROOTS.map((root) => skillFiles(root.skillsDir)),
			)
		).flat();
		const skills = await discoverSkills([], DISCOVERED_ROOTS);

		expect(skills.map((skill) => skill.dirPath).toSorted()).toEqual(
			files.map((file) => dirname(file)).toSorted(),
		);
		for (const skill of skills) {
			expect(skill.name, skill.dirPath).toBe(basename(skill.dirPath));
			expect(skill.description.trim(), skill.dirPath).not.toBe("");
		}
	});
});
