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
import type { ForgeTasksConfig } from "../../lib/tasks/task-types.js";

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
	describe("sequential ID generation", () => {
		test("generates TASK-1 for an empty ID set @cosmo-behavior plan:task-id-system#B-001", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-1");
		});

		test("generates next sequential ID", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-1", "TASK-2"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-3");
		});

		test("finds highest ID regardless of order", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-5", "TASK-2", "TASK-10", "TASK-3"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-11");
		});
	});

	describe("handling gaps in existing IDs", () => {
		test("uses highest ID + 1, not filling gaps", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-1", "TASK-5"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-6");
		});

		test("handles large gaps", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-1", "TASK-100"];

			const result = generateNextId(config, ids);
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
			const ids = ["TASK-10", "FEAT-1", "BUG-5"];

			const result = generateNextId(config, ids);
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
			const ids = ["TASK-0001", "TASK-0002"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-0003");
		});

		test("handles mixed padded and non-padded existing IDs", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", zeroPadding: 3 };
			const ids = ["TASK-1", "TASK-002", "TASK-10"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-011");
		});
	});

	describe("collision detection", () => {
		test("never generates an existing ID", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const existingIds = ["TASK-1", "TASK-2", "TASK-3", "TASK-4", "TASK-5"];

			const result = generateNextId(config, existingIds);

			expect(existingIds).not.toContain(result);
			expect(result).toBe("TASK-6");
		});

		test("handles case-insensitive collision detection", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["task-1", "TASK-2"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-3");
		});
	});

	describe("supplied ID set allocation", () => {
		test("returns first configured padded ID for an empty ID set @cosmo-behavior plan:task-id-system#B-001", () => {
			const config: ForgeTasksConfig = { prefix: "TASK", zeroPadding: 3 };
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-001");
		});

		test("allocates highest+1 across supplied IDs @cosmo-behavior plan:task-id-system#B-002", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-5", "task-10", "FEAT-99", "TASK-7"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-11");
		});

		test("does not fill gaps across supplied IDs @cosmo-behavior plan:task-id-system#B-002", () => {
			const config: ForgeTasksConfig = { prefix: "TASK" };
			const ids = ["TASK-1", "TASK-4"];

			const result = generateNextId(config, ids);
			expect(result).toBe("TASK-5");
		});

		test("ignores lastIdNumber even when it is higher than supplied IDs", () => {
			const config = { prefix: "TASK", lastIdNumber: 50 };
			const result = generateNextId(config, ["TASK-2"]);

			expect(result).toBe("TASK-3");
		});

		test("ignores lastIdNumber for an empty ID set", () => {
			const config = {
				prefix: "TASK",
				zeroPadding: 3,
				lastIdNumber: 50,
			};
			const result = generateNextId(config, []);
			expect(result).toBe("TASK-001");
		});
	});
});

describe("extractIdNumbers", () => {
	test("extracts numbers from matching IDs @cosmo-behavior plan:task-id-system#B-002", () => {
		const ids = ["TASK-1", "TASK-5", "TASK-10"];

		const numbers = extractIdNumbers(ids, "TASK");
		expect(numbers).toEqual([1, 5, 10]);
	});

	test("ignores IDs with different prefixes @cosmo-behavior plan:task-id-system#B-002", () => {
		const ids = ["TASK-1", "FEAT-2", "TASK-3", "BUG-4"];

		const numbers = extractIdNumbers(ids, "TASK");
		expect(numbers).toEqual([1, 3]);
	});

	test("returns empty array for no matches", () => {
		const ids = ["FEAT-1", "BUG-2"];

		const numbers = extractIdNumbers(ids, "TASK");
		expect(numbers).toEqual([]);
	});

	test("returns empty array for empty input @cosmo-behavior plan:task-id-system#B-001", () => {
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
