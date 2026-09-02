import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { LivingMemoryDurableFiles } from "./types.ts";

export interface DurableMachineFiles extends LivingMemoryDurableFiles {
	replaceText(options: {
		readonly path: string;
		readonly content: string;
		readonly signal?: AbortSignal;
	}): Promise<{ readonly path: string; readonly digest: string }>;
}

/** Durable machine-state writes only. Source removal authority is intentionally absent. */
export function createDurableMachineFiles(): DurableMachineFiles {
	return {
		writeText: writeTextExclusive,
		replaceText,
	};
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
