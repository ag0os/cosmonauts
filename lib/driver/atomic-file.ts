import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeFileAtomically(
	path: string,
	content: string,
): Promise<void> {
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);

	try {
		await writeFile(tempPath, content, "utf-8");
		await rename(tempPath, path);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}
