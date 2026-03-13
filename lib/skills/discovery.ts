/**
 * Skill discovery across loaded domains.
 *
 * Scans domain skill directories for SKILL.md files and returns
 * metadata about each discovered skill. Matches Pi's discovery rules:
 * direct .md children at root level, and recursive SKILL.md under subdirectories.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { LoadedDomain } from "../domains/types.ts";

/** Metadata for a discovered skill. */
export interface DiscoveredSkill {
	/** Skill name (from frontmatter or directory name). */
	readonly name: string;
	/** Skill description (from frontmatter). */
	readonly description: string;
	/** Domain this skill belongs to. */
	readonly domain: string;
	/** Absolute path to the skill directory (or file for flat .md skills). */
	readonly dirPath: string;
}

/**
 * Discover all skills across loaded domains.
 *
 * Scans each domain's skills directory recursively for SKILL.md files.
 * A skill directory is any directory containing a SKILL.md file.
 */
export async function discoverSkills(
	domains: readonly LoadedDomain[],
): Promise<DiscoveredSkill[]> {
	const skills: DiscoveredSkill[] = [];

	for (const domain of domains) {
		const skillsDir = join(domain.rootDir, "skills");
		if (!(await isDirectory(skillsDir))) continue;

		await scanForSkills(skillsDir, domain.manifest.id, skills);
	}

	return skills;
}

/**
 * Recursively scan a directory for SKILL.md files.
 * When a SKILL.md is found, the containing directory is the skill directory.
 * When a directory has no SKILL.md, recurse into its subdirectories.
 */
async function scanForSkills(
	dirPath: string,
	domain: string,
	results: DiscoveredSkill[],
): Promise<void> {
	const entries = await readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const childDir = join(dirPath, entry.name);
		const skill = await loadSkillMeta(childDir, entry.name, domain);
		if (skill) {
			results.push(skill);
		} else {
			// No SKILL.md here — recurse deeper
			await scanForSkills(childDir, domain, results);
		}
	}
}

/**
 * Load skill metadata from a skill directory.
 * Returns null if no SKILL.md is found.
 */
async function loadSkillMeta(
	dirPath: string,
	dirName: string,
	domain: string,
): Promise<DiscoveredSkill | null> {
	const skillFile = join(dirPath, "SKILL.md");
	let content: string;
	try {
		content = await readFile(skillFile, "utf-8");
	} catch {
		return null;
	}

	const { data } = matter(content);
	return {
		name: typeof data.name === "string" ? data.name : dirName,
		description: typeof data.description === "string" ? data.description : "",
		domain,
		dirPath,
	};
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
