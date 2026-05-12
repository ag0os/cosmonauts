/**
 * Shared skill filtering logic for agent spawning.
 *
 * Builds a `skillsOverride` callback for Pi's DefaultResourceLoader
 * based on the intersection of agent-level and project-level skill lists.
 */

import { join } from "node:path";
import type {
	ResourceDiagnostic,
	Skill,
} from "@earendil-works/pi-coding-agent";
import type { DomainResolver } from "../domains/resolver.ts";
import type { LoadedDomain } from "../domains/types.ts";
import { discoverSkills } from "../skills/discovery.ts";

/** The callback type accepted by Pi's DefaultResourceLoader.skillsOverride. */
export type SkillsOverrideFn = (base: {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}) => {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
};

const WILDCARD = "*";

export interface ResolveEffectiveProjectSkillsOptions {
	/** Project-level skill filter list (from .cosmonauts/config.json). */
	readonly projectSkills?: readonly string[];
	/** Absolute path to the root domains directory (required when no resolver). */
	readonly domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	readonly resolver?: DomainResolver;
}

function isWildcard(skills: readonly string[]): boolean {
	return skills.includes(WILDCARD);
}

function buildSyntheticSharedDomain(domainsDir: string): LoadedDomain {
	return {
		manifest: {
			id: "shared",
			description: "shared",
		},
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: [join(domainsDir, "shared")],
	};
}

async function listSharedSkillNames(options: {
	domainsDir?: string;
	resolver?: DomainResolver;
}): Promise<readonly string[]> {
	const sharedDomain =
		options.resolver?.registry.get("shared") ??
		(options.domainsDir
			? buildSyntheticSharedDomain(options.domainsDir)
			: undefined);
	if (!sharedDomain) return [];

	const skills = await discoverSkills([sharedDomain]);
	return [...new Set(skills.map((skill) => skill.name))];
}

export async function resolveEffectiveProjectSkills(
	options: ResolveEffectiveProjectSkillsOptions,
): Promise<readonly string[] | undefined> {
	if (options.projectSkills === undefined) return undefined;

	return [
		...(await listSharedSkillNames({
			domainsDir: options.domainsDir,
			resolver: options.resolver,
		})),
		...options.projectSkills,
	];
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
