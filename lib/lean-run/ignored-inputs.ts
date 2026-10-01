import { constants } from "node:fs";
import {
	copyFile,
	lstat,
	mkdir,
	readdir,
	readlink,
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

/**
 * Copies the caller's ignored paths into the clone at the same paths, so
 * the checks find `.env`, generated code and build outputs there. An entry
 * under a `NEVER_CARRIED` name is skipped, inside a copied directory too; an
 * entry that would take the total past `capBytes` is skipped whole and the
 * next one tried. A copy cannot reach the caller, so the builder may change
 * it freely. Nothing in the clone is overwritten.
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
	for (const entry of options.listed) {
		const path = entry.replace(/\/$/u, "");
		const never = neverCarried(path);
		if (never) {
			result.skipped.push({ path: entry, reason: never });
			continue;
		}
		let plan: EntryPlan | undefined;
		try {
			plan = await planEntry(
				options.from,
				path,
				options.capBytes - result.carriedBytes,
			);
		} catch (error) {
			result.skipped.push(skipFor({ path: entry }, error, result.warnings));
			continue;
		}
		if (!plan) {
			result.skipped.push({ path: entry, reason: "over the cap" });
			continue;
		}
		result.skipped.push(...plan.skipped);
		result.carriedBytes += await copyItems(options, plan.items, result);
		result.carried.push(entry);
	}
	return result;
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
		const target = await readlink(join(from, path));
		if (inside(from, resolve(from, dirname(path), target)))
			plan.items.push({ kind: "link", path, target });
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

/** A link that is absolute or climbs out would let the builder write the caller's files. */
function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
}

/** Copies `items` in order; returns the bytes copied. A failure is a skip, never a throw. */
async function copyItems(
	options: CarryOptions,
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
