import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { ARCHITECTURE_MAP_OUTPUT_DIR } from "../architecture-map/types.ts";
import { snapshotWorktree } from "../driver/runtime-helpers.ts";

const execFileAsync = promisify(execFile);

/**
 * Drive snapshots leave session paths out, so a diff against one must too.
 * The architecture map is the host's: it regenerates it before each
 * provider pass, so those files are never the builder's change.
 */
const DIFF_EXCLUDES = [
	":(exclude)missions/sessions",
	":(exclude)missions/archive/sessions",
	`:(exclude)${ARCHITECTURE_MAP_OUTPUT_DIR}`,
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
	try {
		await copyFile(source, target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	const { atime, mtime } = await stat(source);
	await utimes(target, atime, mtime);
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
