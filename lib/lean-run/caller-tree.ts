import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeWorktreeTree } from "../driver/runtime-helpers.ts";
import { readPrefix, readTopLevel } from "./git.ts";
import type { CallerTreeChange } from "./types.ts";

const execFileAsync = promisify(execFile);

/** The most changed paths `run.json` and the reason list. */
const MAX_LISTED = 20;

/** Relative to the project directory, like the snapshot's session excludes. */
const SESSION_DIRS = ["missions/sessions/", "missions/archive/sessions/"];

/** The caller's working tree as it was before a builder stage. */
export interface CallerTree {
	/** The changed paths since, relative to the top level; empty when none. */
	changes(): Promise<string[]>;
}

/**
 * Takes the tree of the caller's whole checkout, tracked and untracked
 * files that are not ignored, as Drive's snapshot builds it, through a
 * temporary index and with no ref. The session directories are left out
 * at the top level and under the project directory, so the run's own
 * record never counts. Commands are not tied to the run's signal: the
 * check after a stopped stage still runs, each git call within its bound.
 */
export async function readCallerTree(projectRoot: string): Promise<CallerTree> {
	const top = await readTopLevel({ cwd: projectRoot });
	const prefix = await readPrefix({ cwd: projectRoot });
	const sessions = [...new Set(["", prefix])].flatMap((dir) =>
		SESSION_DIRS.map((session) => `${dir}${session}`),
	);
	const before = await writeWorktreeTree({ projectRoot: top });
	return {
		async changes() {
			const after = await writeWorktreeTree({ projectRoot: top });
			if (after === before) return [];
			const { stdout } = await execFileAsync(
				"git",
				["diff-tree", "-r", "-z", "--name-only", "--no-renames", before, after],
				{ cwd: top, maxBuffer: 64 * 1024 * 1024 },
			);
			return stdout
				.split("\0")
				.filter(Boolean)
				.filter((path) => !sessions.some((dir) => path.startsWith(dir)));
		},
	};
}

export function callerTreeChange(
	stage: string,
	paths: readonly string[],
): CallerTreeChange {
	return { stage, paths: paths.slice(0, MAX_LISTED), count: paths.length };
}

export function callerTreeChangeReason(change: CallerTreeChange): string {
	const more = change.count - change.paths.length;
	const listed = `${change.paths.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
	return `${change.stage}: the caller's working tree changed during the builder stage (paths: ${listed}): the builder wrote outside its clone, or your tree changed during the run, your own edits included; nothing was applied, and the changed files were left as they are`;
}
