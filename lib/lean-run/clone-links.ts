import { execFile } from "node:child_process";
import { readlink, realpath } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { promisify } from "node:util";
import type { SnapshotLink, SnapshotLinks } from "./types.ts";

const execFileAsync = promisify(execFile);

/** git's mode for a symlink in `ls-files -s`. */
const LINK_MODE = "120000";

/** Bounds the links followed while resolving one dangling chain; a loop stops here. */
const MAX_HOPS = 40;

/** The most links one warning or block reason names. */
const MAX_LISTED = 20;

interface CheckOptions {
	/** The builder clone's top level, checked out at the snapshot commit. */
	clone: string;
	/** Any directory of the caller's checkout. */
	caller: string;
	signal?: AbortSignal;
}

/**
 * Sorts every symlink of the snapshot commit, tracked or snapshotted
 * untracked, by where it leads from the clone: into the caller's checkout
 * or its git common directory (`blocked`: a builder write through it would
 * change the caller), elsewhere outside the clone (`escaping`: a system
 * path, or a relative link that climbs into the run's scratch directory),
 * or inside the clone (counted only). Runs before the clone's
 * `node_modules` links exist, so a link into `node_modules` stays inside.
 */
export async function checkSnapshotLinks(
	options: CheckOptions,
): Promise<SnapshotLinks> {
	const { caller, signal } = options;
	const clone = await realpath(options.clone);
	const callerTop = await realpath(
		await gitLine(["rev-parse", "--show-toplevel"], caller, signal),
	);
	const commonDir = await realpath(
		resolve(
			caller,
			await gitLine(["rev-parse", "--git-common-dir"], caller, signal),
		),
	);
	const result: SnapshotLinks = { checked: 0, blocked: [], escaping: [] };
	for (const path of await listLinks(clone, signal)) {
		result.checked++;
		const link = join(clone, path);
		const resolved = await resolveThrough(link);
		if (inside(clone, resolved)) continue;
		const entry = { path, target: await readlink(link), resolved };
		if (inside(callerTop, resolved) || inside(commonDir, resolved))
			result.blocked.push(entry);
		else result.escaping.push(entry);
	}
	return result;
}

/** Why the run stops before the builder starts, naming each blocked link. */
export function blockedLinksReason(blocked: readonly SnapshotLink[]): string {
	return `symlinks in the run's snapshot lead into your checkout or its git directory, so a builder write through them would change your files: ${listed(blocked)}; nothing was applied`;
}

export function escapingLinksWarning(
	escaping: readonly SnapshotLink[],
): string {
	return `symlinks in the run's snapshot lead out of the builder clone (not blocked; writes through them are not detected): ${listed(escaping)}`;
}

function listed(links: readonly SnapshotLink[]): string {
	const named = links
		.slice(0, MAX_LISTED)
		.map(({ path, resolved }) => `${path} -> ${resolved}`)
		.join(", ");
	const more = links.length - MAX_LISTED;
	return more > 0 ? `${named} and ${more} more` : named;
}

async function listLinks(
	clone: string,
	signal: AbortSignal | undefined,
): Promise<string[]> {
	const { stdout } = await execFileAsync("git", ["ls-files", "-s", "-z"], {
		cwd: clone,
		signal,
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout
		.split("\0")
		.filter((line) => line.startsWith(`${LINK_MODE} `))
		.map((line) => line.slice(line.indexOf("\t") + 1));
}

/**
 * The real path `path` leads to, through directory links and chains. When
 * the end does not exist, its deepest existing ancestor is resolved and the
 * rest appended, and a dangling link on the way is followed by its text, so
 * a write that would create the file still names where it lands.
 */
async function resolveThrough(path: string, hops = 0): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		// Missing or looping: resolve the part that exists.
	}
	const parent = dirname(path);
	if (parent === path || hops > MAX_HOPS) return path;
	const here = join(await resolveThrough(parent, hops), basename(path));
	const target = await readlink(here).catch(() => undefined);
	if (target === undefined) return here;
	return resolveThrough(resolve(dirname(here), target), hops + 1);
}

function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
}

async function gitLine(
	args: readonly string[],
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const { stdout } = await execFileAsync("git", [...args], { cwd, signal });
	return stdout.trim();
}
