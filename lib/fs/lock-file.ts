import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface FileLockHandle {
	release(): Promise<void>;
}

type FileLockAttempt<T> =
	| { readonly status: "acquired"; readonly handle: FileLockHandle }
	| { readonly status: "vacant" }
	| { readonly status: "occupied"; readonly owner: T };

export async function attemptFileLock<T>(options: {
	readonly lockPath: string;
	readonly tempPath: string;
	readonly content: T;
	readonly parse: (raw: string) => T;
	readonly sameOwner: (left: T, right: T) => boolean;
}): Promise<FileLockAttempt<T>> {
	await mkdir(dirname(options.lockPath), { recursive: true });
	try {
		await writeFile(options.tempPath, `${JSON.stringify(options.content)}\n`, {
			encoding: "utf-8",
			mode: 0o600,
		});
		await link(options.tempPath, options.lockPath);
		await unlink(options.tempPath).catch(() => undefined);
		return {
			status: "acquired",
			handle: createOwnedLockHandle(options),
		};
	} catch (error) {
		await unlink(options.tempPath).catch(() => undefined);
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	const owner = await readFileLock(options.lockPath, options.parse);
	return owner ? { status: "occupied", owner } : { status: "vacant" };
}

export async function readFileLock<T>(
	lockPath: string,
	parse: (raw: string) => T,
): Promise<T | undefined> {
	try {
		return parse(await readFile(lockPath, "utf-8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

export function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

function createOwnedLockHandle<T>(options: {
	readonly lockPath: string;
	readonly content: T;
	readonly parse: (raw: string) => T;
	readonly sameOwner: (left: T, right: T) => boolean;
}): FileLockHandle {
	let released = false;
	return {
		async release(): Promise<void> {
			if (released) return;
			const existing = await readFileLock(options.lockPath, options.parse);
			if (!existing || !options.sameOwner(existing, options.content)) {
				released = true;
				return;
			}
			await unlink(options.lockPath).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
			released = true;
		},
	};
}
