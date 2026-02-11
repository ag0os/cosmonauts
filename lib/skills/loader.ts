/**
 * Skill discovery and loading — finds SKILL.md files, parses frontmatter,
 * and formats the skill index for system prompt injection.
 *
 * Follows the same patterns as `lib/prompts/loader.ts`.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { SkillInfo } from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

/** Default skills directory, resolved relative to the package root. */
export const SKILLS_DIR: string = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"skills",
);

const SKILL_FILENAME = "SKILL.md";

// ============================================================================
// Public API
// ============================================================================

/**
 * Recursively discover all SKILL.md files in a directory tree.
 *
 * Each SKILL.md must have YAML frontmatter with `name` and `description`.
 *
 * @param skillsDir - Root directory to search (defaults to SKILLS_DIR)
 * @param allowlist - Optional list of skill names to include. When provided,
 *   only skills whose name appears in the list are returned.
 * @returns Array of SkillInfo sorted alphabetically by name
 * @throws If a SKILL.md file is missing required `name` or `description` frontmatter
 */
export async function discoverSkills(
	skillsDir: string = SKILLS_DIR,
	allowlist?: readonly string[],
): Promise<SkillInfo[]> {
	const skills = await scanDirectory(skillsDir);

	const filtered = allowlist
		? skills.filter((s) => allowlist.includes(s.name))
		: skills;

	return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read a skill file and return its content with frontmatter stripped.
 *
 * @param filePath - Absolute path to the SKILL.md file
 * @returns The skill content without YAML frontmatter
 * @throws If the file does not exist or cannot be read
 */
export async function readSkillContent(filePath: string): Promise<string> {
	let raw: string;
	try {
		raw = await readFile(filePath, "utf-8");
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT") {
			throw new Error(`Skill file not found: ${filePath}`);
		}
		throw err;
	}

	const { content } = matter(raw);
	return content.trimStart();
}

/**
 * Format an array of skills into a human-readable index for system prompt injection.
 *
 * @param skills - Array of SkillInfo to format
 * @returns Formatted skill index string, or empty string if no skills
 */
export function formatSkillIndex(skills: readonly SkillInfo[]): string {
	if (skills.length === 0) return "";

	const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
	return [
		"## Available Skills",
		"",
		"You can load any of these skills when needed using `skill_read`:",
		...lines,
	].join("\n");
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recursively scan a directory for SKILL.md files.
 */
async function scanDirectory(dir: string): Promise<SkillInfo[]> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}

	const results: SkillInfo[] = [];

	for (const name of names) {
		const fullPath = join(dir, name);
		const info = await stat(fullPath);

		if (info.isDirectory()) {
			const nested = await scanDirectory(fullPath);
			results.push(...nested);
		} else if (name === SKILL_FILENAME) {
			results.push(await parseSkillFile(fullPath));
		}
	}

	return results;
}

/**
 * Parse a SKILL.md file and extract frontmatter metadata.
 */
async function parseSkillFile(filePath: string): Promise<SkillInfo> {
	const raw = await readFile(filePath, "utf-8");
	const { data } = matter(raw);

	if (!data.name || typeof data.name !== "string") {
		throw new Error(
			`Skill file missing required "name" in frontmatter: ${filePath}`,
		);
	}
	if (!data.description || typeof data.description !== "string") {
		throw new Error(
			`Skill file missing required "description" in frontmatter: ${filePath}`,
		);
	}

	return {
		name: data.name,
		description: data.description,
		filePath,
	};
}
