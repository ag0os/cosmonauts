import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { ARCHITECTURE_MAP_OUTPUT_DIR } from "../architecture-map/types.ts";
import { snapshotWorktree } from "../driver/runtime-helpers.ts";

const execFileAsync = promisify(execFile);

/**
 * Drive snapshots leave session paths out, so a diff against one must too.
 * The architecture map is the host's: it regenerates it before each
 * provider pass, so those files are never the builder's change. A builder
 * clone links the caller's `node_modules` directories in at any depth,
 * which a `node_modules/` ignore rule does not cover: git sees a symlink,
 * not a directory. So every `node_modules` in the repository, and anything
 * under one, is left out, measured from the top level whatever the cwd.
 */
const DIFF_EXCLUDES = [
	":(exclude)missions/sessions",
	":(exclude)missions/archive/sessions",
	`:(exclude)${ARCHITECTURE_MAP_OUTPUT_DIR}`,
	":(top,exclude,glob)**/node_modules",
	":(top,exclude,glob)**/node_modules/**",
];

export interface WorktreeChange {
	diff: string;
	changedFiles: string[];
}

interface GitOptions {
	cwd: string;
	signal?: AbortSignal;
	env?: NodeJS.ProcessEnv;
}

async function git(
	args: readonly string[],
	options: GitOptions,
): Promise<string> {
	const { stdout } = await execFileAsync("git", [...args], {
		cwd: options.cwd,
		signal: options.signal,
		maxBuffer: 64 * 1024 * 1024,
		...(options.env ? { env: options.env } : {}),
	});
	return stdout;
}

/**
 * Run-scoped task id shared by the builder's snapshot refs and the Pi spawn's
 * runtime context, so the destructive-git guard names this run's recovery ref.
 */
export function builderTaskId(runId: string): string {
	return `lean-${runId}`;
}

export async function readHeadSha(projectRoot: string): Promise<string> {
	return (await git(["rev-parse", "HEAD"], { cwd: projectRoot })).trim();
}

export async function resolveCommit(
	options: GitOptions & { ref: string },
): Promise<string> {
	return (
		await git(["rev-parse", "--verify", `${options.ref}^{commit}`], options)
	).trim();
}

/**
 * Every read here passes `--no-renames`, whatever the user's `diff.renames`:
 * a rename is the old path deleted and the new one added, so the changed-file
 * list and the per-file classes always name the same paths.
 */
const NO_RENAMES = "--no-renames";

/** The index of `cwd` against `base`, minus session paths and the architecture map. */
export async function readStagedChange(
	options: GitOptions & { base: string },
): Promise<WorktreeChange> {
	const range = [NO_RENAMES, "--cached", options.base, "--", ...DIFF_EXCLUDES];
	const [diff, names] = await Promise.all([
		git(["diff", ...range], options),
		git(["diff", "--name-only", "-z", ...range], options),
	]);
	return { diff, changedFiles: names.split("\0").filter(Boolean) };
}

/**
 * The working tree against `base`, untracked files included, read through a
 * throwaway copy of the index so the real one is untouched.
 */
export function readWorktreeChange(
	options: GitOptions & { base: string },
): Promise<WorktreeChange> {
	return withWorktreeIndex(options, (env) =>
		readStagedChange({ ...options, env }),
	);
}

/**
 * The working tree against `base` as a patch for `git apply`, binary files
 * included and untracked files as new files, read through a throwaway index.
 * Prefixes, colour, external diff drivers and textconv are pinned so user
 * config cannot change the patch.
 */
export function readWorktreePatch(
	options: GitOptions & { base: string },
): Promise<string> {
	return withWorktreeIndex(options, (env) =>
		git(
			[
				"diff",
				"--binary",
				NO_RENAMES,
				"--no-color",
				"--no-ext-diff",
				"--no-textconv",
				"--src-prefix=a/",
				"--dst-prefix=b/",
				"--cached",
				options.base,
				"--",
				...DIFF_EXCLUDES,
			],
			{ ...options, env },
		),
	);
}

/**
 * Applies a patch file to the working tree of `cwd`'s checkout, from its top
 * level. Never `--index`, `--cached` or `--3way`: the index is left as it was.
 * `--whitespace=nowarn` keeps the user's `apply.whitespace` from refusing a
 * patch the host wrote itself.
 */
export async function applyPatch(
	options: GitOptions & { patchPath: string },
): Promise<void> {
	const top = await readTopLevel(options);
	await git(["apply", "--binary", "--whitespace=nowarn", options.patchPath], {
		...options,
		cwd: top,
	});
}

export async function readTopLevel(options: GitOptions): Promise<string> {
	return (await git(["rev-parse", "--show-toplevel"], options)).trim();
}

/** `cwd` relative to its checkout's top level, with a trailing slash; `""` at the top. */
export async function readPrefix(options: GitOptions): Promise<string> {
	return (await git(["rev-parse", "--show-prefix"], options)).trim();
}

/** Host git commands in a checkout a stage works in run none of its hooks. */
const NO_HOOKS = ["-c", "core.hooksPath=/dev/null"] as const;

interface CloneOptions {
	/** Any checkout of the caller's repository. */
	source: string;
	path: string;
	commit: string;
	/** A ref outside `refs/heads` to bring into the clone under its own name. */
	ref?: string;
	signal?: AbortSignal;
}

/**
 * The caller's branches, tags and remote-tracking refs under their own
 * names, so a check that reads `main`, `origin/main` or a tag sees in the
 * clone what it sees in the caller's checkout.
 */
const CALLER_REFSPECS = [
	"+refs/heads/*:refs/heads/*",
	"+refs/tags/*:refs/tags/*",
	"+refs/remotes/*:refs/remotes/*",
] as const;

/**
 * Clones `source` to `path`, detached at `commit`. The clone has its own
 * refs, config and objects (`--no-hardlinks`) and no remote, so nothing
 * done in it reaches `source` and nothing can be pushed from it. A clone
 * copies only branches, so `ref` (the run's snapshot ref) is fetched in
 * under its own name, and `commit` by id when no copied ref reaches it.
 * The caller's refs are fetched last, after the detach, because git
 * refuses to fetch into the branch HEAD is on. Without `--update-shallow`,
 * git drops a shallow caller's refs that reach past the clone's shallow
 * boundary, with only a warning.
 */
export async function clonePrivate(options: CloneOptions): Promise<void> {
	const { source, path, commit, signal } = options;
	await git(
		[
			...NO_HOOKS,
			"clone",
			"--quiet",
			"--no-hardlinks",
			"--no-checkout",
			"--no-tags",
			"--",
			source,
			path,
		],
		{ cwd: dirname(path), signal },
	);
	const inClone = { cwd: path, signal };
	const fetch = (refspec: string) =>
		git(
			[...NO_HOOKS, "fetch", "--quiet", "--no-tags", source, refspec],
			inClone,
		);
	if (options.ref) await fetch(`+${options.ref}:${options.ref}`);
	const present = await readOptional(
		["rev-parse", "-q", "--verify", `${commit}^{commit}`],
		inClone,
	);
	if (!present) await fetch(commit);
	const remotes = (await git(["remote"], inClone)).split("\n").filter(Boolean);
	for (const remote of remotes)
		await git([...NO_HOOKS, "remote", "remove", remote], inClone);
	await git([...NO_HOOKS, "checkout", "--quiet", "--detach", commit], inClone);
	await git(
		[
			...NO_HOOKS,
			"fetch",
			"--quiet",
			"--no-tags",
			"--update-shallow",
			source,
			...CALLER_REFSPECS,
		],
		inClone,
	);
}

/** `<git dir>/<name>` of `cwd`'s checkout as git resolves it: a linked worktree shares `info/exclude`. */
export async function readGitPath(
	options: GitOptions & { name: string },
): Promise<string> {
	const path = (
		await git(["rev-parse", "--git-path", options.name], options)
	).trim();
	return resolve(options.cwd, path);
}

/**
 * Adds a detached worktree of `ref` at `path`. The repository gains only the
 * worktree's metadata; `cwd`'s own index and working tree are not touched,
 * and the repository's hooks (`post-checkout`) do not run.
 */
export async function addDetachedWorktree(
	options: GitOptions & { path: string; ref: string },
): Promise<void> {
	await git(
		[
			...NO_HOOKS,
			"worktree",
			"add",
			"--detach",
			"--quiet",
			options.path,
			options.ref,
		],
		options,
	);
}

/**
 * Removes a worktree added by `addDetachedWorktree`, then prunes stale
 * worktree metadata. Never throws: each failure is returned as a warning,
 * and a worktree git cannot remove has its directory deleted instead. The
 * second `--force` removes a locked worktree too, which `prune` would keep.
 */
export async function removeWorktree(
	options: GitOptions & { path: string },
): Promise<string[]> {
	const warnings: string[] = [];
	try {
		await git(
			["worktree", "remove", "--force", "--force", options.path],
			options,
		);
	} catch (error) {
		warnings.push(
			`could not remove worktree ${options.path}: ${errorMessage(error)}`,
		);
		await rm(options.path, { recursive: true, force: true }).catch(
			(rmError: unknown) => {
				warnings.push(
					`could not delete ${options.path}: ${errorMessage(rmError)}`,
				);
			},
		);
	}
	try {
		await git(["worktree", "prune"], options);
	} catch (error) {
		warnings.push(`git worktree prune failed: ${errorMessage(error)}`);
	}
	return warnings;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** A changed file's `git diff --name-status` letter, read as a diagram class. */
export type FileStatusClass = "added" | "modified" | "removed";

/**
 * The working tree's change against `base` per file, untracked files
 * included: A is `added`, D is `removed`, and M and T are `modified`. A
 * rename is its old path `removed` and its new path `added` (`--no-renames`).
 */
export function readWorktreeStatus(
	options: GitOptions & { base: string },
): Promise<Record<string, FileStatusClass>> {
	return withWorktreeIndex(options, async (env) => {
		const output = await git(
			[
				"diff",
				"--name-status",
				"-z",
				NO_RENAMES,
				"--cached",
				options.base,
				"--",
				...DIFF_EXCLUDES,
			],
			{ ...options, env },
		);
		return parseNameStatus(output);
	});
}

function parseNameStatus(output: string): Record<string, FileStatusClass> {
	const fields = output.split("\0").filter(Boolean);
	const classes: Record<string, FileStatusClass> = {};
	let index = 0;
	while (index < fields.length) {
		const letter = (fields[index] ?? "").charAt(0);
		// Renames and copies name the source path, then the destination.
		const paths = letter === "R" || letter === "C" ? 2 : 1;
		const path = fields[index + paths];
		if (path !== undefined)
			classes[path] = STATUS_CLASSES[letter] ?? "modified";
		index += paths + 1;
	}
	return classes;
}

const STATUS_CLASSES: Readonly<Record<string, FileStatusClass>> = {
	A: "added",
	C: "added",
	D: "removed",
};

/** Runs `read` against a throwaway copy of the index holding the whole working tree. */
async function withWorktreeIndex<T>(
	options: GitOptions,
	read: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "cosmonauts-lean-index-"));
	try {
		const index = join(dir, "index");
		await seedIndex(options, index);
		const env = { ...process.env, GIT_INDEX_FILE: index };
		await git(["add", "-A"], { ...options, env });
		return await read(env);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Copying the real index keeps its stat cache, so `add -A` rehashes only what
 * changed. The copy also keeps the index's mtime: git re-reads an entry whose
 * mtime is not older than the index file (the racily-clean rule), so a fresh
 * mtime would hide a same-size edit made in the same second as the last index
 * write.
 */
async function seedIndex(options: GitOptions, target: string): Promise<void> {
	const path = (
		await git(["rev-parse", "--git-path", "index"], options)
	).trim();
	const source = resolve(options.cwd, path);
	// Stat first: an index rewritten between the two calls then leaves an
	// older mtime on the copy, which only makes git recheck more entries.
	let times: { atime: Date; mtime: Date };
	try {
		times = await stat(source);
		await copyFile(source, target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	await utimes(target, times.atime, times.mtime);
}

/** Whether `ancestor` is `ref` or an ancestor of it; throws when git cannot tell. */
export async function isAncestor(
	options: GitOptions & { ancestor: string; ref: string },
): Promise<boolean> {
	try {
		await git(
			["merge-base", "--is-ancestor", options.ancestor, options.ref],
			options,
		);
		return true;
	} catch (error) {
		if (exitCode(error) === 1) return false;
		throw error;
	}
}

/**
 * What the caller can move in its own checkout while a run works in
 * another: the checked-out branch (undefined when HEAD is detached), the
 * commit HEAD names, and the stash tip (undefined with no stash).
 */
export interface RefState {
	branch?: string;
	head?: string;
	stash?: string;
}

export async function readRefState(options: GitOptions): Promise<RefState> {
	const [branch, head, stash] = await Promise.all([
		readOptional(["symbolic-ref", "-q", "HEAD"], options),
		readOptional(["rev-parse", "-q", "--verify", "HEAD"], options),
		readOptional(["rev-parse", "-q", "--verify", "refs/stash"], options),
	]);
	return {
		...(branch ? { branch } : {}),
		...(head ? { head } : {}),
		...(stash ? { stash } : {}),
	};
}

/** Trimmed stdout, or undefined when git exits 1, which `-q` uses for "not there". */
async function readOptional(
	args: readonly string[],
	options: GitOptions,
): Promise<string | undefined> {
	try {
		return (await git(args, options)).trim() || undefined;
	} catch (error) {
		if (exitCode(error) === 1) return undefined;
		throw error;
	}
}

function exitCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error
		? error.code
		: undefined;
}

/**
 * The ignored paths of `cwd`'s checkout, relative to its top level, in
 * git's order. `--directory` stops at an ignored directory, which is listed
 * once with a trailing slash, so nothing is listed from inside another.
 */
export async function listIgnoredPaths(options: GitOptions): Promise<string[]> {
	const top = await readTopLevel(options);
	const output = await git(
		[
			"ls-files",
			"-z",
			"--others",
			"--ignored",
			"--exclude-standard",
			"--directory",
		],
		{ ...options, cwd: top },
	);
	return output.split("\0").filter(Boolean);
}

/**
 * The ignored `node_modules` directories (or links) among `listed` (by
 * default `listIgnoredPaths`), without the trailing slash, at most `limit`.
 */
export async function listIgnoredDependencies(
	options: GitOptions & { limit: number; listed?: readonly string[] },
): Promise<{ paths: string[]; truncated: boolean }> {
	const listed = options.listed ?? (await listIgnoredPaths(options));
	const paths = listed
		.map((path) => path.replace(/\/$/u, ""))
		.filter((path) => path.split("/").at(-1) === "node_modules");
	return {
		paths: paths.slice(0, options.limit),
		truncated: paths.length > options.limit,
	};
}

/** The merge-base of HEAD and `ref`; undefined when `ref` does not exist or shares no history. */
export async function readMergeBase(
	options: GitOptions & { ref: string },
): Promise<string | undefined> {
	try {
		return (
			(await git(["merge-base", "HEAD", options.ref], options)).trim() ||
			undefined
		);
	} catch {
		return undefined;
	}
}

export function snapshotBeforeBuilder(options: {
	projectRoot: string;
	runId: string;
	attempt: number;
	signal?: AbortSignal;
}): Promise<string | undefined> {
	return snapshotWorktree({
		projectRoot: options.projectRoot,
		runId: options.runId,
		taskId: builderTaskId(options.runId),
		attemptNumber: options.attempt,
		signal: options.signal,
	});
}
