import { lstat, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
	addDetachedWorktree,
	listIgnoredDependencies,
	readPrefix,
	removeWorktree,
} from "./git.ts";

/** A detached temporary checkout of the project's repository. */
export interface TempWorktree {
	/** The checkout's top level. */
	root: string;
	/** The checkout's counterpart of the project root: where sessions and providers run. */
	projectDir: string;
	/** Removes the checkout; resolves to warnings and never throws. */
	dispose(): Promise<string[]>;
}

interface OpenOptions {
	/** Any checkout of the repository; only its worktree metadata changes. */
	projectRoot: string;
	ref: string;
	/** `mkdtemp` prefix under the system temp directory. */
	prefix: string;
	signal?: AbortSignal;
}

/**
 * Adds a detached worktree of `ref` under a fresh temp directory. A failure
 * part-way removes what was made before it throws.
 */
export async function openTempWorktree(
	options: OpenOptions,
): Promise<TempWorktree> {
	const scratch = await mkdtemp(join(tmpdir(), options.prefix));
	const root = join(scratch, "checkout");
	const dispose = () => disposeTempWorktree(options.projectRoot, scratch, root);
	try {
		const prefix = await readPrefix({
			cwd: options.projectRoot,
			signal: options.signal,
		});
		await addDetachedWorktree({
			cwd: options.projectRoot,
			path: root,
			ref: options.ref,
			signal: options.signal,
		});
		return { root, projectDir: join(root, prefix), dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}

async function disposeTempWorktree(
	projectRoot: string,
	scratch: string,
	root: string,
): Promise<string[]> {
	const warnings = await removeWorktree({ cwd: projectRoot, path: root });
	await rm(scratch, { recursive: true, force: true }).catch(
		(error: unknown) => {
			warnings.push(`could not delete ${scratch}: ${errorMessage(error)}`);
		},
	);
	return warnings;
}

/** The builder's checkout and what it shares with the caller's tree. */
export interface BuilderWorktree extends TempWorktree {
	/**
	 * The caller's `node_modules` directories linked into the checkout, as
	 * paths in the caller's tree. A symlink is the only dependency mount
	 * that needs no privileges and no copy: a read-only bind mount needs
	 * root on macOS, and a copy of `node_modules` costs more than a run's
	 * budget allows. So these stay shared: whatever the builder writes or
	 * deletes through a link lands in the caller's `node_modules`.
	 */
	dependencies: string[];
	/** Links that were not made; a missing one fails the checks that need it. */
	warnings: string[];
}

/** A workspace monorepo has one per package; more than this is linked only in part. */
export const MAX_LINKED_DEPENDENCIES = 200;

/**
 * The builder's checkout (brief 3 principle 1: host code before tool
 * permissions): every builder stage runs here, never in the caller's
 * worktree. git commands the builder runs in its own checkout do not touch
 * the caller's index or working tree; refs, stash, config and the linked
 * `node_modules` stay shared. `ref` is the attempt-1 snapshot, or HEAD for
 * a clean tree. The caller's `node_modules` directories are linked in at
 * the same paths, so the builder and the providers can run the project's
 * checks: each one between the top level and the project root, and every
 * ignored one git lists (hoisted and per-package workspace layouts).
 */
export async function openBuilderWorktree(options: {
	projectRoot: string;
	ref: string;
	signal?: AbortSignal;
}): Promise<BuilderWorktree> {
	const worktree = await openTempWorktree({
		...options,
		prefix: "cosmonauts-lean-builder-",
	});
	try {
		const linked = await linkDependencies(options, worktree);
		return { ...worktree, ...linked };
	} catch (error) {
		await worktree.dispose();
		throw error;
	}
}

async function linkDependencies(
	options: { projectRoot: string; signal?: AbortSignal },
	worktree: TempWorktree,
): Promise<Pick<BuilderWorktree, "dependencies" | "warnings">> {
	const { projectRoot } = options;
	const prefix = relative(worktree.root, worktree.projectDir);
	const callerTop = resolve(
		projectRoot,
		relative(worktree.projectDir, worktree.root),
	);
	const listed = await listIgnoredDependencies({
		cwd: projectRoot,
		limit: MAX_LINKED_DEPENDENCIES,
		...(options.signal ? { signal: options.signal } : {}),
	});
	const warnings = listed.truncated
		? [
				`linked only the first ${MAX_LINKED_DEPENDENCIES} ignored node_modules directories`,
			]
		: [];
	const dependencies: string[] = [];
	for (const path of new Set([...pathDependencies(prefix), ...listed.paths])) {
		const target = join(callerTop, path);
		try {
			if (await linkDependency(target, join(worktree.root, path)))
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
 * the checkout already has the path (W2-NOTE: a tracked `node_modules`
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
