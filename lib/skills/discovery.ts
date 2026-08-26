/**
 * Skill discovery across loaded domains.
 *
 * Scans domain skill directories for SKILL.md files and returns
 * metadata about each discovered skill. Matches Pi's discovery rules:
 * direct .md children at root level, and recursive SKILL.md under subdirectories.
 */

import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { canAccessSurfaceName } from "../domains/public-surface.ts";
import type { LoadedDomain } from "../domains/types.ts";
import type {
	SkillCandidate,
	SourceHealthIssue,
	SourceHealthIssueKind,
	SourceHealthRow,
} from "../harness-adapters/types.ts";

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
 * Extra skill source for callers that need to scan directories outside of any
 * loaded domain — typically `projectConfig.skillPaths` configured by the user.
 * Each source is scanned with the same rules as a domain's `skills/` dir.
 */
export interface ExtraSkillSource {
	/** Absolute path to a directory whose immediate children are skills. */
	readonly skillsDir: string;
	/** Label used as the `domain` field on each discovered skill. */
	readonly domain: string;
}

interface DiscoverSkillsOptions {
	/** Domain requesting visibility. Undefined means outside every domain. */
	readonly domainContext?: string;
}

export interface StrictSkillDiscoveryResult {
	readonly candidates: readonly SkillCandidate[];
	readonly sourceHealth: readonly SourceHealthRow[];
}

interface StrictSkillSource {
	readonly sourceRootId: string;
	readonly sourceRoot: string;
	readonly skillsDir: string;
	readonly domain: string;
	readonly allowedSkill?: (name: string) => boolean;
}

/**
 * Discover all skills across loaded domains plus any extra skill paths.
 *
 * Scans each domain's skills directory recursively for SKILL.md files.
 * A skill directory is any directory containing a SKILL.md file.
 * Extra sources are scanned with the same rules — they exist so callers
 * can include user-configured `skillPaths` (or other ad-hoc dirs) without
 * synthesising fake domains.
 *
 * When the same skill name appears more than once — typical when a merged
 * domain has higher- and lower-precedence rootDirs, or when multiple package
 * sources expose the same skill — the first occurrence wins. That matches
 * the in-domain precedence convention (`mergeDomains` puts higher-precedence
 * rootDirs first) and the iteration order callers pass, so consumers see
 * exactly the skill that Pi would resolve at runtime.
 */
export async function discoverSkills(
	domains: readonly LoadedDomain[],
	extras: readonly ExtraSkillSource[] = [],
	options: DiscoverSkillsOptions = {},
): Promise<DiscoveredSkill[]> {
	const skills: DiscoveredSkill[] = [];

	for (const domain of domains) {
		for (const rootDir of domain.rootDirs) {
			const skillsDir = join(rootDir, "skills");
			if (!(await isDirectory(skillsDir))) continue;

			await scanForSkills(skillsDir, domain.manifest.id, skills, {
				allowedSkill: (name) =>
					canAccessSurfaceName({
						domain,
						assetType: "skills",
						name,
						requesterDomain: options.domainContext,
					}),
			});
		}
	}

	for (const extra of extras) {
		if (!(await isDirectory(extra.skillsDir))) continue;
		await scanForSkills(extra.skillsDir, extra.domain, skills);
	}

	const seen = new Set<string>();
	const unique: DiscoveredSkill[] = [];
	for (const skill of skills) {
		if (seen.has(skill.name)) continue;
		seen.add(skill.name);
		unique.push(skill);
	}
	return unique;
}

/**
 * Discover every export candidate without treating observation failures as
 * source absence. Unlike {@link discoverSkills}, this API does not apply
 * first-name-wins reduction; collision and override handling belongs to the
 * plain-row inventory layer.
 */
export async function discoverSkillCandidatesStrict(
	domains: readonly LoadedDomain[],
	extras: readonly ExtraSkillSource[] = [],
	options: DiscoverSkillsOptions = {},
): Promise<StrictSkillDiscoveryResult> {
	const sources: StrictSkillSource[] = [];

	for (const domain of domains) {
		for (const [index, rootDir] of domain.rootDirs.entries()) {
			const provenance = domain.provenance.find(
				(candidate) => candidate.rootDir === rootDir,
			);
			sources.push({
				sourceRootId: provenance
					? `${domain.manifest.id}:${provenance.origin}`
					: `domain:${domain.manifest.id}:${index}`,
				sourceRoot: rootDir,
				skillsDir: join(rootDir, "skills"),
				domain: domain.manifest.id,
				allowedSkill: (name) =>
					canAccessSurfaceName({
						domain,
						assetType: "skills",
						name,
						requesterDomain: options.domainContext,
					}),
			});
		}
	}

	for (const extra of extras) {
		sources.push({
			sourceRootId: `extra:${extra.domain}:${extra.skillsDir}`,
			sourceRoot: extra.skillsDir,
			skillsDir: extra.skillsDir,
			domain: extra.domain,
		});
	}

	const candidates: SkillCandidate[] = [];
	const sourceHealth: SourceHealthRow[] = [];
	for (const source of sources) {
		const issues: SourceHealthIssue[] = [];
		if (!(await strictSourceRootExists(source, issues))) {
			sourceHealth.push(healthRow(source, issues));
			continue;
		}

		const skillsDirState = await strictSkillsDirectoryState(source, issues);
		if (skillsDirState === "directory") {
			await scanForSkillCandidatesStrict(
				source.skillsDir,
				source,
				candidates,
				issues,
			);
		}
		sourceHealth.push(healthRow(source, issues));
	}

	return { candidates, sourceHealth };
}

/**
 * Scan a skills directory following Pi's discovery rules:
 * - Direct .md children at root level (flat skills)
 * - Recursive SKILL.md under subdirectories (directory skills)
 *
 * The `isRoot` flag distinguishes the top-level skills dir (where flat
 * .md files are valid) from nested dirs (where only SKILL.md matters).
 */
// fallow-ignore-next-line complexity
async function scanForSkills(
	dirPath: string,
	domain: string,
	results: DiscoveredSkill[],
	options: { readonly allowedSkill?: (name: string) => boolean } = {},
	isRoot = true,
): Promise<void> {
	const entries = await readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		// Flat .md files at the root level (e.g. skills/foo.md)
		if (isRoot && entry.isFile() && entry.name.endsWith(".md")) {
			const baseName = entry.name.slice(0, -3);
			if (!options.allowedSkill?.(baseName) && options.allowedSkill) continue;
			const skill = await loadFlatSkillMeta(
				join(dirPath, entry.name),
				baseName,
				domain,
			);
			if (skill && (options.allowedSkill?.(skill.name) ?? true)) {
				results.push(skill);
			}
			continue;
		}

		if (!entry.isDirectory()) continue;

		const childDir = join(dirPath, entry.name);
		const skill = await loadSkillMeta(childDir, entry.name, domain);
		if (skill) {
			if (options.allowedSkill?.(skill.name) ?? true) {
				results.push(skill);
			}
		} else {
			// No SKILL.md here — recurse deeper
			await scanForSkills(childDir, domain, results, options, false);
		}
	}
}

/**
 * Load skill metadata from a flat .md file (e.g. skills/foo.md).
 * Returns null if the file cannot be read.
 */
async function loadFlatSkillMeta(
	filePath: string,
	baseName: string,
	domain: string,
): Promise<DiscoveredSkill | null> {
	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch {
		return null;
	}

	try {
		const { data } = matter(content);
		return {
			name: typeof data.name === "string" ? data.name : baseName,
			description: typeof data.description === "string" ? data.description : "",
			domain,
			dirPath: filePath,
		};
	} catch {
		return null;
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

	try {
		const { data } = matter(content);
		return {
			name: typeof data.name === "string" ? data.name : dirName,
			description: typeof data.description === "string" ? data.description : "",
			domain,
			dirPath,
		};
	} catch {
		return null;
	}
}

async function strictSourceRootExists(
	source: StrictSkillSource,
	issues: SourceHealthIssue[],
): Promise<boolean> {
	try {
		const rootStat = await stat(source.sourceRoot);
		if (rootStat.isDirectory()) return true;
		issues.push({
			kind: "availability",
			path: source.sourceRoot,
			message: "Declared skill source root is not a directory.",
		});
	} catch (error) {
		issues.push(issueFromError("availability", source.sourceRoot, error));
	}
	return false;
}

async function strictSkillsDirectoryState(
	source: StrictSkillSource,
	issues: SourceHealthIssue[],
): Promise<"directory" | "absent" | "failed"> {
	try {
		const skillsStat = await stat(source.skillsDir);
		if (skillsStat.isDirectory()) return "directory";
		issues.push({
			kind: "availability",
			path: source.skillsDir,
			message: "Declared skills path is not a directory.",
		});
		return "failed";
	} catch (error) {
		if (
			errorCode(error) === "ENOENT" &&
			source.skillsDir !== source.sourceRoot
		) {
			return "absent";
		}
		issues.push(issueFromError("availability", source.skillsDir, error));
		return "failed";
	}
}

// fallow-ignore-next-line complexity
async function scanForSkillCandidatesStrict(
	dirPath: string,
	source: StrictSkillSource,
	results: SkillCandidate[],
	issues: SourceHealthIssue[],
	isRoot = true,
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(dirPath, { withFileTypes: true });
	} catch (error) {
		issues.push(issueFromError("io", dirPath, error));
		return;
	}

	for (const entry of entries) {
		const entryPath = join(dirPath, entry.name);
		if (isRoot && entry.isFile() && entry.name.endsWith(".md")) {
			const baseName = entry.name.slice(0, -3);
			const candidate = await loadStrictCandidate({
				filePath: entryPath,
				dirPath: entryPath,
				fallbackName: baseName,
				logicalPath: baseName,
				targetShape: "flat-wrapper",
				source,
				issues,
			});
			if (candidate && (source.allowedSkill?.(candidate.name) ?? true)) {
				results.push(candidate);
			}
			continue;
		}

		if (!entry.isDirectory()) continue;
		const skillFile = join(entryPath, "SKILL.md");
		let hasSkillFile = false;
		try {
			await lstat(skillFile);
			hasSkillFile = true;
		} catch (error) {
			if (errorCode(error) !== "ENOENT") {
				issues.push(issueFromError("io", skillFile, error));
				continue;
			}
		}

		if (!hasSkillFile) {
			await scanForSkillCandidatesStrict(
				entryPath,
				source,
				results,
				issues,
				false,
			);
			continue;
		}

		const logicalPath = portableRelative(source.skillsDir, entryPath);
		const candidate = await loadStrictCandidate({
			filePath: skillFile,
			dirPath: entryPath,
			fallbackName: entry.name,
			logicalPath,
			targetShape: "directory",
			source,
			issues,
		});
		if (candidate && (source.allowedSkill?.(candidate.name) ?? true)) {
			results.push(candidate);
		}
	}
}

async function loadStrictCandidate(options: {
	readonly filePath: string;
	readonly dirPath: string;
	readonly fallbackName: string;
	readonly logicalPath: string;
	readonly targetShape: SkillCandidate["targetShape"];
	readonly source: StrictSkillSource;
	readonly issues: SourceHealthIssue[];
}): Promise<SkillCandidate | undefined> {
	let content: string;
	try {
		content = await readFile(options.filePath, "utf-8");
	} catch (error) {
		options.issues.push(issueFromError("read", options.filePath, error));
		return undefined;
	}

	let data: Record<string, unknown>;
	try {
		data = matter(content).data;
	} catch (error) {
		options.issues.push(issueFromError("parse", options.filePath, error));
		return undefined;
	}

	const name = typeof data.name === "string" ? data.name : options.fallbackName;
	return {
		name,
		description: typeof data.description === "string" ? data.description : "",
		domain: options.source.domain,
		dirPath: options.dirPath,
		sourceRootId: options.source.sourceRootId,
		sourceRoot: options.source.sourceRoot,
		sourcePath: portableRelative(options.source.sourceRoot, options.dirPath),
		logicalPath: options.logicalPath,
		outputIdentity: name,
		flatteningRule: "frontmatter-name",
		targetShape: options.targetShape,
	};
}

function healthRow(
	source: StrictSkillSource,
	issues: readonly SourceHealthIssue[],
): SourceHealthRow {
	return {
		sourceRootId: source.sourceRootId,
		sourceRoot: source.sourceRoot,
		domain: source.domain,
		status: issues.length === 0 ? "complete" : "incomplete",
		issues,
	};
}

function issueFromError(
	fallbackKind: SourceHealthIssueKind,
	path: string,
	error: unknown,
): SourceHealthIssue {
	const code = errorCode(error);
	const kind =
		code === "EACCES" || code === "EPERM"
			? "permission"
			: fallbackKind === "read" && code !== "ENOENT"
				? "io"
				: fallbackKind;
	return {
		kind,
		path,
		message: error instanceof Error ? error.message : String(error),
		...(code ? { code } : {}),
	};
}

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return undefined;
	}
	return typeof error.code === "string" ? error.code : undefined;
}

function portableRelative(from: string, to: string): string {
	return relative(from, to).split(sep).join("/");
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
