/**
 * Concurrency tests for TaskManager.createTask — atomic task ID allocation.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskManager } from "../../lib/tasks/task-manager.js";

const CONCURRENCY = 8;

async function listTaskFilenames(projectRoot: string): Promise<string[]> {
	const entries = await readdir(join(projectRoot, "missions", "tasks"));
	return entries.filter((file) => file.endsWith(".md"));
}

describe("TaskManager.createTask concurrency", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "task-concurrency-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("allocates distinct IDs for concurrent creates on one TaskManager", async () => {
		const manager = new TaskManager(tempDir);
		await manager.init();

		const tasks = await Promise.all(
			Array.from({ length: CONCURRENCY }, (_, i) =>
				manager.createTask({ title: `Task ${i}` }),
			),
		);

		const ids = new Set(tasks.map((task) => task.id));
		expect(ids.size).toBe(CONCURRENCY);

		const files = await listTaskFilenames(tempDir);
		expect(files).toHaveLength(CONCURRENCY);
	});

	it("allocates distinct IDs for concurrent creates across separate TaskManager instances", async () => {
		// Initialize the project once so all instances share config + dirs.
		await new TaskManager(tempDir).init();

		const tasks = await Promise.all(
			Array.from({ length: CONCURRENCY }, (_, i) =>
				new TaskManager(tempDir).createTask({ title: `Task ${i}` }),
			),
		);

		const ids = new Set(tasks.map((task) => task.id));
		expect(ids.size).toBe(CONCURRENCY);

		const files = await listTaskFilenames(tempDir);
		expect(files).toHaveLength(CONCURRENCY);
	});
});
