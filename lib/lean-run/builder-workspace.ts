import {
	appendFile,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { checkSnapshotLinks, escapingLinksWarning } from "./clone-links.ts";
import {
	clonePrivate,
	listIgnoredDependencies,
	listIgnoredPaths,
	readGitPath,
	readPrefix,
	readTopLevel,
} from "./git.ts";
import { carryIgnoredInputs } from "./ignored-inputs.ts";
import type { BuilderInputs } from "./types.ts";

/**
 * The builder's private clone (brief 3 principle 1, host code before tool
 * permissions; W3c-1): every builder stage and provider pass runs here,
 * never in the caller's checkout. The clone has its own refs, config and
 * objects and no configured remote, so the builder's git commands in it,
 * `push origin` included, cannot reach the caller's repository. There is
 * no filesystem sandbox, though: a push that names a repository by path or
 * URL still lands, and the linked `node_modules` stay shared
 * (`inputs.residuals`).
 */
export interface BuilderWorkspace {
	/** The clone's top level. */
	root: string;
	/** The clone's counterpart of the project root: where sessions and providers run. */
	projectDir: string;
	/** The caller's `node_modules` directories linked into the clone, as caller paths. */
	dependencies: string[];
	inputs: BuilderInputs;
	/** Links not made and ignored inputs not copied for an error; a missing one fails the checks that need it. */
	warnings: string[];
	/** Deletes the clone's temp directory; resolves to warnings and never throws. */
	dispose(): Promise<string[]>;
}

/** A workspace monorepo has one per package; more than this is linked only in part. */
export const MAX_LINKED_DEPENDENCIES = 200;

/**
 * A symlink is the only dependency mount that needs no privileges and no
 * copy: a read-only bind mount needs root on macOS, and a copy of
 * `node_modules` costs more than a run's budget allows.
 */
const LINKED_DEPENDENCY_RESIDUAL =
	"dependency tree writable through the link: the caller's node_modules directories are linked into the builder clone, so what the builder writes or deletes there lands in the caller's";

/** Always present: removing the clone's remotes does not stop a push by path. */
const PUSH_BY_PATH_RESIDUAL =
	"push by path or URL: the clone has no configured remote, but a builder that names a repository by path or URL, the caller's or its remote's, can still push to it; the claude-cli deny list matches only commands that start with `git push`. A push that points a branch or tag of the caller at an object the builder made ends the run blocked; one that deletes a branch or tag of the caller or moves one to an object the caller already had is reported in run.json, not blocked; a push into refs/remotes/*, refs/notes/* or refs/cosmonauts/* of the caller's repository is neither blocked nor reported (the check covers branches and tags); a push to a remote is not detected";

interface OpenOptions {
	projectRoot: string;
	/** The attempt-1 snapshot commit, or HEAD for a clean tree. */
	commit: string;
	/** The snapshot ref, fetched into the clone under its own name. */
	ref?: string;
	/** The most bytes of ignored files copied in. */
	capBytes: number;
	signal?: AbortSignal;
}

/**
 * Clones the caller's repository into a fresh temp directory, detached at
 * `commit`, so uncommitted work the snapshot holds is there as it was.
 * While the clone holds nothing else, it sorts the snapshot's symlinks
 * (`inputs.links`); the caller blocks the run on one into its checkout.
 * Then it adds what the checks read but git does not carry: the caller's
 * gitignored files are copied in at the same paths (`carryIgnoredInputs`)
 * and kept out of the builder's patch by the clone's `info/exclude`, and
 * its `node_modules` directories are linked: each one between the top level
 * and the project root, and every ignored one git lists (hoisted and
 * per-package workspace layouts). A failure part-way deletes the clone
 * before it throws.
 */
export async function openBuilderWorkspace(
	options: OpenOptions,
): Promise<BuilderWorkspace> {
	const scratch = await mkdtemp(join(tmpdir(), "cosmonauts-lean-builder-"));
	const root = join(scratch, "checkout");
	const dispose = () => removeScratch(scratch);
	try {
		const { projectRoot, signal } = options;
		const prefix = await readPrefix({ cwd: projectRoot, signal });
		const source = await readTopLevel({ cwd: projectRoot, signal });
		await clonePrivate({
			source,
			path: root,
			commit: options.commit,
			...(options.ref ? { ref: options.ref } : {}),
			...(signal ? { signal } : {}),
		});
		const links = await checkSnapshotLinks({
			clone: root,
			caller: source,
			...(signal ? { signal } : {}),
		});
		const projectDir = join(root, prefix);
		const listed = await listIgnoredPaths({ cwd: source, signal });
		const linked = await linkDependencies({
			...options,
			root,
			projectDir,
			listed,
		});
		const carried = await carryIgnoredInputs({
			from: source,
			to: root,
			prefix,
			listed,
			capBytes: options.capBytes,
		});
		await excludeInClone({ source, root, carried: carried.carried });
		return {
			root,
			projectDir,
			dependencies: linked.dependencies,
			inputs: {
				linked: linked.dependencies,
				carried: carried.carried,
				carriedBytes: carried.carriedBytes,
				capBytes: options.capBytes,
				skipped: carried.skipped,
				residuals: [
					PUSH_BY_PATH_RESIDUAL,
					...(linked.dependencies.length > 0
						? [LINKED_DEPENDENCY_RESIDUAL]
						: []),
				],
				links,
			},
			warnings: [
				...(links.escaping.length > 0
					? [escapingLinksWarning(links.escaping)]
					: []),
				...linked.warnings,
				...carried.warnings,
			],
			dispose,
		};
	} catch (error) {
		await dispose();
		throw error;
	}
}

async function removeScratch(scratch: string): Promise<string[]> {
	try {
		await rm(scratch, { recursive: true, force: true });
		return [];
	} catch (error) {
		return [`could not delete ${scratch}: ${errorMessage(error)}`];
	}
}

/**
 * The caller's `info/exclude`, then every carried path anchored at the top
 * level, so a copied file stays out of the builder's patch whatever rule
 * ignored it in the caller's tree.
 */
async function excludeInClone(options: {
	source: string;
	root: string;
	carried: readonly string[];
}): Promise<void> {
	const callerExclude = await readGitPath({
		cwd: options.source,
		name: "info/exclude",
	});
	const own = await readFile(callerExclude, "utf8").catch(() => "");
	const path = join(options.root, ".git", "info", "exclude");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, own.endsWith("\n") || own === "" ? own : `${own}\n`);
	if (options.carried.length === 0) return;
	const anchored = options.carried.map(
		(carried) => `/${escapePattern(carried)}`,
	);
	await appendFile(
		path,
		`# gitignored in the caller's tree, copied in by the lean run\n${anchored.join("\n")}\n`,
	);
}

/** A path as a gitignore pattern that matches only itself. */
function escapePattern(path: string): string {
	return path.replace(/[\\*?[\]!# \t]/gu, "\\$&");
}

interface LinkOptions {
	projectRoot: string;
	root: string;
	projectDir: string;
	listed: readonly string[];
}

async function linkDependencies(
	options: LinkOptions,
): Promise<{ dependencies: string[]; warnings: string[] }> {
	const { projectRoot, root, projectDir } = options;
	const prefix = relative(root, projectDir);
	const callerTop = resolve(projectRoot, relative(projectDir, root));
	const ignored = await listIgnoredDependencies({
		cwd: projectRoot,
		limit: MAX_LINKED_DEPENDENCIES,
		listed: options.listed,
	});
	const warnings = ignored.truncated
		? [
				`linked only the first ${MAX_LINKED_DEPENDENCIES} ignored node_modules directories`,
			]
		: [];
	const dependencies: string[] = [];
	for (const path of new Set([...pathDependencies(prefix), ...ignored.paths])) {
		const target = join(callerTop, path);
		try {
			if (await linkDependency(target, join(root, path)))
				dependencies.push(target);
		} catch (error) {
			warnings.push(
				`node_modules not linked at ${path}: ${errorMessage(error)}`,
			);
		}
	}
	return { dependencies, warnings };
}

/** `node_modules` in each directory from the top level down to the project root. */
function pathDependencies(prefix: string): string[] {
	const parts = prefix.split(sep).filter(Boolean);
	return [
		"node_modules",
		...parts.map((_, index) =>
			join(...parts.slice(0, index + 1), "node_modules"),
		),
	];
}

/**
 * Links `link` to the caller's `target`; false when there is no target, or
 * the clone already has the path (W2-NOTE: a tracked `node_modules`
 * symlink), which is left alone.
 */
async function linkDependency(target: string, link: string): Promise<boolean> {
	if (!(await exists(target)) || (await exists(link))) return false;
	await mkdir(dirname(link), { recursive: true });
	try {
		await symlink(target, link, "dir");
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
		throw error;
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
