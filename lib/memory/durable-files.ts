import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	link,
	lstat,
	mkdir,
	open,
	rename,
	stat,
	unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { LivingMemoryDurableFiles } from "./types.ts";

export interface DurableMachineFiles extends LivingMemoryDurableFiles {
	replaceText(options: {
		readonly path: string;
		readonly content: string;
		readonly signal?: AbortSignal;
	}): Promise<{ readonly path: string; readonly digest: string }>;
	removeFile(path: string): Promise<void>;
}

export interface DurableRetirementFiles extends DurableMachineFiles {
	ensureDirectory(path: string): Promise<void>;
	confirmFileDurability(path: string): Promise<void>;
	assertRemovalSupported(options: {
		readonly sourcePath: string;
		readonly destinationDirectory: string;
	}): Promise<void>;
	linkFile(options: {
		readonly sourcePath: string;
		readonly destinationPath: string;
	}): Promise<void>;
	removeFile(path: string): Promise<void>;
}

export class DurableRemovalUnsupportedError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "DurableRemovalUnsupportedError";
	}
}

/** Durable machine-state mutation only. Source removal authority is absent. */
export function createDurableMachineFiles(): DurableMachineFiles {
	return {
		writeText: writeTextExclusive,
		replaceText,
		removeFile: durableRemove,
	};
}

/**
 * Source-removal primitives for the retirement transaction. Capability probing
 * is explicit so hard-link and directory-sync failures happen while the live
 * source is still authoritative.
 */
export function createDurableRetirementFiles(): DurableRetirementFiles {
	return {
		...createDurableMachineFiles(),
		ensureDirectory,
		confirmFileDurability: syncRegularFile,
		assertRemovalSupported,
		linkFile: durableLink,
		removeFile: durableRemove,
	};
}

async function ensureDirectory(path: string): Promise<void> {
	const absolute = resolve(path);
	await mkdir(absolute, { recursive: true });
	const metadata = await lstat(absolute);
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Durable directory is not a real directory: ${absolute}`);
	}
	await syncDirectory(dirname(absolute));
	await syncDirectory(absolute);
}

async function assertRemovalSupported(options: {
	readonly sourcePath: string;
	readonly destinationDirectory: string;
}): Promise<void> {
	const probePath = join(
		options.destinationDirectory,
		`.living-memory-probe.${process.pid}.${randomUUID()}.tmp`,
	);
	let probeExists = false;
	try {
		const source = await open(
			options.sourcePath,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			const metadata = await source.stat();
			if (!metadata.isFile()) {
				throw new Error("source is not a regular file");
			}
			await source.sync();
		} finally {
			await source.close();
		}
		const [sourceMetadata, destinationMetadata] = await Promise.all([
			stat(options.sourcePath),
			stat(options.destinationDirectory),
		]);
		if (sourceMetadata.dev !== destinationMetadata.dev) {
			throw new Error(
				"source and retired destination are on different filesystems",
			);
		}
		await syncDirectory(dirname(options.sourcePath));
		await syncDirectory(options.destinationDirectory);
		await link(options.sourcePath, probePath);
		probeExists = true;
		await syncDirectory(options.destinationDirectory);
		await unlink(probePath);
		probeExists = false;
		await syncDirectory(options.destinationDirectory);
	} catch (error: unknown) {
		throw new DurableRemovalUnsupportedError(
			`Durable retirement is unsupported for ${options.sourcePath}: ${
				error instanceof Error ? error.message : String(error)
			}.`,
			{ cause: error },
		);
	} finally {
		if (probeExists) {
			await unlink(probePath).catch(() => undefined);
			await syncDirectory(options.destinationDirectory).catch(() => undefined);
		}
	}
}

async function durableLink(options: {
	readonly sourcePath: string;
	readonly destinationPath: string;
}): Promise<void> {
	try {
		await link(options.sourcePath, options.destinationPath);
	} catch (error: unknown) {
		if (errorCode(error) !== "EEXIST") throw error;
		const [source, destination] = await Promise.all([
			stat(options.sourcePath),
			stat(options.destinationPath),
		]);
		if (source.dev !== destination.dev || source.ino !== destination.ino) {
			throw new Error(
				`Durable retirement destination conflict at ${options.destinationPath}.`,
			);
		}
	}
	await syncDirectory(dirname(options.destinationPath));
}

async function durableRemove(path: string): Promise<void> {
	await unlink(path).catch((error: unknown) => {
		if (errorCode(error) !== "ENOENT") throw error;
	});
	await syncDirectory(dirname(path));
}

async function writeTextExclusive(options: {
	readonly path: string;
	readonly content: string;
	readonly signal?: AbortSignal;
}): Promise<{ readonly path: string; readonly digest: string }> {
	throwIfAborted(options.signal);
	const digest = sha256(options.content);
	const existing = await readRegularFile(options.path);
	if (existing !== undefined) {
		if (existing !== options.content) {
			throw new Error(`Durable file identity conflict at ${options.path}.`);
		}
		await syncRegularFile(options.path);
		return { path: options.path, digest };
	}

	const tempPath = temporaryPath(options.path);
	let tempExists = false;
	try {
		await writeSyncedTemp({
			path: tempPath,
			content: options.content,
			signal: options.signal,
		});
		tempExists = true;
		try {
			await link(tempPath, options.path);
			await syncDirectory(dirname(options.path));
		} catch (error: unknown) {
			if (errorCode(error) !== "EEXIST") throw error;
			const winner = await readRegularFile(options.path);
			if (winner !== options.content) {
				throw new Error(`Durable file identity conflict at ${options.path}.`);
			}
		}
		return { path: options.path, digest };
	} finally {
		if (tempExists) {
			await unlink(tempPath).catch((error: unknown) => {
				if (errorCode(error) !== "ENOENT") throw error;
			});
			await syncDirectory(dirname(options.path));
		}
	}
}

async function syncRegularFile(path: string): Promise<void> {
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const metadata = await handle.stat();
		if (!metadata.isFile()) {
			throw new Error(`Durable file occupant is not a regular file: ${path}`);
		}
		await handle.sync();
	} finally {
		await handle.close();
	}
	await syncDirectory(dirname(path));
}

async function replaceText(options: {
	readonly path: string;
	readonly content: string;
	readonly signal?: AbortSignal;
}): Promise<{ readonly path: string; readonly digest: string }> {
	throwIfAborted(options.signal);
	const metadata = await lstat(options.path).catch((error: unknown) => {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	});
	if (metadata?.isSymbolicLink()) {
		throw new Error(`Durable file path is a symlink: ${options.path}`);
	}
	const tempPath = temporaryPath(options.path);
	let tempExists = false;
	try {
		await writeSyncedTemp({
			path: tempPath,
			content: options.content,
			signal: options.signal,
		});
		tempExists = true;
		await rename(tempPath, options.path);
		tempExists = false;
		await syncDirectory(dirname(options.path));
		return { path: options.path, digest: sha256(options.content) };
	} finally {
		if (tempExists) {
			await unlink(tempPath).catch((error: unknown) => {
				if (errorCode(error) !== "ENOENT") throw error;
			});
			await syncDirectory(dirname(options.path));
		}
	}
}

async function writeSyncedTemp(options: {
	readonly path: string;
	readonly content: string;
	readonly signal?: AbortSignal;
}): Promise<void> {
	const handle = await open(
		options.path,
		constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
		0o600,
	);
	try {
		throwIfAborted(options.signal);
		await handle.writeFile(options.content, "utf-8");
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function readRegularFile(path: string): Promise<string | undefined> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				throw new Error(`Durable file occupant is not a regular file: ${path}`);
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

async function syncDirectory(path: string): Promise<void> {
	const handle = await open(path, constants.O_RDONLY);
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

function temporaryPath(path: string): string {
	return join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new Error("Durable file write was cancelled.");
	}
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
