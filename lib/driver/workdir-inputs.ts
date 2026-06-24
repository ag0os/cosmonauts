import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DriverRunSpec } from "./types.ts";

export async function writeDriverWorkdirInputs(
	spec: DriverRunSpec,
	taskIds: readonly string[],
): Promise<void> {
	await mkdir(spec.workdir, { recursive: true });
	await mkdir(dirname(spec.eventLogPath), { recursive: true });
	await writeFile(
		join(spec.workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(
		join(spec.workdir, "task-queue.txt"),
		`${taskIds.join("\n")}\n`,
		"utf-8",
	);
}
