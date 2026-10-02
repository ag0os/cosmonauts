import { constants } from "node:fs";
import {
	copyFile,
	lstat,
	mkdir,
	readdir,
	readlink,
	realpath,
	symlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IgnoredInputSkipReason, SkippedInput } from "./types.ts";

/** The default most bytes of ignored files copied into a builder clone. */
export const DEFAULT_IGNORED_INPUTS_CAP_BYTES = 50 * 1024 * 1024;

/** Directory names never copied, at any depth; each is its own skip reason. */
const NEVER_CARRIED: ReadonlySet<IgnoredInputSkipReason> = new Set([
	"node_modules",
	".git",
	".stryker-tmp",
]);

/**
 * Earlier runs' transcripts and this run's own `run.json`, relative to the
 * top level and to the project directory: the paths `DIFF_EXCLUDES` in
 * `git.ts` keeps out of diffs.
 */
const SESSION_TRANSCRIPTS = ["missions/sessions", "missions/archive/sessions"];

interface CarryOptions {
	/** The caller's top level. */
	from: string;
	/** The clone's top level. */
	to: string;
	/** The project directory relative to the top level, with a trailing slash; `""` at the top. */
	prefix: string;
	/** `listIgnoredPaths` of the caller: directories end in `/`. */
	listed: readonly string[];
	capBytes: number;
}

/** What planning an entry needs: the caller's real top level, the cap and the transcript directories. */
interface Scope {
	from: string;
	capBytes: number;
	sessions: readonly string[];
}

export interface CarriedInputs {
	carried: string[];
	carriedBytes: number;
	skipped: SkippedInput[];
	warnings: string[];
}

type Item =
	| { kind: "dir"; path: string }
	| { kind: "file"; path: string; bytes: number }
	| { kind: "link"; path: string; target: string };

interface EntryPlan {
	items: Item[];
	bytes: number;
	skipped: SkippedInput[];
}

/** One listed entry: skipped before any copy, or planned and waiting for its turn under the cap. */
type Outcome =
	| { entry: string; skipped: SkippedInput }
	| { entry: string; plan: EntryPlan };

interface Decision {
	outcome: Outcome;
	chosen: boolean;
}

/**
 * Copies the caller's ignored paths into the clone at the same paths, so
 * the checks find `.env`, generated code and build outputs there. An entry
 * under a `NEVER_CARRIED` name or in a session transcript directory is
 * skipped, inside a copied directory too. The others are carried smallest
 * first, so one large entry cannot crowd out several small ones; an entry
 * that would take the total past `capBytes` is skipped whole. Results are
 * listed in git's order, and an entry is `carried` only when its copy
 * created something. A copy cannot reach the caller, so the builder may
 * change it freely. Nothing in the clone is overwritten.
 */
export async function carryIgnoredInputs(
	options: CarryOptions,
): Promise<CarriedInputs> {
	const result: CarriedInputs = {
		carried: [],
		carriedBytes: 0,
		skipped: [],
		warnings: [],
	};
	const scope: Scope = {
		from: await realpath(options.from),
		capBytes: options.capBytes,
		sessions: sessionDirs(options.prefix),
	};
	for (const { outcome, chosen } of await decide(
		scope,
		options.listed,
		result,
	)) {
		if ("skipped" in outcome) result.skipped.push(outcome.skipped);
		else if (!chosen)
			result.skipped.push({ path: outcome.entry, reason: "over the cap" });
		else {
			result.skipped.push(...outcome.plan.skipped);
			const copied = await copyItems(
				{ from: scope.from, to: options.to },
				outcome.plan.items,
				result,
			);
			result.carriedBytes += copied.bytes;
			if (copied.created) result.carried.push(outcome.entry);
		}
	}
	return result;
}

function sessionDirs(prefix: string): string[] {
	return [...new Set(["", prefix])].flatMap((dir) =>
		SESSION_TRANSCRIPTS.map((sessions) => `${dir}${sessions}`),
	);
}

/**
 * Plans the outermost listed entries and chooses among them smallest first
 * under the cap. The listed entries inside one that was not chosen then get
 * their own turn with what is left of the cap, so a small listed child is
 * not lost with a skipped parent; a chosen parent carries its children.
 * Returned in git's order.
 */
async function decide(
	scope: Scope,
	listed: readonly string[],
	result: CarriedInputs,
): Promise<Decision[]> {
	const decided: Decision[] = [];
	let left = scope.capBytes;
	let round = outermost(listed);
	while (round.length > 0) {
		const outcomes: Outcome[] = [];
		for (const entry of round)
			outcomes.push(await outcomeFor(scope, entry, result));
		const chosen = chooseSmallestFirst(outcomes, left);
		for (const outcome of outcomes) {
			if ("plan" in outcome && chosen.has(outcome)) left -= outcome.plan.bytes;
			decided.push({ outcome, chosen: chosen.has(outcome) });
		}
		const passed = outcomes
			.filter((outcome) => !chosen.has(outcome))
			.map((outcome) => outcome.entry);
		round = outermost(listedBelow(listed, passed));
	}
	const order = new Map(listed.map((entry, index) => [entry, index]));
	const position = (decision: Decision) =>
		order.get(decision.outcome.entry) ?? 0;
	return decided.sort((a, b) => position(a) - position(b));
}

/**
 * `listed` without the entries inside another listed directory: git lists
 * an untracked directory that holds only ignored content and its ignored
 * subdirectories both (`missions/` and `missions/sessions/`).
 */
function outermost(listed: readonly string[]): string[] {
	const paths = new Set(listed.map(withoutTrailingSlash));
	return listed.filter(
		(entry) =>
			!ancestors(withoutTrailingSlash(entry)).some((path) => paths.has(path)),
	);
}

/** The entries of `listed` inside one of `parents`. */
function listedBelow(
	listed: readonly string[],
	parents: readonly string[],
): string[] {
	const roots = new Set(parents.map(withoutTrailingSlash));
	return listed.filter((entry) =>
		ancestors(withoutTrailingSlash(entry)).some((path) => roots.has(path)),
	);
}

/** `a/b/c` → `a`, `a/b`. */
function ancestors(path: string): string[] {
	const parts = path.split("/");
	return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function withoutTrailingSlash(entry: string): string {
	return entry.replace(/\/$/u, "");
}

async function outcomeFor(
	scope: Scope,
	entry: string,
	result: CarriedInputs,
): Promise<Outcome> {
	const path = withoutTrailingSlash(entry);
	const never = neverCarried(scope, path);
	if (never) return { entry, skipped: { path: entry, reason: never } };
	try {
		const plan = await planEntry(scope, path);
		if (plan) return { entry, plan };
		return { entry, skipped: { path: entry, reason: "over the cap" } };
	} catch (error) {
		return { entry, skipped: skipFor({ path: entry }, error, result.warnings) };
	}
}

/** The planned entries that fit under `capBytes` when taken smallest first. */
function chooseSmallestFirst(
	outcomes: readonly Outcome[],
	capBytes: number,
): Set<Outcome> {
	const planned = outcomes.filter(
		(outcome): outcome is Extract<Outcome, { plan: EntryPlan }> =>
			"plan" in outcome,
	);
	const chosen = new Set<Outcome>();
	let total = 0;
	for (const outcome of [...planned].sort(
		(a, b) => a.plan.bytes - b.plan.bytes,
	)) {
		if (total + outcome.plan.bytes > capBytes) continue;
		total += outcome.plan.bytes;
		chosen.add(outcome);
	}
	return chosen;
}

function neverCarried(
	scope: Scope,
	path: string,
): IgnoredInputSkipReason | undefined {
	if (
		scope.sessions.some(
			(sessions) => path === sessions || path.startsWith(`${sessions}/`),
		)
	)
		return "session transcripts";
	return path
		.split("/")
		.find((part): part is IgnoredInputSkipReason =>
			NEVER_CARRIED.has(part as IgnoredInputSkipReason),
		);
}

/** What copying `path` takes; undefined as soon as its files pass the cap. */
async function planEntry(
	scope: Scope,
	path: string,
): Promise<EntryPlan | undefined> {
	const plan: EntryPlan = { items: [], bytes: 0, skipped: [] };
	return (await walk(scope, path, plan)) ? plan : undefined;
}

async function walk(
	scope: Scope,
	path: string,
	plan: EntryPlan,
): Promise<boolean> {
	const { from } = scope;
	const stats = await lstat(join(from, path));
	if (stats.isSymbolicLink()) {
		const target = await linkTargetInClone(from, path);
		if (target !== undefined) plan.items.push({ kind: "link", path, target });
		else plan.skipped.push({ path, reason: "symlink outside the checkout" });
		return true;
	}
	if (stats.isFile()) {
		plan.bytes += stats.size;
		plan.items.push({ kind: "file", path, bytes: stats.size });
		return plan.bytes <= scope.capBytes;
	}
	if (!stats.isDirectory()) {
		plan.skipped.push({ path, reason: "not a file" });
		return true;
	}
	plan.items.push({ kind: "dir", path });
	for (const name of (await readdir(join(from, path))).sort()) {
		const child = `${path}/${name}`;
		const never = neverCarried(scope, child);
		if (never) plan.skipped.push({ path: `${child}/`, reason: never });
		else if (!(await walk(scope, child, plan))) return false;
	}
	return true;
}

/**
 * The target the link at `path` gets in the clone, or undefined when it
 * leads out of the checkout (`from`, a real path). A target inside is
 * always rewritten as the shortest path from the link, which never climbs
 * above `from` and so names the clone's file. An absolute target names the
 * caller's file, and so does a relative one whose surplus `..` stop at `/`
 * and climb back down by the caller's absolute path.
 */
async function linkTargetInClone(
	from: string,
	path: string,
): Promise<string | undefined> {
	const link = join(from, path);
	const target = await readlink(link);
	const resolved = isAbsolute(target)
		? await realpath(target).catch(() => target)
		: resolve(dirname(link), target);
	if (!inside(from, resolved)) return undefined;
	return relative(dirname(link), resolved) || ".";
}

function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
}

interface CopyRoots {
	from: string;
	to: string;
}

/** Copies `items` in order: the bytes copied, and whether anything was created. A failure is a skip, never a throw. */
async function copyItems(
	roots: CopyRoots,
	items: readonly Item[],
	result: CarriedInputs,
): Promise<{ bytes: number; created: boolean }> {
	let bytes = 0;
	let created = false;
	for (const item of items) {
		try {
			if (await copyItem(roots, item)) created = true;
			if (item.kind === "file") bytes += item.bytes;
		} catch (error) {
			result.skipped.push(skipFor(item, error, result.warnings));
		}
	}
	return { bytes, created };
}

/** Whether copying `item` created it; a directory already in the clone was not. */
async function copyItem(roots: CopyRoots, item: Item): Promise<boolean> {
	const target = join(roots.to, item.path);
	await mkdir(dirname(target), { recursive: true });
	if (item.kind === "dir")
		return (await mkdir(target, { recursive: true })) !== undefined;
	if (item.kind === "link") await symlink(item.target, target);
	else
		await copyFile(
			join(roots.from, item.path),
			target,
			constants.COPYFILE_EXCL,
		);
	return true;
}

function skipFor(
	item: { path: string },
	error: unknown,
	warnings: string[],
): SkippedInput {
	if ((error as NodeJS.ErrnoException).code === "EEXIST")
		return { path: item.path, reason: "already in the checkout" };
	const message = error instanceof Error ? error.message : String(error);
	warnings.push(`ignored input not carried: ${item.path}: ${message}`);
	return { path: item.path, reason: "copy failed" };
}
