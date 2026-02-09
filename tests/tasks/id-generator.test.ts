/**
 * Tests for id-generator.ts
 * Covers sequential ID generation, prefix handling, zero-padding, and collision detection
 */

import { describe, expect, test } from "vitest";
import {
	extractIdNumbers,
	formatId,
	generateNextId,
	isValidId,
	parseIdNumber,
} from "../../lib/tasks/id-generator.js";
import type { ForgeTasksConfig, Task } from "../../lib/tasks/task-types.js";

describe("parseIdNumber", () => {
	test("parses numeric part from standard ID", () => {
		expect(parseIdNumber("TASK-123", "TASK")).toBe(123);
		expect(parseIdNumber("TASK-1", "TASK")).toBe(1);
		expect(parseIdNumber("TASK-999", "TASK")).toBe(999);
	});

	test("handles case-insensitive matching", () => {
		expect(parseIdNumber("task-42", "TASK")).toBe(42);
		expect(parseIdNumber("TASK-42", "task")).toBe(42);
		expect(parseIdNumber("Task-42", "TASK")).toBe(42);
	});

	test("returns null for wrong prefix", () => {
		expect(parseIdNumber("FEAT-1", "TASK")).toBeNull();
		expect(parseIdNumber("BUG-123", "TASK")).toBeNull();
	});

	test("returns null for non-numeric suffix", () => {
		expect(parseIdNumber("TASK-abc", "TASK")).toBeNull();
		expect(parseIdNumber("TASK-12a", "TASK")).toBeNull();
		expect(parseIdNumber("TASK-", "TASK")).toBeNull();
	});

	test("returns null for malformed IDs", () => {
		expect(parseIdNumber("TASK123", "TASK")).toBeNull();
		expect(parseIdNumber("123", "TASK")).toBeNull();
		expect(parseIdNumber("", "TASK")).toBeNull();
		expect(parseIdNumber("TASK--1", "TASK")).toBeNull();
	});

	test("handles zero-padded IDs", () => {
		expect(parseIdNumber("TASK-001", "TASK")).toBe(1);
		expect(parseIdNumber("TASK-0042", "TASK")).toBe(42);
		expect(parseIdNumber("TASK-00000099", "TASK")).toBe(99);
	});

	test("handles whitespace in input", () => {
		expect(parseIdNumber("  TASK-1  ", "TASK")).toBe(1);
		expect(parseIdNumber("TASK-1", "  TASK  ")).toBe(1);
	});
});

describe("formatId", () => {
	test("formats ID without padding", () => {
		expect(formatId("TASK", 1)).toBe("TASK-1");
		expect(formatId("TASK", 42)).toBe("TASK-42");
		expect(formatId("TASK", 999)).toBe("TASK-999");
	});

	test("formats ID with zero-padding", () => {
		expect(formatId("TASK", 1, 3)).toBe("TASK-001");
		expect(formatId("TASK", 42, 3)).toBe("TASK-042");
		expect(formatId("TASK", 999, 3)).toBe("TASK-999");
	});

	test("handles different padding lengths", () => {
		expect(formatId("TASK", 1, 2)).toBe("TASK-01");
		expect(formatId("TASK", 1, 4)).toBe("TASK-0001");
		expect(formatId("TASK", 1, 5)).toBe("TASK-00001");
	});

	test("does not truncate when number exceeds padding", () => {
		expect(formatId("TASK", 1234, 3)).toBe("TASK-1234");
		expect(formatId("TASK", 99999, 3)).toBe("TASK-99999");
	});

	test("normalizes prefix to uppercase", () => {
		expect(formatId("task", 1)).toBe("TASK-1");
		expect(formatId("Task", 1)).toBe("TASK-1");
		expect(formatId("  task  ", 1)).toBe("TASK-1");
	});

	test("handles custom prefixes", () => {
		expect(formatId("FEAT", 1)).toBe("FEAT-1");
		expect(formatId("BUG", 42)).toBe("BUG-42");
		expect(formatId("JIRA", 100, 4)).toBe("JIRA-0100");
	});
});

describe("generateNextId", () => {
	const createTask = (id: string): Task => ({
		id,
		title: "Test",
		status: "To Do",
		createdAt: new Date(),
		updatedAt: new Date(),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	});

	describe("sequential ID generation", () => {
		test("generates TASK-1 for empty task list", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-1");
		});

		test("generates next sequential ID", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const tasks = [createTask("TASK-1"), createTask("TASK-2")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-3");
		});

		test("finds highest ID regardless of order", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const tasks = [
				createTask("TASK-5"),
				createTask("TASK-2"),
				createTask("TASK-10"),
				createTask("TASK-3"),
			];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-11");
		});
	});

	describe("handling gaps in existing IDs", () => {
		test("uses highest ID + 1, not filling gaps", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const tasks = [createTask("TASK-1"), createTask("TASK-5")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-6");
		});

		test("handles large gaps", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const tasks = [createTask("TASK-1"), createTask("TASK-100")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-101");
		});
	});

	describe("custom prefix handling", () => {
		test("uses configured prefix", () => {
			const config: ForgeTasksConfig = { prefix: "FEAT" };
			const result = generateNextId(config, []);
			expect(result).toBe("FEAT-1");
		});

		test("ignores tasks with different prefixes", () => {
			const config: ForgeTasksConfig = { prefix: "FEAT" };
			const tasks = [
				createTask("TASK-10"),
				createTask("FEAT-1"),
				createTask("BUG-5"),
			];

			const result = generateNextId(config, tasks);
			expect(result).toBe("FEAT-2");
		});

		test("defaults to TASK prefix when not configured", () => {
			const config: ForgeTasksConfig = { prefix: "" };
			// Note: The implementation uses DEFAULT_PREFIX = "TASK" when prefix is falsy
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-1");
		});
	});

	describe("zero-padding configuration", () => {
		test("applies zero-padding from config", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", zeroPadding: 3 };
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-001");
		});

		test("applies zero-padding to sequential IDs", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", zeroPadding: 4 };
			const tasks = [createTask("TASK-0001"), createTask("TASK-0002")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-0003");
		});

		test("handles mixed padded and non-padded existing IDs", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", zeroPadding: 3 };
			const tasks = [
				createTask("TASK-1"),
				createTask("TASK-002"),
				createTask("TASK-10"),
			];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-011");
		});
	});

	describe("collision detection", () => {
		test("never generates an existing ID", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const existingIds = ["TASK-1", "TASK-2", "TASK-3", "TASK-4", "TASK-5"];
			const tasks = existingIds.map(createTask);

			const result = generateNextId(config, tasks);

			expect(existingIds).not.toContain(result);
			expect(result).toBe("TASK-6");
		});

		test("handles case-insensitive collision detection", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const tasks = [createTask("task-1"), createTask("TASK-2")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-3");
		});
	});

	describe("lastIdNumber persistence (archiving support)", () => {
		test("uses lastIdNumber when tasks list is empty", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", lastIdNumber: 50 };
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-51");
		});

		test("uses lastIdNumber when higher than existing task IDs", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", lastIdNumber: 100 };
			const tasks = [createTask("TASK-1"), createTask("TASK-5")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-101");
		});

		test("uses highest task ID when higher than lastIdNumber", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", lastIdNumber: 10 };
			const tasks = [createTask("TASK-50"), createTask("TASK-25")];

			const result = generateNextId(config, tasks);
			expect(result).toBe("TASK-51");
		});

		test("applies zero-padding with lastIdNumber", () => {
			const config: ForgeTasksConfig = {
				prefix: "TASK",
				zeroPadding: 3,
				lastIdNumber: 50,
			};
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-051");
		});

		test("handles undefined lastIdNumber as 0", () => {
			const config: ForgeTasksConfig = {
				prefix: "TASK",
				lastIdNumber: undefined,
			};
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-1");
		});
	});
});

describe("extractIdNumbers", () => {
	const createTask = (id: string): Task => ({
		id,
		title: "Test",
		status: "To Do",
		createdAt: new Date(),
		updatedAt: new Date(),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	});

	test("extracts numbers from matching tasks", () => {
		const tasks = [
			createTask("TASK-1"),
			createTask("TASK-5"),
			createTask("TASK-10"),
		];

		const numbers = extractIdNumbers(tasks, "TASK");
		expect(numbers).toEqual([1, 5, 10]);
	});

	test("ignores tasks with different prefixes", () => {
		const tasks = [
			createTask("TASK-1"),
			createTask("FEAT-2"),
			createTask("TASK-3"),
			createTask("BUG-4"),
		];

		const numbers = extractIdNumbers(tasks, "TASK");
		expect(numbers).toEqual([1, 3]);
	});

	test("returns empty array for no matches", () => {
		const tasks = [createTask("FEAT-1"), createTask("BUG-2")];

		const numbers = extractIdNumbers(tasks, "TASK");
		expect(numbers).toEqual([]);
	});

	test("returns empty array for empty input", () => {
		const numbers = extractIdNumbers([], "TASK");
		expect(numbers).toEqual([]);
	});
});

describe("isValidId", () => {
	test("returns true for valid IDs", () => {
		expect(isValidId("TASK-1", "TASK")).toBe(true);
		expect(isValidId("TASK-123", "TASK")).toBe(true);
		expect(isValidId("TASK-001", "TASK")).toBe(true);
	});

	test("returns true for case-insensitive matches", () => {
		expect(isValidId("task-1", "TASK")).toBe(true);
		expect(isValidId("TASK-1", "task")).toBe(true);
	});

	test("returns false for wrong prefix", () => {
		expect(isValidId("FEAT-1", "TASK")).toBe(false);
		expect(isValidId("BUG-1", "TASK")).toBe(false);
	});

	test("returns false for invalid format", () => {
		expect(isValidId("TASK-abc", "TASK")).toBe(false);
		expect(isValidId("TASK123", "TASK")).toBe(false);
		expect(isValidId("", "TASK")).toBe(false);
	});
});
