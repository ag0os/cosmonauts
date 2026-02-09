/**
 * Tests for file-system.ts
 * Covers file I/O operations with temp directory isolation
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	deleteTaskFile,
	ensureForgeDirectory,
	getTaskFilename,
	listTaskFiles,
	loadConfig,
	parseTaskIdFromFilename,
	readTaskFile,
	saveConfig,
	saveTaskFile,
} from "../../lib/tasks/file-system.js";
import type { ForgeTasksConfig } from "../../lib/tasks/task-types.js";

/**
 * Helper to create a unique temp directory for test isolation
 */
async function createTestDir(): Promise<string> {
	const prefix = join(tmpdir(), "forge-test-");
	return await mkdtemp(prefix);
}

/**
 * Helper to safely clean up temp directory
 */
async function cleanupTestDir(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

describe("ensureForgeDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("creates forge/ directory", async () => {
		await ensureForgeDirectory(testDir);

		const forgeDir = join(testDir, "forge");
		const stats = await stat(forgeDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("creates forge/tasks/ directory", async () => {
		await ensureForgeDirectory(testDir);

		const tasksDir = join(testDir, "forge", "tasks");
		const stats = await stat(tasksDir);
		expect(stats.isDirectory()).toBe(true);
	});

	test("returns path to forge/tasks/", async () => {
		const result = await ensureForgeDirectory(testDir);

		expect(result).toBe(join(testDir, "forge", "tasks"));
	});

	test("is idempotent - calling multiple times succeeds", async () => {
		await ensureForgeDirectory(testDir);
		await ensureForgeDirectory(testDir);
		await ensureForgeDirectory(testDir);

		const tasksDir = join(testDir, "forge", "tasks");
		const stats = await stat(tasksDir);
		expect(stats.isDirectory()).toBe(true);
	});
});

describe("loadConfig / saveConfig", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns null when config does not exist", async () => {
		const config = await loadConfig(testDir);
		expect(config).toBeNull();
	});

	test("saves and loads config successfully", async () => {
		const config: ForgeTasksConfig = {
			prefix: "TASK",
			zeroPadding: 3,
			projectName: "Test Project",
			defaultPriority: "medium",
		};

		await saveConfig(testDir, config);
		const loaded = await loadConfig(testDir);

		expect(loaded).toEqual(config);
	});

	test("round-trip preserves all config fields", async () => {
		const config: ForgeTasksConfig = {
			prefix: "FEAT",
			zeroPadding: 4,
			projectName: "My Project",
			defaultPriority: "high",
			defaultLabels: ["backend", "api"],
		};

		await saveConfig(testDir, config);
		const loaded = await loadConfig(testDir);

		expect(loaded?.prefix).toBe("FEAT");
		expect(loaded?.zeroPadding).toBe(4);
		expect(loaded?.projectName).toBe("My Project");
		expect(loaded?.defaultPriority).toBe("high");
		expect(loaded?.defaultLabels).toEqual(["backend", "api"]);
	});

	test("saves config as formatted JSON", async () => {
		const config: ForgeTasksConfig = {
			prefix: "TASK",
		};

		await saveConfig(testDir, config);

		const content = await readFile(join(testDir, "forge", "tasks", "config.json"), "utf-8");

		// Should be pretty-printed (contains newlines)
		expect(content).toContain("\n");
		// Should end with newline
		expect(content.endsWith("\n")).toBe(true);
	});

	test("overwrites existing config", async () => {
		const config1: ForgeTasksConfig = { prefix: "TASK" };
		const config2: ForgeTasksConfig = { prefix: "FEAT", zeroPadding: 5 };

		await saveConfig(testDir, config1);
		await saveConfig(testDir, config2);

		const loaded = await loadConfig(testDir);
		expect(loaded?.prefix).toBe("FEAT");
		expect(loaded?.zeroPadding).toBe(5);
	});
});

describe("listTaskFiles", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensureForgeDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns empty array when no task files exist", async () => {
		const files = await listTaskFiles(testDir);
		expect(files).toEqual([]);
	});

	test("returns only .md files", async () => {
		const tasksDir = join(testDir, "forge", "tasks");
		await writeFile(join(tasksDir, "TASK-001 - Test.md"), "content", "utf-8");
		await writeFile(join(tasksDir, "TASK-002 - Test.md"), "content", "utf-8");
		await writeFile(join(tasksDir, "notes.txt"), "content", "utf-8");
		await writeFile(join(tasksDir, "config.json"), "{}", "utf-8");

		const files = await listTaskFiles(testDir);

		expect(files).toHaveLength(2);
		expect(files).toContain("TASK-001 - Test.md");
		expect(files).toContain("TASK-002 - Test.md");
		expect(files).not.toContain("notes.txt");
		expect(files).not.toContain("config.json");
	});

	test("returns files sorted alphabetically", async () => {
		const tasksDir = join(testDir, "forge", "tasks");
		await writeFile(join(tasksDir, "TASK-003 - Third.md"), "content", "utf-8");
		await writeFile(join(tasksDir, "TASK-001 - First.md"), "content", "utf-8");
		await writeFile(join(tasksDir, "TASK-002 - Second.md"), "content", "utf-8");

		const files = await listTaskFiles(testDir);

		expect(files).toEqual([
			"TASK-001 - First.md",
			"TASK-002 - Second.md",
			"TASK-003 - Third.md",
		]);
	});

	test("returns empty array when tasks directory does not exist", async () => {
		// Use a fresh test dir without calling ensureForgeDirectory
		const freshDir = await createTestDir();
		try {
			const files = await listTaskFiles(freshDir);
			expect(files).toEqual([]);
		} finally {
			await cleanupTestDir(freshDir);
		}
	});
});

describe("readTaskFile / saveTaskFile", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("returns null when file does not exist", async () => {
		await ensureForgeDirectory(testDir);
		const content = await readTaskFile(testDir, "nonexistent.md");
		expect(content).toBeNull();
	});

	test("saves and reads task file successfully", async () => {
		const filename = "TASK-001 - Test Task.md";
		const content = `---
id: TASK-001
title: Test Task
status: To Do
---

## Description

Test content.
`;

		await saveTaskFile(testDir, filename, content);
		const loaded = await readTaskFile(testDir, filename);

		expect(loaded).toBe(content);
	});

	test("saveTaskFile creates directories if needed", async () => {
		// Don't call ensureForgeDirectory first
		const filename = "TASK-001 - Test.md";
		const content = "test content";

		await saveTaskFile(testDir, filename, content);

		// Verify file was created
		const loaded = await readTaskFile(testDir, filename);
		expect(loaded).toBe(content);
	});

	test("round-trip preserves content exactly", async () => {
		const filename = "TASK-042 - Complex Task.md";
		const content = `---
id: TASK-042
title: Complex Task
status: In Progress
priority: high
labels:
  - backend
  - api
---

## Description

This is a **markdown** description with:
- List items
- Multiple lines

## Implementation Plan

1. First step
2. Second step

<!-- AC:BEGIN -->
- [ ] #1 First criterion
- [x] #2 Second criterion
<!-- AC:END -->

## Implementation Notes

Notes here.
`;

		await saveTaskFile(testDir, filename, content);
		const loaded = await readTaskFile(testDir, filename);

		expect(loaded).toBe(content);
	});

	test("overwrites existing file", async () => {
		const filename = "TASK-001 - Test.md";

		await saveTaskFile(testDir, filename, "original content");
		await saveTaskFile(testDir, filename, "updated content");

		const loaded = await readTaskFile(testDir, filename);
		expect(loaded).toBe("updated content");
	});
});

describe("deleteTaskFile", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
		await ensureForgeDirectory(testDir);
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("deletes existing file", async () => {
		const filename = "TASK-001 - Test.md";
		await saveTaskFile(testDir, filename, "content");

		// Verify file exists
		const beforeDelete = await readTaskFile(testDir, filename);
		expect(beforeDelete).not.toBeNull();

		await deleteTaskFile(testDir, filename);

		// Verify file is deleted
		const afterDelete = await readTaskFile(testDir, filename);
		expect(afterDelete).toBeNull();
	});

	test("does not throw when deleting non-existent file", async () => {
		// Should not throw
		await deleteTaskFile(testDir, "nonexistent.md");
	});

	test("only deletes the specified file", async () => {
		await saveTaskFile(testDir, "TASK-001 - First.md", "first");
		await saveTaskFile(testDir, "TASK-002 - Second.md", "second");
		await saveTaskFile(testDir, "TASK-003 - Third.md", "third");

		await deleteTaskFile(testDir, "TASK-002 - Second.md");

		const files = await listTaskFiles(testDir);
		expect(files).toEqual(["TASK-001 - First.md", "TASK-003 - Third.md"]);
	});
});

describe("getTaskFilename", () => {
	test("generates filename from id and title", () => {
		const result = getTaskFilename({ id: "TASK-001", title: "Test Task" });
		expect(result).toBe("TASK-001 - Test Task.md");
	});

	test("handles spaces in title", () => {
		const result = getTaskFilename({
			id: "TASK-001",
			title: "This is a test task",
		});
		expect(result).toBe("TASK-001 - This is a test task.md");
	});

	test("removes unsafe filename characters", () => {
		const result = getTaskFilename({
			id: "TASK-001",
			title: 'Test <with> "unsafe" chars?',
		});
		expect(result).toBe("TASK-001 - Test with unsafe chars.md");
	});

	test("removes path separators", () => {
		const result = getTaskFilename({
			id: "TASK-001",
			title: "Path/with\\separators",
		});
		expect(result).toBe("TASK-001 - Pathwithseparators.md");
	});

	test("normalizes multiple spaces", () => {
		const result = getTaskFilename({
			id: "TASK-001",
			title: "Multiple    spaces   here",
		});
		expect(result).toBe("TASK-001 - Multiple spaces here.md");
	});

	test("trims whitespace from title", () => {
		const result = getTaskFilename({
			id: "TASK-001",
			title: "  Padded Title  ",
		});
		expect(result).toBe("TASK-001 - Padded Title.md");
	});

	test("handles different prefixes", () => {
		const result = getTaskFilename({ id: "FEAT-042", title: "Feature Task" });
		expect(result).toBe("FEAT-042 - Feature Task.md");
	});
});

describe("parseTaskIdFromFilename", () => {
	test("extracts ID from standard filename", () => {
		expect(parseTaskIdFromFilename("TASK-001 - Test Task.md")).toBe("TASK-001");
		expect(parseTaskIdFromFilename("TASK-42 - Another Task.md")).toBe(
			"TASK-42",
		);
	});

	test("handles different prefixes", () => {
		expect(parseTaskIdFromFilename("FEAT-001 - Feature.md")).toBe("FEAT-001");
		expect(parseTaskIdFromFilename("BUG-123 - Bug Fix.md")).toBe("BUG-123");
	});

	test("handles lowercase IDs", () => {
		expect(parseTaskIdFromFilename("task-001 - Test.md")).toBe("task-001");
	});

	test("returns null for invalid filename format", () => {
		expect(parseTaskIdFromFilename("invalid.md")).toBeNull();
		expect(parseTaskIdFromFilename("TASK-001.md")).toBeNull();
		expect(parseTaskIdFromFilename("TASK-001-Test.md")).toBeNull();
		expect(parseTaskIdFromFilename("Test Task.md")).toBeNull();
	});

	test("returns null for non-.md files", () => {
		expect(parseTaskIdFromFilename("TASK-001 - Test.txt")).toBeNull();
		expect(parseTaskIdFromFilename("TASK-001 - Test")).toBeNull();
	});

	test("handles complex titles", () => {
		expect(
			parseTaskIdFromFilename("TASK-001 - Fix the bug in user auth.md"),
		).toBe("TASK-001");
		expect(
			parseTaskIdFromFilename("TASK-999 - A Very Long Task Title.md"),
		).toBe("TASK-999");
	});

	test("handles zero-padded IDs", () => {
		expect(parseTaskIdFromFilename("TASK-0001 - Padded.md")).toBe("TASK-0001");
		expect(parseTaskIdFromFilename("TASK-00042 - More Padding.md")).toBe(
			"TASK-00042",
		);
	});
});
