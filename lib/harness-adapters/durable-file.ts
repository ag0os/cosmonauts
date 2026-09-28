import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeDurableFile(
	path: string,
	contents: string | Uint8Array,
): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true });
	const temporary = join(
		directory,
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	const handle = await open(temporary, "wx", 0o600);
	try {
		if (typeof contents === "string") {
			await handle.writeFile(contents, "utf8");
		} else {
			await handle.writeFile(contents);
		}
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await rename(temporary, path);
		await syncDirectory(directory);
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

export async function syncDirectory(path: string): Promise<void> {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
