import { createHash } from "node:crypto";
import {
	chmod,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ProjectConfig } from "../config/types.ts";
import { runQualityReviewCommand } from "./quality-review-command.ts";

export class WorkspaceRefusal extends Error {}
export class WorkspacePreparationFailure extends Error {}

interface Entry {
	path: string;
	mode: number;
	kind: "file" | "link" | "deleted";
	bytes?: Buffer;
	link?: string;
}
interface Sample {
	head: string;
	refs: string;
	index: string;
	entries: Entry[];
	digest: string;
}

async function processOutput(
	command: string,
	args: string[],
	cwd: string,
	source = false,
	timeout = 120_000,
	signal?: AbortSignal,
): Promise<Buffer> {
	const env: NodeJS.ProcessEnv = {};
	for (const name of [
		"PATH",
		"HOME",
		"TMPDIR",
		"LANG",
		"LC_ALL",
		"CI",
		"NO_COLOR",
	])
		if (process.env[name]) env[name] = process.env[name];
	if (source) env.GIT_OPTIONAL_LOCKS = "0";
	const result = await runQualityReviewCommand({
		command,
		args,
		cwd,
		env,
		timeoutMs: timeout,
		signal,
	});
	if (result.cancelled) throw new Error(`${command} cancelled`);
	if (result.timedOut)
		throw new Error(`${command} timed out after ${timeout}ms`);
	if (result.exitCode === 0) return result.output;
	throw new Error(
		`${command} ${args[0] ?? ""} exited ${result.exitCode}: ${result.output.toString("utf8").slice(-2000)}`,
	);
}

const git = (root: string, args: string[], source = false) =>
	processOutput("git", args, root, source);
const inside = (root: string, path: string) => {
	const rel = relative(root, path);
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
};
function safePath(path: string): void {
	if (
		!path ||
		isAbsolute(path) ||
		Array.from(path).some((character) => character.charCodeAt(0) < 32) ||
		path
			.split("/")
			.some((part) => part === ".." || part === "." || part === ".git" || !part)
	)
		throw new WorkspaceRefusal(`Unsupported snapshot path: ${path}`);
}
function safeLink(root: string, path: string, target: string): void {
	if (isAbsolute(target) || !inside(root, resolve(root, dirname(path), target)))
		throw new WorkspaceRefusal(`Unsafe symlink: ${path}`);
}
async function sample(root: string, excludePath?: string): Promise<Sample> {
	const [head, refs, indexBytes, staged, others, headPaths] = await Promise.all(
		[
			git(root, ["rev-parse", "HEAD"], true),
			git(root, ["for-each-ref", "--format=%(refname) %(objectname)"], true),
			readFile(join(root, ".git", "index")),
			git(root, ["ls-files", "--stage", "-z"], true),
			git(root, ["ls-files", "--others", "--exclude-standard", "-z"], true),
			git(root, ["ls-tree", "-r", "--name-only", "-z", "HEAD"], true),
		],
	);
	const tracked = staged
		.toString("utf8")
		.split("\0")
		.filter(Boolean)
		.map((row) => {
			const tab = row.indexOf("\t");
			const info = row.slice(0, tab).split(" ");
			if (tab < 0 || info[2] !== "0" || info[0] === "160000")
				throw new WorkspaceRefusal("Unreproducible gitlink or unmerged index");
			return row.slice(tab + 1);
		});
	const headTree = headPaths.toString("utf8").split("\0").filter(Boolean);
	const trackedPaths = new Set([...tracked, ...headTree]);
	const paths = [
		...new Set([
			...tracked,
			...headTree,
			...others.toString("utf8").split("\0").filter(Boolean),
		]),
	]
		.filter((path) => path !== excludePath)
		.sort();
	const entries: Entry[] = [];
	for (const path of paths) {
		safePath(path);
		const absolute = join(root, path);
		let ancestor = dirname(absolute);
		let missingParent = false;
		while (ancestor !== root) {
			const parentStat = await lstat(ancestor).catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return undefined;
					throw error;
				},
			);
			if (!parentStat) {
				missingParent = true;
				break;
			}
			if (!parentStat.isDirectory() || parentStat.isSymbolicLink())
				throw new WorkspaceRefusal(`Unsafe parent directory: ${path}`);
			ancestor = dirname(ancestor);
		}
		if (missingParent && trackedPaths.has(path)) {
			entries.push({ path, kind: "deleted", mode: 0 });
			continue;
		}
		let stat: Awaited<ReturnType<typeof lstat>>;
		try {
			stat = await lstat(absolute);
		} catch (error) {
			if (
				(error as NodeJS.ErrnoException).code === "ENOENT" &&
				trackedPaths.has(path)
			) {
				entries.push({ path, kind: "deleted", mode: 0 });
				continue;
			}
			throw error;
		}
		if (stat.isSymbolicLink()) {
			const link = await readlink(absolute);
			safeLink(root, path, link);
			entries.push({ path, mode: stat.mode & 0o777, kind: "link", link });
		} else if (stat.isFile())
			entries.push({
				path,
				mode: stat.mode & 0o777,
				kind: "file",
				bytes: await readFile(absolute),
			});
		else throw new WorkspaceRefusal(`Unsupported snapshot entry: ${path}`);
	}
	const state = {
		head: head.toString().trim(),
		refs: refs.toString(),
		index: createHash("sha256").update(indexBytes).digest("hex"),
		entries,
	};
	return {
		...state,
		digest: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
	};
}

async function verifyLayout(root: string): Promise<void> {
	const dotGit = await lstat(join(root, ".git"));
	if (!dotGit.isDirectory() || dotGit.isSymbolicLink())
		throw new WorkspaceRefusal("Unsupported linked worktree layout");
	const top = (await git(root, ["rev-parse", "--show-toplevel"], true))
		.toString()
		.trim();
	if ((await realpath(top)) !== (await realpath(root)))
		throw new WorkspaceRefusal("Unsupported nested repository layout");
	if (
		(
			await git(root, ["config", "--bool", "core.sparseCheckout"], true).catch(
				() => Buffer.from("false"),
			)
		)
			.toString()
			.trim() === "true"
	)
		throw new WorkspaceRefusal("Unsupported sparse checkout");
	const modules = await lstat(join(root, ".gitmodules")).catch(() => undefined);
	if (modules) throw new WorkspaceRefusal("Unsupported submodule layout");
}

export interface PrivateReviewWorkspace {
	readonly workspaceRoot: string;
	readonly materialsRoot: string;
	readonly sourceRealPath: string;
	readonly head: string;
	readonly base: string;
	readonly changedFiles: readonly string[];
}

/** A separate checkout of the captured base supplies project runtime inputs. */
export async function materializeBaseReviewProject(
	workspaceRoot: string,
	base: string,
): Promise<string> {
	const destination = join(dirname(workspaceRoot), "base-runtime");
	await git(dirname(workspaceRoot), [
		"clone",
		"--no-hardlinks",
		"--no-checkout",
		"--no-tags",
		"--",
		workspaceRoot,
		destination,
	]);
	await git(destination, ["checkout", "--detach", base]);
	await git(destination, ["remote", "remove", "origin"]);
	return destination;
}

/** Restore only private directory permissions so a read-only materials tree can be removed. */
export async function removePrivateReviewWorkspace(
	reservedRoot: string,
): Promise<void> {
	const materials = join(reservedRoot, "materials");
	const writable = async (path: string): Promise<void> => {
		const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined;
			throw error;
		});
		if (!stat?.isDirectory() || stat.isSymbolicLink()) return;
		await chmod(path, 0o700);
		for (const child of await readdir(path)) await writable(join(path, child));
	};
	await writable(materials);
	await writable(join(reservedRoot, "checkout"));
	await rm(reservedRoot, { recursive: true, force: true });
}

/** Capture without source writes; materialize in an exclusively reserved directory. */
export async function createPrivateReviewWorkspace(
	projectRoot: string,
	workspaceRoot: string,
	ports: {
		afterFirstSample?: (attempt: number) => Promise<void>;
		excludePath?: string;
	} = {},
): Promise<PrivateReviewWorkspace> {
	const sourceRealPath = await realpath(projectRoot);
	await verifyLayout(sourceRealPath);
	let captured: Sample | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		const first = await sample(sourceRealPath, ports.excludePath);
		await ports.afterFirstSample?.(attempt);
		const second = await sample(sourceRealPath, ports.excludePath);
		if (first.digest === second.digest) {
			captured = first;
			break;
		}
	}
	if (!captured)
		throw new WorkspaceRefusal("Unstable source capture after three attempts");
	const snapshot = captured;
	const checkout = join(workspaceRoot, "checkout");
	const materialsRoot = join(workspaceRoot, "materials");
	await git(
		workspaceRoot,
		[
			"clone",
			"--no-hardlinks",
			"--no-checkout",
			"--no-tags",
			"--",
			sourceRealPath,
			checkout,
		],
		true,
	);
	if (
		(await sample(sourceRealPath, ports.excludePath)).digest !== snapshot.digest
	)
		throw new WorkspaceRefusal("Source changed during private clone");
	const candidates = [
		"refs/heads/main",
		"refs/heads/master",
		"refs/remotes/origin/main",
	];
	let base: string | undefined;
	for (const candidate of candidates) {
		const found = snapshot.refs
			.split("\n")
			.find((line) => line.startsWith(`${candidate} `));
		if (found) {
			base = found.slice(candidate.length + 1);
			break;
		}
	}
	if (!base) throw new WorkspaceRefusal("Review base ref is unavailable");
	await git(checkout, ["update-ref", "refs/heads/qm-review-base", base]);
	base = (await git(checkout, ["merge-base", snapshot.head, base]))
		.toString("utf8")
		.trim();
	await git(checkout, ["remote", "remove", "origin"]);
	await git(checkout, ["checkout", "--detach", snapshot.head]);
	await rm(join(checkout, ".git", "logs"), { recursive: true, force: true });
	for (const entry of snapshot.entries) {
		const target = join(checkout, entry.path);
		if (entry.kind === "deleted") {
			await rm(target, { force: true });
			continue;
		}
		await mkdir(dirname(target), { recursive: true });
		await rm(target, { force: true });
		if (entry.kind === "link") await symlink(entry.link ?? "", target);
		else {
			await writeFile(target, entry.bytes ?? Buffer.alloc(0));
			await chmod(target, entry.mode);
		}
	}
	await git(checkout, ["add", "-A"]);
	const changed = (
		await git(checkout, ["diff", "--cached", "--name-only", "-z", base])
	)
		.toString()
		.split("\0")
		.filter(Boolean);
	const diff = await git(checkout, ["diff", "--cached", "--binary", base]);
	const changedSet = new Set(changed);
	for (const path of changed) {
		const parts = path.split("/");
		for (let index = 1; index < parts.length; index++) {
			if (changedSet.has(parts.slice(0, index).join("/")))
				throw new WorkspaceRefusal(`Unsupported changed-path nesting: ${path}`);
		}
	}
	await mkdir(join(materialsRoot, "base"), { recursive: true, mode: 0o700 });
	await writeFile(join(materialsRoot, "base-sha.txt"), `${base}\n`);
	await writeFile(
		join(materialsRoot, "range.txt"),
		`${base}..captured:${snapshot.head}\n`,
	);
	await writeFile(
		join(materialsRoot, "changed-files.txt"),
		`${changed.join("\n")}\n`,
	);
	await writeFile(join(materialsRoot, "full.diff"), diff);
	for (const path of changed) {
		safePath(path);
		const blob = await git(checkout, [
			"cat-file",
			"blob",
			`${base}:${path}`,
		]).catch(() => undefined);
		if (blob) {
			const output = join(materialsRoot, "base", path);
			await mkdir(dirname(output), { recursive: true });
			await writeFile(output, blob);
		}
	}
	for (const path of [
		"base-sha.txt",
		"range.txt",
		"changed-files.txt",
		"full.diff",
	])
		await chmod(join(materialsRoot, path), 0o400);
	for (const path of changed) {
		let cursor = dirname(join(materialsRoot, "base", path));
		while (cursor !== materialsRoot) {
			await chmod(cursor, 0o500).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
			cursor = dirname(cursor);
		}
		const copy = join(materialsRoot, "base", path);
		await chmod(copy, 0o400).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
	await chmod(join(materialsRoot, "base"), 0o500);
	// The host adds checks.md after preparation and checks, then seals this directory.
	return {
		workspaceRoot: checkout,
		materialsRoot,
		sourceRealPath,
		head: snapshot.head,
		base,
		changedFiles: changed,
	};
}

export async function preparePrivateReviewWorkspace(
	workspace: PrivateReviewWorkspace,
	signal?: AbortSignal,
	qualityReview?: ProjectConfig["qualityReview"],
): Promise<readonly { id: string; durationMs: number }[]> {
	const results: { id: string; durationMs: number }[] = [];
	for (const [index, step] of (qualityReview?.prepare ?? []).entries()) {
		if (signal?.aborted) throw new Error("Caller cancellation");
		const started = Date.now();
		try {
			await processOutput(
				step.command,
				[...step.args],
				workspace.workspaceRoot,
				false,
				step.timeoutMs ?? 120_000,
				signal,
			);
		} catch (error) {
			throw new WorkspacePreparationFailure(
				`Preparation step ${step.id || index + 1} failed after ${Date.now() - started}ms: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		results.push({ id: step.id, durationMs: Date.now() - started });
	}
	return results;
}
