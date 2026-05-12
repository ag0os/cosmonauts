import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { Skill } from "@earendil-works/pi-coding-agent";
import matter from "gray-matter";
import {
	buildSkillsOverride,
	resolveEffectiveProjectSkills,
} from "../agents/skills.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import type { PackagedSkill, PackageSkillSelection } from "./types.ts";

interface ResolvePackageSkillsOptions {
	readonly selection: PackageSkillSelection;
	readonly skillPaths: readonly string[];
	readonly sourceAgent?: Pick<AgentDefinition, "skills">;
	readonly projectSkills?: readonly string[];
	readonly domainsDir?: string;
	readonly resolver?: DomainResolver;
}

interface SkillCandidate {
	readonly name: string;
	readonly sourcePath: string;
}

export async function discoverPackageSkills(
	skillPaths: readonly string[],
): Promise<PackagedSkill[]> {
	const skills: PackagedSkill[] = [];
	const seenNames = new Set<string>();

	for (const skillPath of skillPaths) {
		for (const candidate of await discoverCandidates(skillPath)) {
			const skill = await readPackagedSkill(candidate);
			if (seenNames.has(skill.name)) continue;
			seenNames.add(skill.name);
			skills.push(skill);
		}
	}

	return skills;
}

export async function resolvePackageSkills(
	options: ResolvePackageSkillsOptions,
): Promise<PackagedSkill[]> {
	if (options.selection.mode === "none") return [];

	const discovered = await discoverPackageSkills(options.skillPaths);
	if (options.selection.mode === "allowlist") {
		return selectAllowlistedSkills(
			discovered,
			options.selection.names,
			options.skillPaths,
		);
	}

	if (!options.sourceAgent) {
		throw new Error(
			'skills.mode "source-agent" requires a resolved source agent',
		);
	}

	const effectiveProjectSkills = await resolveEffectiveProjectSkills({
		projectSkills: options.projectSkills,
		domainsDir: options.domainsDir,
		resolver: options.resolver,
	});
	const override = buildSkillsOverride(
		options.sourceAgent.skills,
		effectiveProjectSkills,
	);
	if (!override) return discovered;

	const base = {
		skills: discovered.map((skill) => ({ name: skill.name }) as Skill),
		diagnostics: [],
	};
	const allowedNames = new Set(
		override(base).skills.map((skill) => skill.name),
	);
	return discovered.filter((skill) => allowedNames.has(skill.name));
}

async function discoverCandidates(
	skillPath: string,
): Promise<SkillCandidate[]> {
	const candidates: SkillCandidate[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(skillPath, { withFileTypes: true });
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}

	if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
		return [
			{ name: basename(skillPath), sourcePath: join(skillPath, "SKILL.md") },
		];
	}

	for (const entry of entries) {
		const entryPath = join(skillPath, entry.name);
		if (entry.isFile() && extname(entry.name) === ".md") {
			candidates.push({
				name: basename(entry.name, ".md"),
				sourcePath: entryPath,
			});
			continue;
		}
		if (entry.isDirectory()) {
			candidates.push(...(await discoverDirectorySkills(entryPath)));
		}
	}

	return candidates;
}

async function discoverDirectorySkills(dir: string): Promise<SkillCandidate[]> {
	const candidates: SkillCandidate[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}

	if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
		return [{ name: basename(dir), sourcePath: join(dir, "SKILL.md") }];
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			candidates.push(
				...(await discoverDirectorySkills(join(dir, entry.name))),
			);
		}
	}

	return candidates.sort((left, right) =>
		relative(dir, left.sourcePath).localeCompare(
			relative(dir, right.sourcePath),
		),
	);
}

async function readPackagedSkill(
	candidate: SkillCandidate,
): Promise<PackagedSkill> {
	const raw = await readFile(candidate.sourcePath, "utf-8");
	const parsed = matter(raw);
	const name = stringMatterValue(parsed.data.name) ?? candidate.name;
	const description = stringMatterValue(parsed.data.description) ?? "";
	return {
		name,
		description,
		content: parsed.content.trimStart(),
		sourcePath: candidate.sourcePath,
	};
}

function selectAllowlistedSkills(
	skills: readonly PackagedSkill[],
	names: readonly string[],
	skillPaths: readonly string[],
): PackagedSkill[] {
	const byName = new Map(skills.map((skill) => [skill.name, skill]));
	const selected: PackagedSkill[] = [];
	const missing: string[] = [];
	for (const name of names) {
		const skill = byName.get(name);
		if (skill) {
			selected.push(skill);
		} else {
			missing.push(name);
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`Missing package skills: ${missing.join(", ")}. Searched skillPaths: ${skillPaths.join(", ")}`,
		);
	}
	return selected;
}

function stringMatterValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
