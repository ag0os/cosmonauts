import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeFileAtomically(
	path: string,
	content: string,
): Promise<void> {
	const tempPath = await prepareAtomicWrite(path);
	try {
		await writeFile(tempPath, content, "utf-8");
		await rename(tempPath, path);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

export async function prepareAtomicWrite(path: string): Promise<string> {
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });
	return join(dir, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
}
