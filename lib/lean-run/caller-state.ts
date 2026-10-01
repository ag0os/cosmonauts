import { readdir, stat } from "node:fs/promises";
import { type RefState, readRefState } from "./git.ts";

/**
 * What the caller's checkout shares with a builder worktree, read at run
 * start: a builder cannot touch the caller's index or files from its own
 * checkout, but it can still move these.
 */
export interface CallerState {
	refs: RefState;
	/** Each linked `node_modules` in the caller's tree, with its top-level entries. */
	dependencies: ReadonlyMap<string, ReadonlySet<string>>;
}

interface CallerStateOptions {
	projectRoot: string;
	/** The caller's `node_modules` directories linked into the builder worktree. */
	dependencies: readonly string[];
}

export async function readCallerState(
	options: CallerStateOptions,
): Promise<CallerState> {
	const dependencies = new Map<string, ReadonlySet<string>>();
	for (const path of options.dependencies) {
		const entries = await readEntries(path);
		if (entries) dependencies.set(path, entries);
	}
	return {
		refs: await readRefState({ cwd: options.projectRoot }),
		dependencies,
	};
}

/**
 * What moved since `before`, if anything: the caller's branch, the commit
 * its HEAD names, the stash, or a linked `node_modules` that is gone or has
 * lost entries. Entries a builder adds (a `.vite` cache) are not a change.
 */
export async function callerStateChange(
	before: CallerState,
	projectRoot: string,
): Promise<string | undefined> {
	const moved = refChange(
		before.refs,
		await readRefState({ cwd: projectRoot }),
	);
	if (moved) return moved;
	for (const [path, entries] of before.dependencies) {
		const lost = await dependencyChange(path, entries);
		if (lost) return lost;
	}
	return undefined;
}

function refChange(before: RefState, after: RefState): string | undefined {
	if (before.branch !== after.branch)
		return `the caller's HEAD moved from ${before.branch ?? "a detached HEAD"} to ${after.branch ?? "a detached HEAD"}`;
	if (before.head !== after.head)
		return `the caller's ${before.branch ?? "HEAD"} moved from ${before.head ?? "no commit"} to ${after.head ?? "no commit"}`;
	if (before.stash !== after.stash)
		return `the caller's refs/stash moved from ${before.stash ?? "no stash"} to ${after.stash ?? "no stash"}`;
	return undefined;
}

async function dependencyChange(
	path: string,
	entries: ReadonlySet<string>,
): Promise<string | undefined> {
	const now = await readEntries(path);
	if (!now) return `the caller's ${path} is no longer a directory`;
	const lost = [...entries].filter((entry) => !now.has(entry));
	if (lost.length === 0) return undefined;
	const named = lost.slice(0, 3).join(", ");
	return `the caller's ${path} lost ${lost.length} of its entries (${named}${lost.length > 3 ? ", …" : ""})`;
}

/** The entries not starting with a dot; undefined when `path` is not a directory. */
async function readEntries(path: string): Promise<Set<string> | undefined> {
	try {
		if (!(await stat(path)).isDirectory()) return undefined;
		const names = await readdir(path);
		return new Set(names.filter((name) => !name.startsWith(".")));
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "ENOENT" || code === "ENOTDIR") return undefined;
		throw error;
	}
}
