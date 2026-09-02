import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { DurableMachineFiles } from "./durable-files.ts";
import { isSafePosixRelativePath } from "./knowledge-records.ts";

export async function ensureSafeContainedDirectory(options: {
	readonly root: string;
	readonly relativeDirectory: string;
	readonly label: string;
}): Promise<string> {
	if (!isSafePosixRelativePath(options.relativeDirectory)) {
		throw new Error(`${options.label} directory must be a safe relative path.`);
	}
	const root = resolve(options.root);
	await ensureRootDirectory(root, options.label);
	let current = root;
	for (const segment of options.relativeDirectory.split("/")) {
		current = join(current, segment);
		await ensureRealDirectory(current, options.label);
	}
	const [realRoot, realDirectory] = await Promise.all([
		realpath(root),
		realpath(current),
	]);
	if (!isContained(realRoot, realDirectory)) {
		throw new Error(`${options.label} directory escapes its real root.`);
	}
	return current;
}

async function ensureRootDirectory(path: string, label: string): Promise<void> {
	try {
		await assertRealDirectory(path, label);
		return;
	} catch (error: unknown) {
		if (errorCode(error) !== "ENOENT") throw error;
	}
	await mkdir(path, { recursive: true });
	await assertRealDirectory(path, label);
}

export async function writeSafeExclusiveText(options: {
	readonly root: string;
	readonly relativePath: string;
	readonly content: string;
	readonly durableFiles: DurableMachineFiles;
	readonly label: string;
	readonly signal?: AbortSignal;
}): Promise<{ readonly path: string; readonly digest: string }> {
	if (!isSafePosixRelativePath(options.relativePath)) {
		throw new Error(`${options.label} path must be a safe relative path.`);
	}
	const segments = options.relativePath.split("/");
	const fileName = segments.pop();
	if (!fileName || segments.length === 0) {
		throw new Error(`${options.label} path requires a contained directory.`);
	}
	const directory = await ensureSafeContainedDirectory({
		root: options.root,
		relativeDirectory: segments.join("/"),
		label: options.label,
	});
	return options.durableFiles.writeText({
		path: join(directory, fileName),
		content: options.content,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

export async function readSafeRegularText(options: {
	readonly root: string;
	readonly relativePath: string;
	readonly label: string;
}): Promise<string | undefined> {
	if (!isSafePosixRelativePath(options.relativePath)) {
		throw new Error(`${options.label} path must be a safe relative path.`);
	}
	const path = resolve(options.root, ...options.relativePath.split("/"));
	if (!isContainedOrEqual(resolve(options.root), path)) {
		throw new Error(`${options.label} path escapes its root.`);
	}
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				throw new Error(
					`${options.label} occupant is not a regular file: ${path}`,
				);
			}
			return await handle.readFile("utf-8");
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
	const metadata = await lstat(path);
	if (metadata.isSymbolicLink()) {
		throw new Error(`${label} directory is a symlink: ${path}`);
	}
	if (!metadata.isDirectory()) {
		throw new Error(`${label} path is not a directory: ${path}`);
	}
}

async function ensureRealDirectory(path: string, label: string): Promise<void> {
	try {
		await assertRealDirectory(path, label);
		return;
	} catch (error: unknown) {
		if (errorCode(error) !== "ENOENT") throw error;
	}
	try {
		await mkdir(path);
	} catch (error: unknown) {
		if (errorCode(error) !== "EEXIST") throw error;
	}
	await assertRealDirectory(path, label);
}

function isContained(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return (
		path.length > 0 &&
		!path.startsWith(`..${sep}`) &&
		path !== ".." &&
		!isAbsolute(path)
	);
}

function isContainedOrEqual(parent: string, child: string): boolean {
	return parent === child || isContained(parent, child);
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
