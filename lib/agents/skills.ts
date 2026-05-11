/**
 * Shared skill filtering logic for agent spawning.
 *
 * Builds a `skillsOverride` callback for Pi's DefaultResourceLoader
 * based on the intersection of agent-level and project-level skill lists.
 */

import type {
	ResourceDiagnostic,
	Skill,
} from "@earendil-works/pi-coding-agent";

/** The callback type accepted by Pi's DefaultResourceLoader.skillsOverride. */
export type SkillsOverrideFn = (base: {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}) => {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
};

const WILDCARD = "*";

function isWildcard(skills: readonly string[]): boolean {
	return skills.includes(WILDCARD);
}

/**
 * Build a skillsOverride callback from agent-level and project-level skill lists.
 *
 * Resolution logic:
 * - Agent `skills: ["*"]` → all skills (no agent-level filtering)
 * - Agent `skills: []` → no skills, regardless of project config
 * - Agent `skills: ["*"]` + project skills → filter to project list only
 * - Agent `skills: [...]` + project skills → filter to intersection
 * - Agent `skills: [...]` + no project skills → filter to agent list
 */
export function buildSkillsOverride(
	agentSkills: readonly string[],
	projectSkills: readonly string[] | undefined,
): SkillsOverrideFn | undefined {
	if (agentSkills.length === 0) {
		return (base) => ({
			skills: [],
			diagnostics: base.diagnostics,
		});
	}

	const agentAll = isWildcard(agentSkills);

	if (agentAll && projectSkills === undefined) {
		return undefined;
	}

	if (agentAll && projectSkills !== undefined) {
		const allowlist = new Set(projectSkills);
		return (base) => ({
			skills: base.skills.filter((s) => allowlist.has(s.name)),
			diagnostics: base.diagnostics,
		});
	}

	const allowlist =
		projectSkills !== undefined
			? new Set(agentSkills.filter((s) => new Set(projectSkills).has(s)))
			: new Set(agentSkills);

	return (base) => ({
		skills: base.skills.filter((s) => allowlist.has(s.name)),
		diagnostics: base.diagnostics,
	});
}
