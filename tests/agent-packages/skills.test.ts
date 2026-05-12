import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	discoverPackageSkills,
	resolvePackageSkills,
} from "../../lib/agent-packages/skills.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-package-skills-");

async function writeFlatSkill(
	skillsDir: string,
	fileName: string,
	options: {
		readonly name?: string;
		readonly description?: string;
		readonly body: string;
	},
): Promise<string> {
	await mkdir(skillsDir, { recursive: true });
	const filePath = join(skillsDir, fileName);
	await writeFile(filePath, skillMarkdown(options));
	return filePath;
}

async function writeDirectorySkill(
	skillsDir: string,
	dirName: string,
	options: {
		readonly name?: string;
		readonly description?: string;
		readonly body: string;
	},
): Promise<string> {
	const skillDir = join(skillsDir, dirName);
	await mkdir(skillDir, { recursive: true });
	const filePath = join(skillDir, "SKILL.md");
	await writeFile(filePath, skillMarkdown(options));
	return filePath;
}

function skillMarkdown(options: {
	readonly name?: string;
	readonly description?: string;
	readonly body: string;
}): string {
	const lines = ["---"];
	if (options.name) lines.push(`name: ${options.name}`);
	if (options.description) lines.push(`description: ${options.description}`);
	lines.push("---", "", options.body);
	return lines.join("\n");
}

function sourceAgent(
	skills: readonly string[],
): Pick<AgentDefinition, "skills"> {
	return { skills };
}

describe("discoverPackageSkills", () => {
	it("discovers root flat markdown and recursive directory skills with full frontmatter-stripped bodies", async () => {
		const skillsDir = join(tmp.path, "skills");
		const flatPath = await writeFlatSkill(skillsDir, "flat.md", {
			name: "flat",
			description: "Flat skill",
			body: "# Flat\n\nUse the full flat body.",
		});
		const directoryPath = await writeDirectorySkill(
			join(skillsDir, "languages"),
			"typescript",
			{
				name: "typescript",
				description: "TypeScript skill",
				body: "# TypeScript\n\nUse strict types.",
			},
		);
		await writeFlatSkill(join(skillsDir, "nested"), "ignored.md", {
			name: "ignored",
			description: "Nested flat markdown is not a skill",
			body: "This should not be discovered.",
		});

		const skills = await discoverPackageSkills([skillsDir]);

		expect(skills).toEqual([
			{
				name: "flat",
				description: "Flat skill",
				content: "# Flat\n\nUse the full flat body.",
				sourcePath: flatPath,
			},
			{
				name: "typescript",
				description: "TypeScript skill",
				content: "# TypeScript\n\nUse strict types.",
				sourcePath: directoryPath,
			},
		]);
		expect(skills.map((skill) => skill.content).join("\n")).not.toContain(
			"---",
		);
	});

	it("deduplicates skill names by the first match in skillPaths order", async () => {
		const firstDir = join(tmp.path, "first");
		const secondDir = join(tmp.path, "second");
		await writeFlatSkill(firstDir, "first-name.md", {
			name: "duplicate",
			description: "First duplicate",
			body: "# First",
		});
		await writeFlatSkill(secondDir, "second-name.md", {
			name: "duplicate",
			description: "Second duplicate",
			body: "# Second",
		});

		const skills = await discoverPackageSkills([firstDir, secondDir]);

		expect(skills).toHaveLength(1);
		expect(skills[0]).toMatchObject({
			name: "duplicate",
			description: "First duplicate",
			content: "# First",
		});
	});

	it("treats a skillPath containing SKILL.md as a directory skill", async () => {
		const sourcePath = await writeDirectorySkill(tmp.path, "standalone", {
			name: "standalone",
			description: "Standalone skill",
			body: "# Standalone",
		});

		const skills = await discoverPackageSkills([join(tmp.path, "standalone")]);

		expect(skills).toEqual([
			{
				name: "standalone",
				description: "Standalone skill",
				content: "# Standalone",
				sourcePath,
			},
		]);
	});

	it("does not recurse inside a directory that already contains SKILL.md", async () => {
		const skillsDir = join(tmp.path, "skills");
		await writeDirectorySkill(skillsDir, "compound", {
			name: "compound",
			description: "Compound skill",
			body: "# Compound",
		});
		await writeDirectorySkill(join(skillsDir, "compound"), "nested", {
			name: "nested",
			description: "Nested skill",
			body: "# Nested",
		});

		const skills = await discoverPackageSkills([skillsDir]);

		expect(skills.map((skill) => skill.name)).toEqual(["compound"]);
	});
});

describe("resolvePackageSkills", () => {
	it("returns no skills for none mode", async () => {
		await writeFlatSkill(join(tmp.path, "skills"), "flat.md", {
			name: "flat",
			description: "Flat skill",
			body: "# Flat",
		});

		const skills = await resolvePackageSkills({
			selection: { mode: "none" },
			skillPaths: [join(tmp.path, "skills")],
		});

		expect(skills).toEqual([]);
	});

	it("allowlist mode embeds exactly the named discovered skills", async () => {
		const skillsDir = join(tmp.path, "skills");
		await writeFlatSkill(skillsDir, "flat.md", {
			name: "flat",
			description: "Flat skill",
			body: "# Flat",
		});
		await writeDirectorySkill(skillsDir, "directory", {
			name: "directory",
			description: "Directory skill",
			body: "# Directory",
		});
		await writeFlatSkill(skillsDir, "other.md", {
			name: "other",
			description: "Other skill",
			body: "# Other",
		});

		const skills = await resolvePackageSkills({
			selection: { mode: "allowlist", names: ["flat", "directory"] },
			skillPaths: [skillsDir],
		});

		expect(skills.map((skill) => skill.name)).toEqual(["flat", "directory"]);
		expect(skills.map((skill) => skill.content)).toEqual([
			"# Flat",
			"# Directory",
		]);
	});

	it("allowlist mode reports a clear diagnostic for missing skills", async () => {
		const skillsDir = join(tmp.path, "skills");
		await writeFlatSkill(skillsDir, "known.md", {
			name: "known",
			description: "Known skill",
			body: "# Known",
		});

		await expect(
			resolvePackageSkills({
				selection: { mode: "allowlist", names: ["known", "missing"] },
				skillPaths: [skillsDir],
			}),
		).rejects.toThrow(/Missing package skills: missing.*Searched skillPaths/s);
	});

	it("source-agent mode preserves shared skills under project-level filters", async () => {
		const domainsDir = join(tmp.path, "domains");
		const codingSkills = join(domainsDir, "coding", "skills");
		const sharedSkills = join(domainsDir, "shared", "skills");
		await writeFlatSkill(codingSkills, "typescript.md", {
			name: "typescript",
			description: "TypeScript skill",
			body: "# TypeScript",
		});
		await writeDirectorySkill(sharedSkills, "plan", {
			name: "plan",
			description: "Plan skill",
			body: "# Plan",
		});

		const skills = await resolvePackageSkills({
			selection: { mode: "source-agent" },
			sourceAgent: sourceAgent(["typescript", "plan"]),
			projectSkills: ["typescript"],
			domainsDir,
			skillPaths: [codingSkills, sharedSkills],
		});

		expect(skills.map((skill) => skill.name)).toEqual(["typescript", "plan"]);
	});
});
