/**
 * Skill discovery and loading — finds SKILL.md files and formats skill indexes.
 *
 * Re-exports the loader's public API.
 */

export {
	discoverSkills,
	formatSkillIndex,
	readSkillContent,
	SKILLS_DIR,
} from "./loader.ts";
export type { SkillInfo } from "./types.ts";
