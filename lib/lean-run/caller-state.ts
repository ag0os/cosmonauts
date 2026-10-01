import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { type RefState, readRefState } from "./git.ts";

const execFileAsync = promisify(execFile);

/**
 * What the builder's patch is applied against, read when the builder clone
 * opens. The clone shares no refs with the caller, but the caller can still
 * commit, switch, branch or stash in its own checkout during a run, a
 * builder that names the caller's repository by path can push to it, and
 * the linked `node_modules` are writable from the clone.
 */
export interface CallerState {
	refs: RefState;
	/** Each of the caller's branches and tags, by full ref name, with the object it names. */
	branchesAndTags: ReadonlyMap<string, string>;
	/** Each linked `node_modules` in the caller's tree, with its top-level entries. */
	dependencies: ReadonlyMap<string, ReadonlySet<string>>;
}

interface CallerStateOptions {
	projectRoot: string;
	/** The caller's `node_modules` directories linked into the builder clone. */
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
		branchesAndTags: await readBranchesAndTags(options.projectRoot),
		dependencies,
	};
}

/**
 * What moved since `before`, if anything: the caller's branch, the commit
 * its HEAD names, the stash, a branch or tag added, deleted or moved, or a
 * linked `node_modules` that is gone or has lost entries. Entries a builder
 * adds (a `.vite` cache) are not a change.
 */
export async function callerStateChange(
	before: CallerState,
	projectRoot: string,
): Promise<string | undefined> {
	const moved =
		refChange(before.refs, await readRefState({ cwd: projectRoot })) ??
		branchOrTagChange(
			before.branchesAndTags,
			await readBranchesAndTags(projectRoot),
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

async function readBranchesAndTags(cwd: string): Promise<Map<string, string>> {
	const { stdout } = await execFileAsync(
		"git",
		[
			"for-each-ref",
			"--format=%(objectname) %(refname)",
			"refs/heads",
			"refs/tags",
		],
		{ cwd, maxBuffer: 64 * 1024 * 1024 },
	);
	const refs = new Map<string, string>();
	for (const line of stdout.split("\n").filter(Boolean)) {
		const space = line.indexOf(" ");
		refs.set(line.slice(space + 1), line.slice(0, space));
	}
	return refs;
}

/** Every branch or tag added, deleted or moved, by name; undefined when none. */
function branchOrTagChange(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>,
): string | undefined {
	const changes: string[] = [];
	for (const [ref, object] of after) {
		const was = before.get(ref);
		if (was === undefined) changes.push(`${ref} added`);
		else if (was !== object) changes.push(`${ref} moved`);
	}
	for (const ref of before.keys())
		if (!after.has(ref)) changes.push(`${ref} deleted`);
	if (changes.length === 0) return undefined;
	const named = changes.slice(0, 3).join(", ");
	return `the caller's branches or tags changed (${named}${changes.length > 3 ? ", …" : ""})`;
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
