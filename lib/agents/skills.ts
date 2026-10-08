/**
 * Shared skill filtering logic for agent spawning.
 *
 * Builds a `skillsOverride` callback for Pi's DefaultResourceLoader
 * based on the intersection of agent-level and project-level skill lists.
 */

import { join } from "node:path";
import { resolveDefaultDomain } from "../domains/default-domain.ts";
import { canAccessSurfaceName } from "../domains/public-surface.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import type { LoadedDomain } from "../domains/types.ts";
import { discoverSkills } from "../skills/discovery.ts";

/** All the filter reads of a skill; Pi's `Skill` has it. */
interface NamedSkill {
	readonly name: string;
}

/**
 * A skill filter for Pi's DefaultResourceLoader.skillsOverride, generic so
 * this module need not import Pi's `Skill`; `session-assembly.ts` checks it
 * stays assignable to Pi's callback type.
 */
export type SkillsOverrideFn = <S extends NamedSkill, D>(base: {
	skills: S[];
	diagnostics: D[];
}) => {
	skills: S[];
	diagnostics: D[];
};

const WILDCARD = "*";

interface ResolveEffectiveProjectSkillsOptions {
	/** Project-level skill filter list (from .cosmonauts/config.json). */
	readonly projectSkills?: readonly string[];
	/** Absolute path to the root domains directory (required when no resolver). */
	readonly domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	readonly resolver?: DomainResolver;
	/**
	 * The agent the list is for. Skills it names explicitly that its own
	 * domain ships stay visible whatever the project list says.
	 */
	readonly agent?: {
		readonly skills: readonly string[];
		readonly domain?: string | undefined;
	};
}

interface ResolveSkillVisibilityOptions {
	/** Domain requesting visibility. Defaults to the framework default domain. */
	readonly requesterDomain?: string;
	/** Domain resolver for loaded-domain visibility rules. */
	readonly resolver?: DomainResolver;
}

interface SkillVisibilityFilter {
	/** Optional allow-list retained for callers that need positive filtering. */
	readonly visibleSkillNames?: readonly string[];
	/** Skill names denied by provider-domain internal visibility rules. */
	readonly hiddenSkillNames?: readonly string[];
}

function isWildcard(skills: readonly string[]): boolean {
	return skills.includes(WILDCARD);
}

function buildSyntheticSharedDomain(domainsDir: string): LoadedDomain {
	const rootDir = join(domainsDir, "shared");
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
		chains: [],
		provenance: [
			{ origin: domainsDir, precedence: 0, kind: "domains-dir", rootDir },
		],
		rootDirs: [rootDir],
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

/** The skills an agent names explicitly that its own domain ships; none for a wildcard agent. */
async function listOwnDomainSkillNames(
	agent: ResolveEffectiveProjectSkillsOptions["agent"],
	resolver: DomainResolver | undefined,
): Promise<readonly string[]> {
	if (!agent?.domain || isWildcard(agent.skills)) return [];
	const domain = resolver?.registry.get(agent.domain);
	if (!domain) return [];
	const shipped = new Set(
		(await discoverSkills([domain])).map((skill) => skill.name),
	);
	return agent.skills.filter((name) => shipped.has(name));
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
		...(await listOwnDomainSkillNames(options.agent, options.resolver)),
		...options.projectSkills,
	];
}

export function resolveHiddenSkillNames(
	options: ResolveSkillVisibilityOptions,
): readonly string[] | undefined {
	if (!options.resolver) return undefined;

	const requesterDomain = resolveDefaultDomain({
		explicitDomain: options.requesterDomain,
		resolver: options.resolver,
		purpose: "skill visibility resolution",
	});
	return [
		...new Set(
			options.resolver.registry.listAll().flatMap((domain) =>
				(domain.manifest.internal?.skills ?? []).filter(
					(name) =>
						!canAccessSurfaceName({
							domain,
							assetType: "skills",
							name,
							requesterDomain,
						}),
				),
			),
		),
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
	visibility?: SkillVisibilityFilter,
): SkillsOverrideFn | undefined {
	const visibleSkills =
		visibility?.visibleSkillNames === undefined
			? undefined
			: new Set(visibility.visibleSkillNames);
	const hiddenSkills =
		visibility?.hiddenSkillNames === undefined
			? undefined
			: new Set(visibility.hiddenSkillNames);
	const isVisible = (skill: NamedSkill): boolean =>
		(visibleSkills === undefined || visibleSkills.has(skill.name)) &&
		(hiddenSkills === undefined || !hiddenSkills.has(skill.name));

	if (agentSkills.length === 0) {
		return (base) => ({
			skills: [],
			diagnostics: base.diagnostics,
		});
	}

	const agentAll = isWildcard(agentSkills);

	if (
		agentAll &&
		projectSkills === undefined &&
		visibleSkills === undefined &&
		hiddenSkills === undefined
	) {
		return undefined;
	}

	if (agentAll && projectSkills !== undefined) {
		const allowlist = new Set(projectSkills);
		return (base) => ({
			skills: base.skills.filter((s) => allowlist.has(s.name) && isVisible(s)),
			diagnostics: base.diagnostics,
		});
	}

	if (agentAll && (visibleSkills !== undefined || hiddenSkills !== undefined)) {
		return (base) => ({
			skills: base.skills.filter((s) => isVisible(s)),
			diagnostics: base.diagnostics,
		});
	}

	const allowlist =
		projectSkills !== undefined
			? new Set(agentSkills.filter((s) => new Set(projectSkills).has(s)))
			: new Set(agentSkills);

	return (base) => ({
		skills: base.skills.filter((s) => allowlist.has(s.name) && isVisible(s)),
		diagnostics: base.diagnostics,
	});
}
