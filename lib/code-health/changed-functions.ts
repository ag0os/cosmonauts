/**
 * Changed-function resolver: every function that intersects a changed hunk of
 * the working tree against a base revision, with its complexity now and at the
 * base. Regression is judged per function against the base, never against an
 * absolute threshold, so untouched legacy code is never reported.
 *
 * One implementation serves the `cosmonauts analysis changed-functions` CLI and
 * any post-edit hook.
 */

import { execFile } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import {
	copyFile,
	mkdtemp,
	realpath,
	rm,
	stat,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
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
import {
	type DiffHunk,
	type FileDiff,
	mapNewLineToOld,
	parseUnifiedDiff,
	rangeIntersectsHunks,
} from "./diff-hunks.ts";
import {
	type FunctionMetrics,
	resolveFallowExecutable,
	runFunctionInventory,
} from "./fallow-function-metrics.ts";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const BASE_WORKTREE_PREFIX = "cosmonauts-changed-functions-";
const BASE_WORKTREE_OWNER = new RegExp(`^${BASE_WORKTREE_PREFIX}(\\d+)-`);

interface BaseFunctionMetrics {
	readonly cyclomatic: number;
	readonly cognitive: number;
	readonly crap: number | null;
}

export interface ChangedFunction extends FunctionMetrics {
	/** Metrics of the same function at the base; null for a new function. */
	readonly base: BaseFunctionMetrics | null;
	/** True when a metric present on both sides rose. New functions are false. */
	readonly regressed: boolean;
}

export interface ChangedFunctionsReport {
	readonly base: string;
	readonly baseCommit: string;
	readonly functions: readonly ChangedFunction[];
}

export interface ResolveChangedFunctionsOptions {
	/** Any directory inside the repository. */
	readonly cwd: string;
	/**
	 * Revision to compare the working tree (tracked and untracked files)
	 * against. The diff is direct, not from a merge-base: pass the branch point
	 * when the base has moved on.
	 */
	readonly base: string;
	/** Restrict the report to one file (absolute, or relative to `cwd`). */
	readonly file?: string;
	/** Fallow binary; defaults to Cosmonauts' own pinned install. */
	readonly fallowExecutable?: string;
	readonly signal?: AbortSignal;
}

interface ChangedFile {
	readonly oldPath: string | undefined;
	readonly newPath: string;
	readonly hunks: readonly DiffHunk[];
}

export async function resolveChangedFunctions(
	options: ResolveChangedFunctionsOptions,
): Promise<ChangedFunctionsReport> {
	const root = await git(options.cwd, ["rev-parse", "--show-toplevel"]);
	await sweepStaleBaseWorktrees(root);
	const baseCommit = await resolveBaseCommit(root, options.base);
	const executable = await resolveFallowExecutable(options.fallowExecutable);
	const files = filterToFile(
		await listChangedFiles(root, baseCommit),
		options.file === undefined
			? undefined
			: await repoRelativePath(root, options.cwd, options.file),
	);
	const report = { base: options.base, baseCommit };
	if (files.length === 0) return { ...report, functions: [] };

	// A whole-project inventory, not `--changed-since`: Fallow selects files
	// from the merge-base, so it drops files the direct diff below lists.
	const changed = selectChangedFunctions(
		await runFunctionInventory({
			executable,
			cwd: root,
			signal: options.signal,
		}),
		files,
	);
	if (changed.length === 0) return { ...report, functions: [] };

	const baseInventory = needsBase(changed)
		? await inventoryAtBase({
				root,
				baseCommit,
				executable,
				signal: options.signal,
			})
		: [];
	return {
		...report,
		functions: changed.map((entry) => compareWithBase(entry, baseInventory)),
	};
}

async function git(
	cwd: string,
	args: readonly string[],
	env?: NodeJS.ProcessEnv,
): Promise<string> {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: GIT_MAX_BUFFER,
	});
	return stdout.replace(/\n$/, "");
}

async function resolveBaseCommit(root: string, base: string): Promise<string> {
	if (base.startsWith("-")) throw new Error(`invalid base revision: ${base}`);
	try {
		return await git(root, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${base}^{commit}`,
		]);
	} catch {
		throw new Error(`unknown base revision: ${base}`);
	}
}

async function listChangedFiles(
	root: string,
	baseCommit: string,
): Promise<ChangedFile[]> {
	const diff = await withScratchIndex(root, (env) =>
		git(
			root,
			[
				"-c",
				"core.quotePath=false",
				"diff",
				"-U0",
				"--no-color",
				"--no-ext-diff",
				"--no-textconv",
				"--find-renames",
				"--src-prefix=a/",
				"--dst-prefix=b/",
				baseCommit,
			],
			env,
		),
	);
	return parseUnifiedDiff(diff).flatMap(toChangedFile);
}

/**
 * Run `action` against a private copy of the index in which every untracked
 * file is marked intent-to-add, so the diff shows untracked files and rename
 * detection can pair a file that was moved but never staged. The user's
 * index is never written.
 */
async function withScratchIndex<T>(
	root: string,
	action: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
	const scratch = await mkdtemp(join(tmpdir(), "cosmonauts-changed-index-"));
	try {
		const env = { ...process.env, GIT_INDEX_FILE: join(scratch, "index") };
		await copyIndex(root, env.GIT_INDEX_FILE);
		await markUntrackedIntentToAdd(root, scratch, env);
		return await action(env);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/**
 * Git treats an entry whose mtime is not older than the index file as
 * "racily clean" and re-reads its content. The copy must keep the source
 * index's mtime, or a same-size edit made in the same second as the last
 * index write is reported as unchanged.
 */
async function copyIndex(root: string, target: string): Promise<void> {
	const source = resolve(
		root,
		await git(root, ["rev-parse", "--git-path", "index"]),
	);
	if (!existsSync(source)) return;
	await copyFile(source, target);
	const { atime, mtime } = await stat(source);
	await utimes(target, atime, mtime);
}

/** A trailing slash marks an embedded repository, which git cannot diff. */
function isUntrackedFile(path: string): boolean {
	return path.length > 0 && !path.endsWith("/");
}

async function markUntrackedIntentToAdd(
	root: string,
	scratch: string,
	env: NodeJS.ProcessEnv,
): Promise<void> {
	const untracked = (
		await git(root, ["ls-files", "--others", "--exclude-standard", "-z"], env)
	)
		.split("\0")
		.filter(isUntrackedFile);
	if (untracked.length === 0) return;
	const pathspecFile = join(scratch, "untracked");
	await writeFile(pathspecFile, untracked.join("\0"));
	await git(
		root,
		[
			"--literal-pathspecs",
			"add",
			"--intent-to-add",
			`--pathspec-from-file=${pathspecFile}`,
			"--pathspec-file-nul",
		],
		env,
	);
}

function toChangedFile(diff: FileDiff): ChangedFile[] {
	return diff.newPath === undefined
		? []
		: [{ oldPath: diff.oldPath, newPath: diff.newPath, hunks: diff.hunks }];
}

/** Canonicalized first: git reports the root as a real path. */
async function repoRelativePath(
	root: string,
	cwd: string,
	file: string,
): Promise<string> {
	const absolute = await realpath(resolve(cwd, file)).catch(async () =>
		resolve(await realpath(cwd), file),
	);
	const path = relative(root, absolute);
	if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
		throw new Error(`file is outside the repository: ${file}`);
	}
	return path.split(sep).join("/");
}

function filterToFile(
	files: readonly ChangedFile[],
	file: string | undefined,
): ChangedFile[] {
	return files.filter((entry) => file === undefined || entry.newPath === file);
}

interface ChangedEntry {
	readonly metrics: FunctionMetrics;
	readonly file: ChangedFile;
	/** How many functions in the same new file share this name. */
	readonly nameCount: number;
}

/** Keep the inventory functions that intersect a hunk of their file. */
function selectChangedFunctions(
	inventory: readonly FunctionMetrics[],
	files: readonly ChangedFile[],
): ChangedEntry[] {
	const byPath = new Map(files.map((file) => [file.newPath, file]));
	const nameCounts = new Map<string, number>();
	for (const metrics of inventory) {
		const key = nameKey(metrics);
		nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
	}
	const changed = inventory.flatMap((metrics) => {
		const file = byPath.get(metrics.file);
		if (file === undefined || !rangeIntersectsHunks(metrics, file.hunks)) {
			return [];
		}
		return [
			{ metrics, file, nameCount: nameCounts.get(nameKey(metrics)) ?? 1 },
		];
	});
	return changed.sort(byLocation);
}

function byLocation(left: ChangedEntry, right: ChangedEntry): number {
	return (
		left.metrics.file.localeCompare(right.metrics.file) ||
		left.metrics.startLine - right.metrics.startLine
	);
}

function nameKey(metrics: FunctionMetrics): string {
	return `${metrics.file}\0${metrics.name}`;
}

function needsBase(changed: readonly ChangedEntry[]): boolean {
	return changed.some((entry) => entry.file.oldPath !== undefined);
}

interface InventoryAtBaseOptions {
	readonly root: string;
	readonly baseCommit: string;
	readonly executable: string;
	readonly signal: AbortSignal | undefined;
}

/**
 * Run the same inventory on a detached temporary worktree of the base, so
 * static CRAP estimates see the base's tests too. The worktree and its
 * directory are removed in every outcome.
 */
async function inventoryAtBase(
	options: InventoryAtBaseOptions,
): Promise<FunctionMetrics[]> {
	options.signal?.throwIfAborted();
	const scratch = await mkdtemp(
		join(tmpdir(), `${BASE_WORKTREE_PREFIX}${process.pid}-`),
	);
	const checkout = join(scratch, "base");
	let added = false;
	try {
		await git(options.root, [
			"worktree",
			"add",
			"--detach",
			"--quiet",
			checkout,
			options.baseCommit,
		]);
		added = true;
		await linkDependencies(options.root, checkout);
		return await runFunctionInventory({
			executable: options.executable,
			cwd: checkout,
			signal: options.signal,
		});
	} finally {
		await removeBaseWorktree(options.root, checkout, added);
		await rm(scratch, { recursive: true, force: true });
	}
}

async function linkDependencies(root: string, checkout: string): Promise<void> {
	const dependencies = join(root, "node_modules");
	const link = join(checkout, "node_modules");
	if (!existsSync(dependencies)) return;
	if (lstatSync(link, { throwIfNoEntry: false })) return;
	await symlink(dependencies, link, "dir");
}

async function removeBaseWorktree(
	root: string,
	checkout: string,
	added: boolean,
): Promise<void> {
	if (!added) return;
	try {
		await git(root, ["worktree", "remove", "--force", checkout]);
	} catch {
		await rm(checkout, { recursive: true, force: true });
		await git(root, ["worktree", "prune"]).catch(() => undefined);
	}
}

/**
 * Remove base worktrees whose owning process is gone, for example a hook
 * killed with SIGKILL mid-run. The owner's pid is part of the directory name,
 * so a concurrent live run is never touched.
 */
export async function sweepStaleBaseWorktrees(root: string): Promise<void> {
	const listing = await git(root, ["worktree", "list", "--porcelain"]);
	const stale = listing
		.split("\n")
		.filter((line) => line.startsWith("worktree "))
		.map((line) => line.slice("worktree ".length))
		.filter(isOrphanedBaseCheckout);
	for (const checkout of stale) {
		await removeBaseWorktree(root, checkout, true);
		await rm(dirname(checkout), { recursive: true, force: true });
	}
	if (stale.length > 0) {
		await git(root, ["worktree", "prune"]).catch(() => undefined);
	}
}

function isOrphanedBaseCheckout(checkout: string): boolean {
	if (basename(checkout) !== "base") return false;
	const owner = BASE_WORKTREE_OWNER.exec(basename(dirname(checkout)));
	return owner?.[1] !== undefined && !isProcessAlive(Number(owner[1]));
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Match `{file, name}` at the start line mapped through the diff, which
 * disambiguates repeated names such as `<arrow>`. When the start line was
 * rewritten, the old function must start within the lines its hunk removed.
 * Otherwise fall back to the name alone when it is unique on both sides.
 * A function none of these rules can place is reported as new.
 */
function findBaseFunction(
	entry: ChangedEntry,
	baseInventory: readonly FunctionMetrics[],
): FunctionMetrics | undefined {
	const { oldPath, hunks } = entry.file;
	if (oldPath === undefined) return undefined;
	const candidates = baseInventory.filter(
		(base) => base.file === oldPath && base.name === entry.metrics.name,
	);
	const oldRange = mapNewLineToOld(entry.metrics.startLine, hunks);
	const positioned = candidates.filter(
		(base) =>
			oldRange !== undefined &&
			base.startLine >= oldRange.startLine &&
			base.startLine <= oldRange.endLine,
	);
	if (positioned.length === 1) return positioned[0];
	return candidates.length === 1 && entry.nameCount === 1
		? candidates[0]
		: undefined;
}

function compareWithBase(
	entry: ChangedEntry,
	baseInventory: readonly FunctionMetrics[],
): ChangedFunction {
	const baseFunction = findBaseFunction(entry, baseInventory);
	const base =
		baseFunction === undefined
			? null
			: {
					cyclomatic: baseFunction.cyclomatic,
					cognitive: baseFunction.cognitive,
					crap: baseFunction.crap,
				};
	return {
		...entry.metrics,
		base,
		regressed: isRegression(entry.metrics, base),
	};
}

function isRegression(
	current: BaseFunctionMetrics,
	base: BaseFunctionMetrics | null,
): boolean {
	if (base === null) return false;
	return (
		current.cyclomatic > base.cyclomatic ||
		current.cognitive > base.cognitive ||
		(current.crap !== null && base.crap !== null && current.crap > base.crap)
	);
}
