import { lstat, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDetachedWorktree, readPrefix, removeWorktree } from "./git.ts";

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

/**
 * The builder's checkout (brief 3 principle 1: host code before tool
 * permissions): every builder stage runs here, never in the caller's
 * worktree, so no git command a builder runs can reach the caller's index,
 * HEAD or files. `ref` is the attempt-1 snapshot, or HEAD for a clean tree.
 * The project's `node_modules` is linked in when it exists, so the builder
 * and the providers can run the project's checks.
 */
export async function openBuilderWorktree(options: {
	projectRoot: string;
	ref: string;
	signal?: AbortSignal;
}): Promise<TempWorktree> {
	const worktree = await openTempWorktree({
		...options,
		prefix: "cosmonauts-lean-builder-",
	});
	try {
		await linkDependencies(options.projectRoot, worktree.projectDir);
		return worktree;
	} catch (error) {
		await worktree.dispose();
		throw error;
	}
}

/** A path that already exists (W2-NOTE: a tracked `node_modules` symlink) is left alone. */
async function linkDependencies(
	projectRoot: string,
	projectDir: string,
): Promise<void> {
	const dependencies = join(projectRoot, "node_modules");
	if (!(await exists(dependencies))) return;
	const link = join(projectDir, "node_modules");
	if (await exists(link)) return;
	try {
		await symlink(dependencies, link, "dir");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
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
