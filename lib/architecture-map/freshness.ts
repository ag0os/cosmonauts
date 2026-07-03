import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { canonicalizeArchitectureMapConfig } from "./config.ts";
import type {
	ArchitectureMapConfig,
	ArchitectureMapFreshness,
	ProjectSnapshot,
	SourceAnalyzer,
	SourceFileSnapshot,
	StatFingerprint,
	StatFingerprintFile,
} from "./types.ts";

export interface ProjectSnapshotOptions {
	readonly projectRoot: string;
	readonly config: ArchitectureMapConfig;
	readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
}

export interface ArchitectureMapFreshnessOptions
	extends ProjectSnapshotOptions {
	readonly indexPath?: string;
}

export interface ArchitectureMapIndexFrontmatter {
	readonly projectHash?: string;
	readonly statFingerprint?: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const INDEX_PATH = "memory/architecture/index.md";

export async function checkArchitectureMapFreshness(
	options: ArchitectureMapFreshnessOptions,
): Promise<ArchitectureMapFreshness> {
	const frontmatter = await readArchitectureMapIndexFrontmatter(options);
	if (!frontmatter?.projectHash) return { kind: "missing" };

	const snapshot = await createProjectSnapshot(options);
	return compareFreshnessHashes(frontmatter.projectHash, snapshot.hash);
}

export async function checkArchitectureMapStatFreshness(
	options: ArchitectureMapFreshnessOptions,
): Promise<ArchitectureMapFreshness> {
	const frontmatter = await readArchitectureMapIndexFrontmatter(options);
	if (!frontmatter?.statFingerprint) return { kind: "missing" };

	const fingerprint = await computeArchitectureMapStatFingerprint(options);
	return compareFreshnessHashes(frontmatter.statFingerprint, fingerprint.hash);
}

export function compareFreshnessHashes(
	oldHash: string | undefined,
	newHash: string,
): ArchitectureMapFreshness {
	if (!oldHash) return { kind: "missing" };
	if (oldHash === newHash) return { kind: "current", hash: newHash };
	return { kind: "stale", oldHash, newHash };
}

export async function readArchitectureMapIndexFrontmatter(options: {
	readonly projectRoot: string;
	readonly indexPath?: string;
}): Promise<ArchitectureMapIndexFrontmatter | undefined> {
	const indexPath = options.indexPath ?? join(options.projectRoot, INDEX_PATH);
	let raw: string;
	try {
		raw = await readFile(indexPath, "utf-8");
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return undefined;
		}
		throw error;
	}

	const parsed = matter(raw);
	const data = parsed.data as Record<string, unknown>;
	return {
		projectHash:
			typeof data.projectHash === "string" ? data.projectHash : undefined,
		statFingerprint:
			typeof data.statFingerprint === "string"
				? data.statFingerprint
				: undefined,
	};
}

export async function createProjectSnapshot(
	options: ProjectSnapshotOptions,
): Promise<ProjectSnapshot> {
	const sourceFiles = await collectSourceFileSnapshots(
		options.projectRoot,
		options.config,
	);
	const analyzerConfigFiles = await collectAnalyzerConfigFiles(options);
	const hash = createHash("sha256");

	hash.update("architectureMapConfig\0");
	hash.update(canonicalizeArchitectureMapConfig(options.config));
	hash.update("\0");

	for (const configPath of analyzerConfigFiles) {
		const contents = await readFile(join(options.projectRoot, configPath));
		hash.update("analyzerConfig\0");
		hash.update(configPath);
		hash.update("\0");
		hash.update(sha256(contents));
		hash.update("\0");
	}

	for (const file of sourceFiles) {
		hash.update("source\0");
		hash.update(file.path);
		hash.update("\0");
		hash.update(file.hash);
		hash.update("\0");
	}

	return {
		hash: hash.digest("hex"),
		files: sourceFiles,
		analyzerConfigFiles,
	};
}

export async function computeArchitectureMapStatFingerprint(
	options: ProjectSnapshotOptions,
): Promise<StatFingerprint> {
	const sourceFiles = await collectSourceFileStats(
		options.projectRoot,
		options.config,
	);
	const analyzerConfigFiles = await collectAnalyzerConfigFiles(options);
	const files: StatFingerprintFile[] = [...sourceFiles];

	for (const configPath of analyzerConfigFiles) {
		const configStat = await stat(join(options.projectRoot, configPath));
		files.push({
			path: configPath,
			size: configStat.size,
			mtimeMs: configStat.mtimeMs,
		});
	}

	files.sort((a, b) => a.path.localeCompare(b.path));

	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file.path);
		hash.update("\0");
		hash.update(String(file.size));
		hash.update("\0");
		hash.update(String(file.mtimeMs));
		hash.update("\0");
	}

	return { hash: hash.digest("hex"), files };
}

async function collectSourceFileSnapshots(
	projectRoot: string,
	config: ArchitectureMapConfig,
): Promise<readonly SourceFileSnapshot[]> {
	const paths = await collectSourceFilePaths(projectRoot, config);
	const files: SourceFileSnapshot[] = [];
	for (const path of paths) {
		const absolute = join(projectRoot, path);
		const [fileStat, contents] = await Promise.all([
			stat(absolute),
			readFile(absolute),
		]);
		files.push({
			path,
			size: fileStat.size,
			mtimeMs: fileStat.mtimeMs,
			hash: sha256(contents),
		});
	}
	return files;
}

async function collectSourceFileStats(
	projectRoot: string,
	config: ArchitectureMapConfig,
): Promise<readonly StatFingerprintFile[]> {
	const paths = await collectSourceFilePaths(projectRoot, config);
	const files: StatFingerprintFile[] = [];
	for (const path of paths) {
		const absolute = join(projectRoot, path);
		const fileStat = await stat(absolute);
		files.push({
			path,
			size: fileStat.size,
			mtimeMs: fileStat.mtimeMs,
		});
	}
	return files;
}

async function collectSourceFilePaths(
	projectRoot: string,
	config: ArchitectureMapConfig,
): Promise<readonly string[]> {
	const paths = new Set<string>();
	for (const sourceRoot of config.sourceRoots) {
		const absoluteRoot = resolve(projectRoot, sourceRoot);
		await collectSourceFiles({
			projectRoot,
			root: absoluteRoot,
			exclude: config.exclude,
			paths,
		});
	}
	return [...paths].sort();
}

async function collectSourceFiles(options: {
	readonly projectRoot: string;
	readonly root: string;
	readonly exclude: readonly string[];
	readonly paths: Set<string>;
}): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(options.root, { withFileTypes: true });
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return;
		}
		throw error;
	}

	for (const entry of entries) {
		if (entry.isSymbolicLink()) continue;
		const absolute = join(options.root, entry.name);
		const repoPath = toRepoRelativePath(options.projectRoot, absolute);
		if (isExcluded(repoPath, options.exclude)) continue;

		if (entry.isDirectory()) {
			await collectSourceFiles({
				...options,
				root: absolute,
			});
			continue;
		}

		if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
			options.paths.add(repoPath);
		}
	}
}

async function collectAnalyzerConfigFiles(
	options: ProjectSnapshotOptions,
): Promise<readonly string[]> {
	const rawInputs = await options.analyzer.getConfigInputs(
		options.projectRoot,
		options.config,
	);
	const configFiles = new Set<string>();

	for (const input of rawInputs) {
		const repoPath = normalizeAnalyzerConfigPath(options.projectRoot, input);
		if (!repoPath) continue;
		const absolute = join(options.projectRoot, repoPath);
		try {
			const inputStat = await stat(absolute);
			if (inputStat.isFile()) configFiles.add(repoPath);
		} catch (error: unknown) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				continue;
			}
			throw error;
		}
	}

	return [...configFiles].sort();
}

function normalizeAnalyzerConfigPath(
	projectRoot: string,
	input: string,
): string | undefined {
	const absolute = isAbsolute(input) ? input : resolve(projectRoot, input);
	const rel = relative(projectRoot, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
	if (rel.split(/[\\/]+/u).includes("..")) return undefined;
	return rel.split(/[\\/]+/u).join("/");
}

function toRepoRelativePath(projectRoot: string, absolute: string): string {
	return relative(projectRoot, absolute)
		.split(/[\\/]+/u)
		.join("/");
}

function isExcluded(path: string, exclude: readonly string[]): boolean {
	return exclude.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

function sha256(contents: Buffer | string): string {
	return createHash("sha256").update(contents).digest("hex");
}
