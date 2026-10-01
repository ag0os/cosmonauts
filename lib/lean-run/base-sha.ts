import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Relative to the worktree's own git dir, so each linked worktree has its own. */
const MARKER_PATH = join("lean-run", "base-sha");

interface WorktreeOptions {
	readonly worktree: string;
}

interface WriteRunBaseShaOptions extends WorktreeOptions {
	readonly baseSha: string;
}

/**
 * Records the run's base commit for every session working in `worktree`.
 * The runner writes it before spawning a builder and clears it when the run
 * ends; the post-edit health hook reads it on each check.
 */
export async function writeRunBaseSha(
	options: WriteRunBaseShaOptions,
): Promise<void> {
	const marker = await markerPath(options.worktree);
	await mkdir(dirname(marker), { recursive: true });
	await writeFile(marker, `${options.baseSha.trim()}\n`);
}

/** Undefined when no run is active in `worktree` or it is not a git worktree. */
export async function readRunBaseSha(
	options: WorktreeOptions,
): Promise<string | undefined> {
	const marker = await markerPath(options.worktree).catch(() => undefined);
	if (marker === undefined) return undefined;
	try {
		const firstLine = (await readFile(marker, "utf8")).split("\n")[0]?.trim();
		return firstLine || undefined;
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

export async function clearRunBaseSha(options: WorktreeOptions): Promise<void> {
	await rm(await markerPath(options.worktree), { force: true });
}

async function markerPath(worktree: string): Promise<string> {
	const { stdout } = await execFileAsync("git", ["rev-parse", "--git-dir"], {
		cwd: worktree,
		encoding: "utf8",
	});
	return join(resolve(worktree, stdout.trim()), MARKER_PATH);
}

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
