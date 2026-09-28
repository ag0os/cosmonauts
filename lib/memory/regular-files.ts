import { constants, type Stats } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";

export async function readOptionalNoFollowRegularFile<T>(options: {
	readonly path: string;
	readonly notRegularMessage: string;
	readonly read: (handle: FileHandle, metadata: Stats) => Promise<T>;
}): Promise<T | undefined> {
	try {
		const handle = await open(
			options.path,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) throw new Error(options.notRegularMessage);
			return await options.read(handle, metadata);
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
