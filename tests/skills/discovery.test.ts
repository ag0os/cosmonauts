/**
 * Tests for skill discovery across domains.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { discoverSkills } from "../../lib/skills/discovery.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("skills-discovery-");

/** Create a minimal LoadedDomain pointing at a temp directory. */
function makeDomain(id: string, rootDir: string): LoadedDomain {
	return {
		manifest: { id, description: `${id} domain` },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: [rootDir],
	};
}

/** Write a SKILL.md with frontmatter into a skill directory. */
async function writeSkill(
	skillsDir: string,
	name: string,
	description: string,
): Promise<void> {
	const dir = join(skillsDir, name);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
	);
}

async function findSkillFiles(dirPath: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findSkillFiles(entryPath)));
		} else if (entry.isFile() && entry.name === "SKILL.md") {
			files.push(entryPath);
		}
	}

	return files;
}

describe("discoverSkills", () => {
	test("discovers skills from a single domain", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillsDir = join(domainDir, "skills");
		await writeSkill(skillsDir, "plan", "Plan skill");
		await writeSkill(skillsDir, "task", "Task skill");

		const domain = makeDomain("shared", domainDir);
		const skills = await discoverSkills([domain]);

		expect(skills).toHaveLength(2);
		expect(skills.map((s) => s.name).sort()).toEqual(["plan", "task"]);
		expect(skills.every((s) => s.domain === "shared")).toBe(true);
	});

	test("discovers skills from multiple domains", async () => {
		const sharedDir = join(tmp.path, "shared");
		const codingDir = join(tmp.path, "coding");
		await writeSkill(join(sharedDir, "skills"), "plan", "Plan skill");
		await writeSkill(join(codingDir, "skills"), "typescript", "TS skill");

		const skills = await discoverSkills([
			makeDomain("shared", sharedDir),
			makeDomain("coding", codingDir),
		]);

		expect(skills).toHaveLength(2);
		const names = skills.map((s) => s.name).sort();
		expect(names).toEqual(["plan", "typescript"]);
		expect(skills.find((s) => s.name === "plan")?.domain).toBe("shared");
		expect(skills.find((s) => s.name === "typescript")?.domain).toBe("coding");
	});

	test("discovers nested skills recursively", async () => {
		const domainDir = join(tmp.path, "coding");
		const skillsDir = join(domainDir, "skills");
		// Nested: skills/languages/typescript/SKILL.md
		const nestedDir = join(skillsDir, "languages", "typescript");
		await mkdir(nestedDir, { recursive: true });
		await writeFile(
			join(nestedDir, "SKILL.md"),
			"---\nname: typescript\ndescription: TS patterns\n---\n",
		);

		const skills = await discoverSkills([makeDomain("coding", domainDir)]);

		expect(skills).toHaveLength(1);
		const skill = skills.find((s) => s.name === "typescript");
		expect(skill).toBeDefined();
		expect(skill?.dirPath).toBe(nestedDir);
	});

	test("returns empty array for domain without skills dir", async () => {
		const domainDir = join(tmp.path, "empty");
		await mkdir(domainDir, { recursive: true });

		const skills = await discoverSkills([makeDomain("empty", domainDir)]);
		expect(skills).toEqual([]);
	});

	test("skips directories without SKILL.md", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillsDir = join(domainDir, "skills");
		await writeSkill(skillsDir, "plan", "Plan skill");
		// Create a directory without SKILL.md
		await mkdir(join(skillsDir, "empty-dir"), { recursive: true });

		const skills = await discoverSkills([makeDomain("shared", domainDir)]);
		expect(skills).toHaveLength(1);
		expect(skills.find((s) => s.name === "plan")).toBeDefined();
	});

	test("falls back to directory name when frontmatter has no name", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillDir = join(domainDir, "skills", "my-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(
			join(skillDir, "SKILL.md"),
			"---\ndescription: A skill\n---\n",
		);

		const skills = await discoverSkills([makeDomain("shared", domainDir)]);
		expect(skills.find((s) => s.name === "my-skill")).toBeDefined();
	});

	test("discovers flat .md skills at root level", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillsDir = join(domainDir, "skills");
		await mkdir(skillsDir, { recursive: true });
		await writeFile(
			join(skillsDir, "quick-ref.md"),
			"---\nname: quick-ref\ndescription: A flat skill\n---\n",
		);

		const skills = await discoverSkills([makeDomain("shared", domainDir)]);
		expect(skills).toHaveLength(1);
		const skill = skills.find((s) => s.name === "quick-ref");
		expect(skill).toBeDefined();
		expect(skill?.description).toBe("A flat skill");
		expect(skill?.dirPath).toBe(join(skillsDir, "quick-ref.md"));
	});

	test("discovers both flat .md and directory skills", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillsDir = join(domainDir, "skills");
		await writeSkill(skillsDir, "plan", "Plan skill");
		await writeFile(
			join(skillsDir, "quick.md"),
			"---\nname: quick\ndescription: Quick\n---\n",
		);

		const skills = await discoverSkills([makeDomain("shared", domainDir)]);
		expect(skills).toHaveLength(2);
		expect(skills.map((s) => s.name).sort()).toEqual(["plan", "quick"]);
	});

	test("returns empty description when frontmatter has none", async () => {
		const domainDir = join(tmp.path, "shared");
		const skillDir = join(domainDir, "skills", "bare");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "---\nname: bare\n---\n");

		const skills = await discoverSkills([makeDomain("shared", domainDir)]);
		const bare = skills.find((s) => s.name === "bare");
		expect(bare?.description).toBe("");
	});

	test("packaged skill directory names match frontmatter names", async () => {
		const skillRoots = [
			join(process.cwd(), "bundled", "coding", "coding", "skills"),
			join(process.cwd(), "domains", "main", "skills"),
			join(process.cwd(), "domains", "shared", "skills"),
		];
		const skillFiles = (
			await Promise.all(skillRoots.map(findSkillFiles))
		).flat();
		const mismatches: string[] = [];

		for (const skillFile of skillFiles) {
			const content = await readFile(skillFile, "utf-8");
			const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
			const dirName = basename(dirname(skillFile));
			if (name !== undefined && name !== dirName) {
				mismatches.push(`${skillFile}: ${name} != ${dirName}`);
			}
		}

		expect(mismatches).toEqual([]);
	});
});
