import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	utimes,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { ARCHITECTURE_MAP_OUTPUT_DIR } from "./types.ts";

export interface ArchitectureMapBundleFile {
	/** Path relative to memory/architecture. */
	readonly path: string;
	readonly content: string;
}

export type StoreArchitectureMapBundleResult =
	| { readonly kind: "written"; readonly changedFiles: readonly string[] }
	| { readonly kind: "unchanged" };

interface ExistingGeneratedFile {
	readonly content: string;
	readonly atime: Date;
	readonly mtime: Date;
}

export async function hasArchitectureMap(
	projectRoot: string,
): Promise<boolean> {
	try {
		const indexStat = await stat(
			join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR, "index.md"),
		);
		return indexStat.isFile();
	} catch (error: unknown) {
		if (isNotFoundError(error)) return false;
		throw error;
	}
}

export async function recoverArchitectureMapStorage(
	projectRoot: string,
): Promise<void> {
	const paths = architectureStoragePaths(projectRoot);
	const backupExists = await pathExists(paths.backupDir);
	if (backupExists) {
		if (!(await hasArchitectureMap(projectRoot))) {
			await rm(paths.targetDir, { recursive: true, force: true });
			await mkdir(paths.memoryDir, { recursive: true });
			await rename(paths.backupDir, paths.targetDir);
		} else {
			await rm(paths.backupDir, { recursive: true, force: true });
		}
	}

	await rm(paths.tempDir, { recursive: true, force: true });
}

export async function storeArchitectureMapBundle(options: {
	readonly projectRoot: string;
	readonly files: readonly ArchitectureMapBundleFile[];
}): Promise<StoreArchitectureMapBundleResult> {
	const paths = architectureStoragePaths(options.projectRoot);
	const files = validateBundleFiles(paths.targetDir, options.files);
	const existingFiles = await readExistingGeneratedFiles(paths.targetDir);
	const changedFiles = changedGeneratedFiles(files, existingFiles);

	if (changedFiles.length === 0) {
		return { kind: "unchanged" };
	}

	await writeReplacementTempBundle({
		tempDir: paths.tempDir,
		targetDir: paths.targetDir,
		files,
		existingFiles,
	});
	try {
		await validateTempBundle(paths.tempDir, files);
		await rm(paths.backupDir, { recursive: true, force: true });
		await mkdir(paths.memoryDir, { recursive: true });

		const hadTarget = await pathExists(paths.targetDir);
		if (hadTarget) {
			await rename(paths.targetDir, paths.backupDir);
		}

		try {
			await rename(paths.tempDir, paths.targetDir);
		} catch (error) {
			if (hadTarget) {
				await rm(paths.targetDir, { recursive: true, force: true });
				await rename(paths.backupDir, paths.targetDir);
			}
			throw error;
		}

		await rm(paths.backupDir, { recursive: true, force: true });
		return { kind: "written", changedFiles };
	} catch (error) {
		await rm(paths.tempDir, { recursive: true, force: true });
		throw error;
	}
}

function architectureStoragePaths(projectRoot: string): {
	readonly memoryDir: string;
	readonly targetDir: string;
	readonly tempDir: string;
	readonly backupDir: string;
} {
	const memoryDir = join(projectRoot, "memory");
	return {
		memoryDir,
		targetDir: join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR),
		tempDir: join(memoryDir, ".architecture.tmp"),
		backupDir: join(memoryDir, ".architecture.bak"),
	};
}

function validateBundleFiles(
	targetDir: string,
	files: readonly ArchitectureMapBundleFile[],
): readonly ArchitectureMapBundleFile[] {
	if (!files.some((file) => file.path === "index.md")) {
		throw new Error("Architecture map bundle is missing index.md.");
	}

	const seen = new Set<string>();
	const validated: ArchitectureMapBundleFile[] = [];
	for (const file of files) {
		validateBundlePath(targetDir, file.path);
		if (seen.has(file.path)) {
			throw new Error(`Duplicate architecture map bundle path: ${file.path}`);
		}
		seen.add(file.path);
		validated.push(file);
	}

	return validated.sort((left, right) => left.path.localeCompare(right.path));
}

function validateBundlePath(targetDir: string, path: string): void {
	if (
		path.length === 0 ||
		path.includes("\\") ||
		path.startsWith("/") ||
		path === "." ||
		path.split("/").includes("..") ||
		posix.normalize(path) !== path
	) {
		throw new Error(`Unsafe architecture map bundle path: ${path}`);
	}

	const absolute = resolve(targetDir, ...path.split("/"));
	const rel = relative(targetDir, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`Unsafe architecture map bundle path: ${path}`);
	}
}

async function readExistingGeneratedFiles(
	targetDir: string,
): Promise<ReadonlyMap<string, ExistingGeneratedFile>> {
	if (!(await pathExists(targetDir))) return new Map();
	const files = new Map<string, ExistingGeneratedFile>();
	await collectExistingFiles(targetDir, targetDir, files);
	return files;
}

async function collectExistingFiles(
	rootDir: string,
	dir: string,
	files: Map<string, ExistingGeneratedFile>,
): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const absolute = join(dir, entry.name);
		if (entry.isDirectory()) {
			await collectExistingFiles(rootDir, absolute, files);
			continue;
		}
		if (!entry.isFile()) continue;
		const rel = relative(rootDir, absolute)
			.split(/[\\/]+/u)
			.join("/");
		const [fileStat, content] = await Promise.all([
			stat(absolute),
			readFile(absolute, "utf-8"),
		]);
		files.set(rel, {
			content,
			atime: fileStat.atime,
			mtime: fileStat.mtime,
		});
	}
}

function changedGeneratedFiles(
	files: readonly ArchitectureMapBundleFile[],
	existingFiles: ReadonlyMap<string, ExistingGeneratedFile>,
): readonly string[] {
	const changed = new Set<string>();
	const expectedPaths = new Set(files.map((file) => file.path));
	for (const file of files) {
		if (existingFiles.get(file.path)?.content !== file.content) {
			changed.add(toProjectMapPath(file.path));
		}
	}
	for (const existingPath of existingFiles.keys()) {
		if (!expectedPaths.has(existingPath)) {
			changed.add(toProjectMapPath(existingPath));
		}
	}
	return [...changed].sort();
}

async function writeReplacementTempBundle(options: {
	readonly tempDir: string;
	readonly targetDir: string;
	readonly files: readonly ArchitectureMapBundleFile[];
	readonly existingFiles: ReadonlyMap<string, ExistingGeneratedFile>;
}): Promise<void> {
	await rm(options.tempDir, { recursive: true, force: true });
	await mkdir(options.tempDir, { recursive: true });
	for (const file of options.files) {
		const absolute = join(options.tempDir, ...file.path.split("/"));
		await mkdir(dirname(absolute), { recursive: true });
		const existing = options.existingFiles.get(file.path);
		if (existing?.content === file.content) {
			await copyFile(
				join(options.targetDir, ...file.path.split("/")),
				absolute,
			);
			await utimes(absolute, existing.atime, existing.mtime);
			continue;
		}
		await writeFile(absolute, file.content, "utf-8");
	}
}

async function validateTempBundle(
	tempDir: string,
	files: readonly ArchitectureMapBundleFile[],
): Promise<void> {
	for (const file of files) {
		const fileStat = await stat(join(tempDir, ...file.path.split("/")));
		if (!fileStat.isFile()) {
			throw new Error(`Missing architecture map bundle file: ${file.path}`);
		}
	}
	const indexStat = await stat(join(tempDir, "index.md"));
	if (!indexStat.isFile()) {
		throw new Error("Architecture map bundle is missing index.md.");
	}
}

function toProjectMapPath(path: string): string {
	return `${ARCHITECTURE_MAP_OUTPUT_DIR}/${path}`;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error: unknown) {
		if (isNotFoundError(error)) return false;
		throw error;
	}
}

function isNotFoundError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
