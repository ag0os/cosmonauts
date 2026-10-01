import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
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

/** The index of `cwd` against `base`, minus session paths and the architecture map. */
export async function readStagedChange(
	options: GitOptions & { base: string },
): Promise<WorktreeChange> {
	const range = ["--cached", options.base, "--", ...DIFF_EXCLUDES];
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
export async function readWorktreeChange(
	options: GitOptions & { base: string },
): Promise<WorktreeChange> {
	const dir = await mkdtemp(join(tmpdir(), "cosmonauts-lean-index-"));
	try {
		const index = join(dir, "index");
		await seedIndex(options, index);
		const env = { ...process.env, GIT_INDEX_FILE: index };
		await git(["add", "-A"], { ...options, env });
		return await readStagedChange({ ...options, env });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Copying the real index keeps its stat cache, so `add -A` rehashes only what changed. */
async function seedIndex(options: GitOptions, target: string): Promise<void> {
	const path = (
		await git(["rev-parse", "--git-path", "index"], options)
	).trim();
	await copyFile(resolve(options.cwd, path), target).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		},
	);
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
