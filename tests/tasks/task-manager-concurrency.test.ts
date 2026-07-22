/**
 * Concurrency tests for TaskManager.createTask — atomic task ID allocation.
 */

import {
	access,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withEntityFileLock } from "../../lib/entity-file-lock.ts";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../lib/memory/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.js";

const CONCURRENCY = 8;

async function listTaskFilenames(projectRoot: string): Promise<string[]> {
	const entries = await readdir(join(projectRoot, "missions", "tasks"));
	return entries.filter((file) => file.endsWith(".md"));
}

describe("TaskManager concurrency", () => {
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

	it("serializes enabled same-task updates and records only actual status transitions @cosmo-behavior plan:episodic-log-detached-hardening#B-015", async () => {
		const sameTargetRoot = join(tempDir, "same-target");
		await writeEpisodicConfig(sameTargetRoot);
		const sameTargetLockPath = join(
			sameTargetRoot,
			".cosmonauts",
			"episode-task-TASK-001.lock",
		);
		const firstSameTargetManager = new TaskManager(sameTargetRoot, {
			episodeSource: "custom/first-task-owner",
		});
		const secondSameTargetManager = new TaskManager(sameTargetRoot, {
			episodeSource: "custom/second-task-owner",
		});
		const sameTargetTask = await firstSameTargetManager.createTask({
			title: "Shared Task",
		});

		const releaseHeldLock = deferred<void>();
		const heldLockStarted = deferred<void>();
		const heldLock = withEntityFileLock(sameTargetLockPath, async () => {
			heldLockStarted.resolve();
			await releaseHeldLock.promise;
		});
		await heldLockStarted.promise;

		let settledUpdates = 0;
		const sameTargetUpdates = [
			firstSameTargetManager.updateTask(sameTargetTask.id, {
				title: "First Same Target",
				status: "In Progress",
			}),
			secondSameTargetManager.updateTask("task-001", {
				title: "Second Same Target",
				status: "In Progress",
			}),
		];
		for (const update of sameTargetUpdates) {
			void update.then(() => {
				settledUpdates += 1;
			});
		}
		try {
			await new Promise((resolve) => setTimeout(resolve, 75));
			expect(settledUpdates).toBe(0);
		} finally {
			releaseHeldLock.resolve();
			await heldLock;
		}
		await Promise.all(sameTargetUpdates);

		const sameTargetTransitions = await readTaskStatusTransitions(
			sameTargetRoot,
			sameTargetTask.id,
		);
		expect(sameTargetTransitions).toHaveLength(1);
		expect(sameTargetTransitions[0]?.content).toContain("To Do to In Progress");
		const persistedSameTarget = await firstSameTargetManager.getTask(
			sameTargetTask.id,
		);
		expect(persistedSameTarget?.status).toBe("In Progress");
		expect(["First Same Target", "Second Same Target"]).toContain(
			persistedSameTarget?.title,
		);
		expect(await listTaskFilenames(sameTargetRoot)).toEqual([
			`${sameTargetTask.id} - ${persistedSameTarget?.title}.md`,
		]);
		await expect(access(sameTargetLockPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(
			access(join(sameTargetRoot, ".cosmonauts", "episode-task-task-001.lock")),
		).rejects.toMatchObject({ code: "ENOENT" });

		const differentTargetRoot = join(tempDir, "different-target");
		await writeEpisodicConfig(differentTargetRoot);
		const firstDifferentTargetManager = new TaskManager(differentTargetRoot, {
			episodeSource: "custom/first-task-owner",
		});
		const secondDifferentTargetManager = new TaskManager(differentTargetRoot, {
			episodeSource: "custom/second-task-owner",
		});
		const differentTargetTask = await firstDifferentTargetManager.createTask({
			title: "Shared Task",
		});
		await Promise.all([
			firstDifferentTargetManager.updateTask("TASK-001", {
				title: "Completed Target",
				status: "Done",
			}),
			secondDifferentTargetManager.updateTask("Task-001", {
				title: "Blocked Target",
				status: "Blocked",
			}),
		]);

		const persistedDifferentTarget =
			await firstDifferentTargetManager.getTask("task-001");
		const differentTargetTransitions = await readTaskStatusTransitions(
			differentTargetRoot,
			differentTargetTask.id,
		);
		expect(differentTargetTransitions).toHaveLength(2);
		if (persistedDifferentTarget?.status === "Done") {
			expect(persistedDifferentTarget.title).toBe("Completed Target");
			expect(
				differentTargetTransitions.map((transition) => transition.content),
			).toEqual(
				expect.arrayContaining([
					expect.stringContaining("To Do to Blocked"),
					expect.stringContaining("Blocked to Done"),
				]),
			);
		} else {
			expect(persistedDifferentTarget?.status).toBe("Blocked");
			expect(persistedDifferentTarget?.title).toBe("Blocked Target");
			expect(
				differentTargetTransitions.map((transition) => transition.content),
			).toEqual(
				expect.arrayContaining([
					expect.stringContaining("To Do to Done"),
					expect.stringContaining("Done to Blocked"),
				]),
			);
		}
		expect(await listTaskFilenames(differentTargetRoot)).toEqual([
			`${differentTargetTask.id} - ${persistedDifferentTarget?.title}.md`,
		]);
		await expect(
			access(
				join(differentTargetRoot, ".cosmonauts", "episode-task-TASK-001.lock"),
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps enabled transition locks flat for separator and traversal shaped task ids", async () => {
		const unsafeRoot = join(tempDir, "unsafe-ids");
		await writeEpisodicConfig(unsafeRoot);
		const manager = new TaskManager(unsafeRoot, {
			episodeSource: "custom/unsafe-id-owner",
		});
		await manager.createTask({ title: "Real Task" });

		const cosmonautsDir = join(unsafeRoot, ".cosmonauts");
		const before = (await readdir(cosmonautsDir)).sort();

		for (const unsafeId of [
			"a/b",
			"a\\b",
			"../escape",
			"../../escape",
			"TASK-001/../../escape",
			"",
		]) {
			// The primary failure must stay the ordinary not-found error.
			await expect(
				manager.updateTask(unsafeId, { status: "In Progress" }),
			).rejects.toThrow();
		}

		// No nested directory, no escaped artifact, no leftover lock.
		expect((await readdir(cosmonautsDir)).sort()).toEqual(before);
		for (const entry of await readdir(cosmonautsDir, { withFileTypes: true })) {
			expect(entry.isDirectory()).toBe(false);
		}
		await expect(
			access(join(unsafeRoot, ".cosmonauts", "episode-task-A")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(join(unsafeRoot, "escape.lock"))).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
		await expect(
			access(join(unsafeRoot, ".cosmonauts", "escape.lock")),
		).rejects.toMatchObject({ code: "ENOENT" });

		// The real task is untouched and still uses its canonical flat lock path.
		expect(await listTaskFilenames(unsafeRoot)).toEqual([
			"TASK-001 - Real Task.md",
		]);
	});
});

async function writeEpisodicConfig(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

async function readTaskStatusTransitions(projectRoot: string, id: string) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;
	return records.filter((record) => {
		const metadata = parseEpisodeRecord(record);
		return (
			metadata?.action === "task.status-changed" &&
			metadata.subject.kind === "task" &&
			metadata.subject.id === id
		);
	});
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
} {
	let resolvePromise: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}
