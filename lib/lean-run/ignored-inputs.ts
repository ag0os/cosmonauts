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

interface CarryOptions {
	/** The caller's top level. */
	from: string;
	/** The clone's top level. */
	to: string;
	/** `listIgnoredPaths` of the caller: directories end in `/`. */
	listed: readonly string[];
	capBytes: number;
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

/**
 * Copies the caller's ignored paths into the clone at the same paths, so
 * the checks find `.env`, generated code and build outputs there. An entry
 * under a `NEVER_CARRIED` name is skipped, inside a copied directory too.
 * The others are carried smallest first, so one large entry cannot crowd
 * out several small ones; an entry that would take the total past
 * `capBytes` is skipped whole. Results are listed in git's order. A copy
 * cannot reach the caller, so the builder may change it freely. Nothing in
 * the clone is overwritten.
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
	const from = await realpath(options.from);
	const outcomes: Outcome[] = [];
	for (const entry of options.listed)
		outcomes.push(await outcomeFor(from, entry, options.capBytes, result));
	const chosen = chooseSmallestFirst(outcomes, options.capBytes);
	for (const outcome of outcomes) {
		if ("skipped" in outcome) result.skipped.push(outcome.skipped);
		else if (!chosen.has(outcome))
			result.skipped.push({ path: outcome.entry, reason: "over the cap" });
		else {
			result.skipped.push(...outcome.plan.skipped);
			result.carriedBytes += await copyItems(
				{ from, to: options.to },
				outcome.plan.items,
				result,
			);
			result.carried.push(outcome.entry);
		}
	}
	return result;
}

async function outcomeFor(
	from: string,
	entry: string,
	capBytes: number,
	result: CarriedInputs,
): Promise<Outcome> {
	const path = entry.replace(/\/$/u, "");
	const never = neverCarried(path);
	if (never) return { entry, skipped: { path: entry, reason: never } };
	try {
		const plan = await planEntry(from, path, capBytes);
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

function neverCarried(path: string): IgnoredInputSkipReason | undefined {
	return path
		.split("/")
		.find((part): part is IgnoredInputSkipReason =>
			NEVER_CARRIED.has(part as IgnoredInputSkipReason),
		);
}

/** What copying `path` takes; undefined as soon as its files pass `budget` bytes. */
async function planEntry(
	from: string,
	path: string,
	budget: number,
): Promise<EntryPlan | undefined> {
	const plan: EntryPlan = { items: [], bytes: 0, skipped: [] };
	return (await walk(from, path, budget, plan)) ? plan : undefined;
}

async function walk(
	from: string,
	path: string,
	budget: number,
	plan: EntryPlan,
): Promise<boolean> {
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
		return plan.bytes <= budget;
	}
	if (!stats.isDirectory()) {
		plan.skipped.push({ path, reason: "not a file" });
		return true;
	}
	plan.items.push({ kind: "dir", path });
	for (const name of (await readdir(join(from, path))).sort()) {
		const child = `${path}/${name}`;
		if (NEVER_CARRIED.has(name as IgnoredInputSkipReason))
			plan.skipped.push({
				path: `${child}/`,
				reason: name as IgnoredInputSkipReason,
			});
		else if (!(await walk(from, child, budget, plan))) return false;
	}
	return true;
}

/**
 * The target the link at `path` gets in the clone, or undefined when it
 * leads out of the checkout (`from`, a real path). A relative target that
 * stays inside is kept as it is. An absolute one names the caller's file
 * even inside the checkout, so a builder writing through it would write
 * the caller's, so it is rewritten relative to the link and then names the
 * clone's file.
 */
async function linkTargetInClone(
	from: string,
	path: string,
): Promise<string | undefined> {
	const link = join(from, path);
	const target = await readlink(link);
	if (!isAbsolute(target))
		return inside(from, resolve(dirname(link), target)) ? target : undefined;
	const resolved = await realpath(target).catch(() => target);
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

/** Copies `items` in order; returns the bytes copied. A failure is a skip, never a throw. */
async function copyItems(
	options: { from: string; to: string },
	items: readonly Item[],
	result: CarriedInputs,
): Promise<number> {
	let bytes = 0;
	for (const item of items) {
		const source = join(options.from, item.path);
		const target = join(options.to, item.path);
		try {
			await mkdir(dirname(target), { recursive: true });
			if (item.kind === "dir") await mkdir(target, { recursive: true });
			else if (item.kind === "link") await symlink(item.target, target);
			else {
				await copyFile(source, target, constants.COPYFILE_EXCL);
				bytes += item.bytes;
			}
		} catch (error) {
			result.skipped.push(skipFor(item, error, result.warnings));
		}
	}
	return bytes;
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
