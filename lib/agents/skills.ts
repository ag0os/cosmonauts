/**
 * Shared skill filtering logic for agent spawning.
 *
 * Builds a `skillsOverride` callback for Pi's DefaultResourceLoader
 * based on the intersection of agent-level and project-level skill lists.
 */

import type { ResourceDiagnostic, Skill } from "@mariozechner/pi-coding-agent";

/** The callback type accepted by Pi's DefaultResourceLoader.skillsOverride. */
export type SkillsOverrideFn = (base: {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}) => {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
};

/**
 * Build a skillsOverride callback from agent-level and project-level skill lists.
 *
 * Resolution logic:
 * - Agent `skills: []` → always empty (no access), regardless of project config
 * - Agent `skills: undefined` + no project skills → undefined (all skills, current default)
 * - Agent `skills: undefined` + project skills → filter to project list
 * - Agent `skills: [...]` + project skills → filter to intersection
 * - Agent `skills: [...]` + no project skills → filter to agent list
 */
export function buildSkillsOverride(
	agentSkills: readonly string[] | undefined,
	projectSkills: readonly string[] | undefined,
): SkillsOverrideFn | undefined {
	// Agent explicitly opted out of all skills
	if (Array.isArray(agentSkills) && agentSkills.length === 0) {
		return (base) => ({
			skills: [],
			diagnostics: base.diagnostics,
		});
	}

	// No filtering needed — both undefined
	if (agentSkills === undefined && projectSkills === undefined) {
		return undefined;
	}

	// Build the effective allowlist
	let allowlist: ReadonlySet<string>;
	if (agentSkills !== undefined && projectSkills !== undefined) {
		// Intersection: only skills in both lists
		const projectSet = new Set(projectSkills);
		allowlist = new Set(agentSkills.filter((s) => projectSet.has(s)));
	} else if (agentSkills !== undefined) {
		// Agent list only
		allowlist = new Set(agentSkills);
	} else {
		// Project list only (agentSkills is undefined)
		allowlist = new Set(projectSkills);
	}

	return (base) => ({
		skills: base.skills.filter((s) => allowlist.has(s.name)),
		diagnostics: base.diagnostics,
	});
}
