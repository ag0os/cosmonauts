/** Metadata parsed from a SKILL.md frontmatter. */
export interface SkillInfo {
	/** Unique skill name (from frontmatter `name` field). */
	name: string;
	/** Short description (from frontmatter `description` field). */
	description: string;
	/** Absolute path to the SKILL.md file. */
	filePath: string;
}
