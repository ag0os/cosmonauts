import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	discoverSkills,
	formatSkillIndex,
	readSkillContent,
	SKILLS_DIR,
} from "../../lib/skills/loader.ts";

// ============================================================================
// Fixtures
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "skills-test-"));
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

function skillFile(name: string, description: string, body: string): string {
	return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

// ============================================================================
// discoverSkills
// ============================================================================

describe("discoverSkills", () => {
	it("discovers skills in nested directories", async () => {
		await mkdir(join(tmpDir, "languages", "typescript"), { recursive: true });
		await mkdir(join(tmpDir, "domains", "testing"), { recursive: true });

		await writeFile(
			join(tmpDir, "languages", "typescript", "SKILL.md"),
			skillFile("typescript", "TS patterns", "# TS"),
		);
		await writeFile(
			join(tmpDir, "domains", "testing", "SKILL.md"),
			skillFile("testing", "Testing guide", "# Testing"),
		);

		const skills = await discoverSkills(tmpDir);
		expect(skills).toHaveLength(2);
	});

	it("sorts results by name", async () => {
		await mkdir(join(tmpDir, "b"), { recursive: true });
		await mkdir(join(tmpDir, "a"), { recursive: true });

		await writeFile(
			join(tmpDir, "b", "SKILL.md"),
			skillFile("zulu", "Z skill", "# Z"),
		);
		await writeFile(
			join(tmpDir, "a", "SKILL.md"),
			skillFile("alpha", "A skill", "# A"),
		);

		const skills = await discoverSkills(tmpDir);
		expect(skills[0]?.name).toBe("alpha");
		expect(skills[1]?.name).toBe("zulu");
	});

	it("parses frontmatter correctly", async () => {
		await writeFile(
			join(tmpDir, "SKILL.md"),
			skillFile("typescript", "TS best practices", "# Content"),
		);

		const skills = await discoverSkills(tmpDir);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.name).toBe("typescript");
		expect(skills[0]?.description).toBe("TS best practices");
		expect(skills[0]?.filePath).toBe(join(tmpDir, "SKILL.md"));
	});

	it("returns empty array for empty directory", async () => {
		const skills = await discoverSkills(tmpDir);
		expect(skills).toEqual([]);
	});

	it("throws when name is missing from frontmatter", async () => {
		await writeFile(
			join(tmpDir, "SKILL.md"),
			"---\ndescription: no name\n---\n\n# Content",
		);

		await expect(discoverSkills(tmpDir)).rejects.toThrow(
			/missing required "name"/,
		);
	});

	it("throws when description is missing from frontmatter", async () => {
		await writeFile(
			join(tmpDir, "SKILL.md"),
			"---\nname: test\n---\n\n# Content",
		);

		await expect(discoverSkills(tmpDir)).rejects.toThrow(
			/missing required "description"/,
		);
	});

	it("filters by allowlist when provided", async () => {
		await mkdir(join(tmpDir, "a"), { recursive: true });
		await mkdir(join(tmpDir, "b"), { recursive: true });

		await writeFile(
			join(tmpDir, "a", "SKILL.md"),
			skillFile("alpha", "A skill", "# A"),
		);
		await writeFile(
			join(tmpDir, "b", "SKILL.md"),
			skillFile("beta", "B skill", "# B"),
		);

		const skills = await discoverSkills(tmpDir, ["alpha"]);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.name).toBe("alpha");
	});

	it("returns empty when allowlist matches nothing", async () => {
		await writeFile(
			join(tmpDir, "SKILL.md"),
			skillFile("typescript", "TS", "# TS"),
		);

		const skills = await discoverSkills(tmpDir, ["nonexistent"]);
		expect(skills).toEqual([]);
	});

	it("returns empty for nonexistent directory", async () => {
		const skills = await discoverSkills(join(tmpDir, "does-not-exist"));
		expect(skills).toEqual([]);
	});
});

// ============================================================================
// readSkillContent
// ============================================================================

describe("readSkillContent", () => {
	it("strips frontmatter and returns content", async () => {
		const filePath = join(tmpDir, "SKILL.md");
		await writeFile(
			filePath,
			skillFile("test", "Test skill", "# Content\n\nBody text."),
		);

		const content = await readSkillContent(filePath);
		expect(content).toBe("# Content\n\nBody text.");
	});

	it("returns content unchanged when no frontmatter", async () => {
		const filePath = join(tmpDir, "SKILL.md");
		await writeFile(filePath, "# Just content\n\nNo frontmatter.");

		const content = await readSkillContent(filePath);
		expect(content).toBe("# Just content\n\nNo frontmatter.");
	});

	it("throws for missing file", async () => {
		await expect(
			readSkillContent(join(tmpDir, "nonexistent.md")),
		).rejects.toThrow(/Skill file not found/);
	});
});

// ============================================================================
// formatSkillIndex
// ============================================================================

describe("formatSkillIndex", () => {
	it("formats a single skill", () => {
		const index = formatSkillIndex([
			{ name: "typescript", description: "TS patterns", filePath: "/a" },
		]);
		expect(index).toContain("## Available Skills");
		expect(index).toContain("- typescript: TS patterns");
		expect(index).toContain("`skill_read`");
	});

	it("formats multiple skills", () => {
		const index = formatSkillIndex([
			{ name: "alpha", description: "A skill", filePath: "/a" },
			{ name: "beta", description: "B skill", filePath: "/b" },
		]);
		expect(index).toContain("- alpha: A skill");
		expect(index).toContain("- beta: B skill");
	});

	it("returns empty string for empty array", () => {
		const index = formatSkillIndex([]);
		expect(index).toBe("");
	});

	it("produces the DESIGN.md-specified format", () => {
		const index = formatSkillIndex([
			{
				name: "typescript",
				description:
					"TypeScript best practices and patterns. Load for TypeScript projects.",
				filePath: "/skills/languages/typescript/SKILL.md",
			},
		]);
		const expected = [
			"## Available Skills",
			"",
			"You can load any of these skills when needed using `skill_read`:",
			"- typescript: TypeScript best practices and patterns. Load for TypeScript projects.",
		].join("\n");
		expect(index).toBe(expected);
	});
});

// ============================================================================
// SKILLS_DIR
// ============================================================================

describe("SKILLS_DIR", () => {
	it("points to a skills directory path", () => {
		expect(SKILLS_DIR).toMatch(/skills$/);
	});
});
