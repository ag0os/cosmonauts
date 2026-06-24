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
import { selectPublicSkillNames } from "../domains/public-surface.ts";
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

interface ResolveEffectiveProjectSkillsOptions {
	/** Project-level skill filter list (from .cosmonauts/config.json). */
	readonly projectSkills?: readonly string[];
	/** Absolute path to the root domains directory (required when no resolver). */
	readonly domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	readonly resolver?: DomainResolver;
}

interface ResolveVisibleSkillNamesOptions {
	/** Domain requesting visibility. Defaults to the coding domain for legacy agents. */
	readonly requesterDomain?: string;
	/** Domain resolver for loaded-domain visibility rules. */
	readonly resolver?: DomainResolver;
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

export function resolveVisibleSkillNames(
	options: ResolveVisibleSkillNamesOptions,
): readonly string[] | undefined {
	if (!options.resolver) return undefined;

	const requesterDomain = options.requesterDomain ?? "coding";
	return [
		...new Set(
			options.resolver.registry
				.listAll()
				.flatMap((domain) => selectPublicSkillNames(domain, requesterDomain)),
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
	visibleSkillNames?: readonly string[],
): SkillsOverrideFn | undefined {
	const visibleSkills =
		visibleSkillNames === undefined ? undefined : new Set(visibleSkillNames);

	if (agentSkills.length === 0) {
		return (base) => ({
			skills: [],
			diagnostics: base.diagnostics,
		});
	}

	const agentAll = isWildcard(agentSkills);

	if (agentAll && projectSkills === undefined && visibleSkills === undefined) {
		return undefined;
	}

	if (agentAll && projectSkills !== undefined) {
		const allowlist = new Set(projectSkills);
		return (base) => ({
			skills: base.skills.filter(
				(s) =>
					allowlist.has(s.name) &&
					(visibleSkills === undefined || visibleSkills.has(s.name)),
			),
			diagnostics: base.diagnostics,
		});
	}

	if (agentAll && visibleSkills !== undefined) {
		return (base) => ({
			skills: base.skills.filter((s) => visibleSkills.has(s.name)),
			diagnostics: base.diagnostics,
		});
	}

	const allowlist =
		projectSkills !== undefined
			? new Set(agentSkills.filter((s) => new Set(projectSkills).has(s)))
			: new Set(agentSkills);

	return (base) => ({
		skills: base.skills.filter(
			(s) =>
				allowlist.has(s.name) &&
				(visibleSkills === undefined || visibleSkills.has(s.name)),
		),
		diagnostics: base.diagnostics,
	});
}
