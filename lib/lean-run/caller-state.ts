import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { type RefState, readRefState } from "./git.ts";
import type { CallerRefDrift } from "./types.ts";

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
	/**
	 * Every object that a ref of any namespace, HEAD, the stash or a reflog
	 * entry of the caller named: what the caller already had, together with
	 * everything those reach.
	 */
	known: ReadonlySet<string>;
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
	const cwd = options.projectRoot;
	const refs = await readRefState({ cwd });
	return {
		refs,
		branchesAndTags: await readBranchesAndTags(cwd),
		known: await readKnownObjects(cwd, refs),
		dependencies,
	};
}

interface CallerCheckOptions {
	projectRoot: string;
	/** Any directory of the builder clone. */
	clone: string;
}

export interface CallerCheck {
	/** Why the builder's patch cannot go to the caller; undefined when it can. */
	breach?: string;
	/** Every branch or tag added, deleted or moved since the state was read. */
	drift: CallerRefDrift[];
	/** What moved that is reported, not blocked; set only when something did. */
	warnings?: string[];
}

/**
 * What moved since `before`. A breach is: the caller's branch or the commit
 * its HEAD names moved; a branch or tag now names an object the builder
 * made; or a linked `node_modules` is gone or lost entries. Any other
 * branch or tag drift (a sibling worktree's commit, a fetched tag, a
 * deleted ref, a ref moved to an object the caller already had) is only
 * reported in `drift`. A moved stash is only a warning: `refs/stash` is
 * shared by every worktree of the repository, and a patch whose context a
 * stash took away does not apply anyway. Entries a builder adds to
 * `node_modules` (a `.vite` cache) are not a change.
 */
export async function checkCallerState(
	before: CallerState,
	options: CallerCheckOptions,
): Promise<CallerCheck> {
	const { projectRoot } = options;
	const after = await readRefState({ cwd: projectRoot });
	const moved = refChange(before.refs, after);
	const stash = stashChange(before.refs, after);
	const changes = diffRefs(
		before.branchesAndTags,
		await readBranchesAndTags(projectRoot),
	);
	const drift = await classifyDrift(before, changes, options);
	const breach =
		moved ?? builderRefChange(drift) ?? (await dependenciesChange(before));
	return {
		...(breach ? { breach } : {}),
		drift,
		...(stash ? { warnings: [stash] } : {}),
	};
}

function refChange(before: RefState, after: RefState): string | undefined {
	if (before.branch !== after.branch)
		return `the caller's HEAD moved from ${before.branch ?? "a detached HEAD"} to ${after.branch ?? "a detached HEAD"}`;
	if (before.head !== after.head)
		return `the caller's ${before.branch ?? "HEAD"} moved from ${before.head ?? "no commit"} to ${after.head ?? "no commit"}`;
	return undefined;
}

function stashChange(before: RefState, after: RefState): string | undefined {
	if (before.stash === after.stash) return undefined;
	return `the caller's refs/stash moved from ${before.stash ?? "no stash"} to ${after.stash ?? "no stash"} during the run (reported, not blocked: every worktree of the repository shares it)`;
}

async function readBranchesAndTags(cwd: string): Promise<Map<string, string>> {
	const stdout = await git(
		[
			"for-each-ref",
			"--format=%(objectname) %(refname)",
			"refs/heads",
			"refs/tags",
		],
		{ cwd },
	);
	const refs = new Map<string, string>();
	for (const line of stdout.split("\n").filter(Boolean)) {
		const space = line.indexOf(" ");
		refs.set(line.slice(space + 1), line.slice(0, space));
	}
	return refs;
}

/** The object of every ref, of HEAD and the stash, and of every reflog entry in any worktree. */
async function readKnownObjects(
	cwd: string,
	refs: RefState,
): Promise<Set<string>> {
	const [targets, reflogs] = await Promise.all([
		git(["for-each-ref", "--format=%(objectname)"], { cwd }),
		// `--all` keeps the revision list non-empty when no reflog exists.
		git(["rev-list", "--no-walk", "--all", "--reflog"], { cwd }),
	]);
	const known = new Set(`${targets}\n${reflogs}`.split("\n").filter(Boolean));
	for (const object of [refs.head, refs.stash]) if (object) known.add(object);
	return known;
}

type RefChange = Omit<CallerRefDrift, "action">;

/** Added and moved refs in ref order, then deleted ones. */
function diffRefs(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>,
): RefChange[] {
	const changes: RefChange[] = [];
	for (const [ref, object] of after) {
		const was = before.get(ref);
		if (was === undefined) changes.push({ ref, after: object });
		else if (was !== object) changes.push({ ref, before: was, after: object });
	}
	for (const [ref, was] of before)
		if (!after.has(ref)) changes.push({ ref, before: was });
	return changes;
}

/**
 * A ref is `blocked` only when it now names an object that is in the
 * builder clone and that nothing the caller had reaches: the builder made
 * it and pushed it in. What the caller made or fetched during the run is
 * not in the clone; what it already had is reached from `before.known`.
 */
async function classifyDrift(
	before: CallerState,
	changes: readonly RefChange[],
	options: CallerCheckOptions,
): Promise<CallerRefDrift[]> {
	const candidates = new Set<string>();
	for (const { after } of changes)
		if (after !== undefined && !before.known.has(after)) candidates.add(after);
	const made = await builderObjects([...candidates], before.known, options);
	return changes.map((change) => ({
		...change,
		action:
			change.after !== undefined && made.has(change.after)
				? "blocked"
				: "warned",
	}));
}

async function builderObjects(
	candidates: readonly string[],
	known: ReadonlySet<string>,
	options: CallerCheckOptions,
): Promise<Set<string>> {
	const made = new Set<string>();
	if (candidates.length === 0) return made;
	for (const object of await presentObjects(candidates, options.clone))
		if (!(await reachedFrom(object, known, options.projectRoot)))
			made.add(object);
	return made;
}

/** Those of `objects` that exist in the repository at `cwd`. */
async function presentObjects(
	objects: readonly string[],
	cwd: string,
): Promise<string[]> {
	const stdout = await git(["cat-file", "--batch-check=%(objectname)"], {
		cwd,
		input: `${objects.join("\n")}\n`,
	});
	return stdout
		.split("\n")
		.filter((line) => line !== "" && !line.endsWith(" missing"));
}

/** Whether `object` is in `known` or reachable from one of them, in the repository at `cwd`. */
async function reachedFrom(
	object: string,
	known: ReadonlySet<string>,
	cwd: string,
): Promise<boolean> {
	const roots = [...known].map((root) => `^${root}`);
	const stdout = await git(
		["rev-list", "--objects", "--ignore-missing", "--stdin", "-n", "1"],
		{ cwd, input: `${[object, ...roots].join("\n")}\n` },
	);
	return stdout.trim() === "";
}

/** The refs the builder's objects reached, with the commands that restore them; undefined when none. */
function builderRefChange(
	drift: readonly CallerRefDrift[],
): string | undefined {
	const blocked = drift.filter((change) => change.action === "blocked");
	if (blocked.length === 0) return undefined;
	const shown = blocked.slice(0, 3);
	const more = blocked.length > 3 ? ", … (all in callerRefDrift)" : "";
	return `the builder's objects reached the caller's branches or tags (${shown.map(describeDrift).join(", ")}${more}), which stay as they are; restore with: ${shown.map(restoreCommand).join("; ")}`;
}

export function describeDrift(change: RefChange): string {
	if (change.before === undefined)
		return `${change.ref} added at ${change.after}`;
	if (change.after === undefined)
		return `${change.ref} deleted (was ${change.before})`;
	return `${change.ref} moved from ${change.before} to ${change.after}`;
}

/** The command that puts `change.ref` back as it was when the state was read. */
export function restoreCommand(change: RefChange): string {
	return change.before === undefined
		? `git update-ref -d ${change.ref}`
		: `git update-ref ${change.ref} ${change.before}`;
}

async function dependenciesChange(
	before: CallerState,
): Promise<string | undefined> {
	for (const [path, entries] of before.dependencies) {
		const lost = await dependencyChange(path, entries);
		if (lost) return lost;
	}
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

/** `git` in `cwd` with `input` on stdin; resolves to its stdout. */
function git(
	args: readonly string[],
	options: { cwd: string; input?: string },
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = execFile(
			"git",
			[...args],
			{ cwd: options.cwd, maxBuffer: 64 * 1024 * 1024 },
			(error, stdout) => (error ? reject(error) : resolve(stdout)),
		);
		// git's exit status reports a failure; an early exit only breaks the pipe.
		child.stdin?.on("error", () => {});
		child.stdin?.end(options.input);
	});
}
