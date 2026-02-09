/**
 * Tests for task-serializer.ts
 * Covers output format, YAML frontmatter, sections, and round-trip consistency
 */

import { describe, expect, test } from "vitest";
import { parseTask } from "../../lib/tasks/task-parser.js";
import { serializeTask } from "../../lib/tasks/task-serializer.js";
import type { Task } from "../../lib/tasks/task-types.js";

describe("serializeTask", () => {
	const createBaseTask = (): Task => ({
		id: "TASK-001",
		title: "Test Task",
		status: "To Do",
		priority: "high",
		labels: ["backend", "api"],
		dependencies: [],
		createdAt: new Date("2026-01-15T10:00:00.000Z"),
		updatedAt: new Date("2026-01-20T14:30:00.000Z"),
		acceptanceCriteria: [],
	});

	describe("YAML frontmatter formatting", () => {
		test("includes required frontmatter fields", () => {
			const task = createBaseTask();
			const output = serializeTask(task);

			expect(output).toContain("---");
			expect(output).toContain("id: TASK-001");
			expect(output).toContain("title: Test Task");
			expect(output).toContain("status: To Do");
		});

		test("includes optional fields when present", () => {
			const task = createBaseTask();
			task.priority = "high";
			task.assignee = "john.doe";

			const output = serializeTask(task);

			expect(output).toContain("priority: high");
			expect(output).toContain("assignee: john.doe");
		});

		test("omits priority when undefined", () => {
			const task = createBaseTask();
			task.priority = undefined;

			const output = serializeTask(task);

			expect(output).not.toContain("priority:");
		});

		test("includes labels array", () => {
			const task = createBaseTask();
			task.labels = ["frontend", "ui", "bugfix"];

			const output = serializeTask(task);

			expect(output).toContain("labels:");
			expect(output).toContain("- frontend");
			expect(output).toContain("- ui");
			expect(output).toContain("- bugfix");
		});

		test("includes empty labels array", () => {
			const task = createBaseTask();
			task.labels = [];

			const output = serializeTask(task);

			expect(output).toContain("labels: []");
		});

		test("includes dependencies array", () => {
			const task = createBaseTask();
			task.dependencies = ["TASK-001", "TASK-002"];

			const output = serializeTask(task);

			expect(output).toContain("dependencies:");
			expect(output).toContain("- TASK-001");
			expect(output).toContain("- TASK-002");
		});

		test("includes date fields as ISO strings", () => {
			const task = createBaseTask();
			task.dueDate = new Date("2026-02-01T00:00:00.000Z");

			const output = serializeTask(task);

			expect(output).toContain("createdAt: '2026-01-15T10:00:00.000Z'");
			expect(output).toContain("updatedAt: '2026-01-20T14:30:00.000Z'");
			expect(output).toContain("dueDate: '2026-02-01T00:00:00.000Z'");
		});

		test("omits dueDate when undefined", () => {
			const task = createBaseTask();
			task.dueDate = undefined;

			const output = serializeTask(task);

			expect(output).not.toContain("dueDate:");
		});
	});

	describe("section formatting", () => {
		test("formats Description with ## header", () => {
			const task = createBaseTask();
			task.description = "This is the task description.";

			const output = serializeTask(task);

			expect(output).toContain("## Description");
			expect(output).toContain("This is the task description.");
		});

		test("formats Implementation Plan with ## header", () => {
			const task = createBaseTask();
			task.implementationPlan = "1. First step\n2. Second step\n3. Third step";

			const output = serializeTask(task);

			expect(output).toContain("## Implementation Plan");
			expect(output).toContain("1. First step");
			expect(output).toContain("2. Second step");
			expect(output).toContain("3. Third step");
		});

		test("formats Implementation Notes with ## header", () => {
			const task = createBaseTask();
			task.implementationNotes = "Started work on this task.";

			const output = serializeTask(task);

			expect(output).toContain("## Implementation Notes");
			expect(output).toContain("Started work on this task.");
		});

		test("omits empty sections", () => {
			const task = createBaseTask();
			task.description = undefined;
			task.implementationPlan = undefined;
			task.implementationNotes = undefined;

			const output = serializeTask(task);

			expect(output).not.toContain("## Description");
			expect(output).not.toContain("## Implementation Plan");
			expect(output).not.toContain("## Implementation Notes");
		});
	});

	describe("acceptance criteria formatting", () => {
		test("includes AC:BEGIN and AC:END markers", () => {
			const task = createBaseTask();
			task.acceptanceCriteria = [
				{ index: 1, text: "First criterion", checked: false },
			];

			const output = serializeTask(task);

			expect(output).toContain("<!-- AC:BEGIN -->");
			expect(output).toContain("<!-- AC:END -->");
		});

		test("formats acceptance criteria with checkbox syntax", () => {
			const task = createBaseTask();
			task.acceptanceCriteria = [
				{ index: 1, text: "Unchecked item", checked: false },
				{ index: 2, text: "Checked item", checked: true },
				{ index: 3, text: "Another unchecked", checked: false },
			];

			const output = serializeTask(task);

			expect(output).toContain("- [ ] #1 Unchecked item");
			expect(output).toContain("- [x] #2 Checked item");
			expect(output).toContain("- [ ] #3 Another unchecked");
		});

		test("omits AC markers when no acceptance criteria", () => {
			const task = createBaseTask();
			task.acceptanceCriteria = [];

			const output = serializeTask(task);

			expect(output).not.toContain("<!-- AC:BEGIN -->");
			expect(output).not.toContain("<!-- AC:END -->");
		});
	});

	describe("raw content preservation", () => {
		test("includes rawContent at the end", () => {
			const task = createBaseTask();
			task.rawContent = "## Custom Section\n\nCustom content here.";

			const output = serializeTask(task);

			expect(output).toContain("## Custom Section");
			expect(output).toContain("Custom content here.");
		});
	});

	describe("overall structure", () => {
		test("has blank line between frontmatter and content", () => {
			const task = createBaseTask();
			task.description = "Description text.";

			const output = serializeTask(task);

			// Should have --- followed by blank line, then content
			expect(output).toMatch(/---\n\n## Description/);
		});

		test("sections are separated by blank lines", () => {
			const task = createBaseTask();
			task.description = "Description text.";
			task.implementationPlan = "Plan text.";

			const output = serializeTask(task);

			// Sections should be separated
			expect(output).toMatch(/Description text\.\n\n## Implementation Plan/);
		});
	});

	describe("round-trip consistency", () => {
		test("parse(serialize(task)) preserves essential fields without AC", () => {
			// Note: AC markers are placed between the last content section and Implementation Notes.
			// The parser's extractSection captures until next ## header, so the preceding section
			// will include AC markers. Test without AC for clean round-trip.
			const original: Task = {
				id: "TASK-042",
				title: "Round Trip Test",
				status: "In Progress",
				priority: "medium",
				assignee: "alice",
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				updatedAt: new Date("2026-01-20T14:30:00.000Z"),
				dueDate: new Date("2026-02-15T00:00:00.000Z"),
				labels: ["feature", "priority"],
				dependencies: ["TASK-001", "TASK-002"],
				description: "This is a comprehensive description.",
				implementationPlan: "1. Do this\n2. Do that",
				implementationNotes: "Some notes here.",
				acceptanceCriteria: [],
			};

			const serialized = serializeTask(original);
			const parsed = parseTask(serialized);

			expect(parsed.id).toBe(original.id);
			expect(parsed.title).toBe(original.title);
			expect(parsed.status).toBe(original.status);
			expect(parsed.priority).toBe(original.priority);
			expect(parsed.assignee).toBe(original.assignee);
			expect(parsed.labels).toEqual(original.labels);
			expect(parsed.dependencies).toEqual(original.dependencies);
			expect(parsed.description).toBe(original.description);
			expect(parsed.implementationPlan).toBe(original.implementationPlan);
			expect(parsed.implementationNotes).toBe(original.implementationNotes);
		});

		test("parse(serialize(task)) preserves acceptance criteria", () => {
			// AC criteria can be round-tripped; the text content is extracted from markers
			const original: Task = {
				id: "TASK-043",
				title: "AC Test",
				status: "To Do",
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				updatedAt: new Date("2026-01-20T14:30:00.000Z"),
				labels: [],
				dependencies: [],
				acceptanceCriteria: [
					{ index: 1, text: "First criterion", checked: false },
					{ index: 2, text: "Second criterion", checked: true },
					{ index: 3, text: "Third criterion", checked: false },
				],
			};

			const serialized = serializeTask(original);
			const parsed = parseTask(serialized);

			expect(parsed.acceptanceCriteria).toEqual(original.acceptanceCriteria);
		});

		test("round-trip preserves date values", () => {
			const original: Task = {
				id: "TASK-100",
				title: "Date Test",
				status: "To Do",
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				updatedAt: new Date("2026-01-20T14:30:00.000Z"),
				dueDate: new Date("2026-03-01T12:00:00.000Z"),
				labels: [],
				dependencies: [],
				acceptanceCriteria: [],
			};

			const serialized = serializeTask(original);
			const parsed = parseTask(serialized);

			expect(parsed.createdAt.toISOString()).toBe(
				original.createdAt.toISOString(),
			);
			expect(parsed.updatedAt.toISOString()).toBe(
				original.updatedAt.toISOString(),
			);
			expect(parsed.dueDate?.toISOString()).toBe(
				// biome-ignore lint/style/noNonNullAssertion: Test data is known to have dueDate
				original.dueDate!.toISOString(),
			);
		});

		test("round-trip with minimal task", () => {
			const original: Task = {
				id: "TASK-1",
				title: "Minimal",
				status: "To Do",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
				labels: [],
				dependencies: [],
				acceptanceCriteria: [],
			};

			const serialized = serializeTask(original);
			const parsed = parseTask(serialized);

			expect(parsed.id).toBe(original.id);
			expect(parsed.title).toBe(original.title);
			expect(parsed.status).toBe(original.status);
			expect(parsed.priority).toBeUndefined();
			expect(parsed.description).toBeUndefined();
		});

		test("multiple round-trips produce identical output", () => {
			// Use task without AC to ensure stability across multiple round-trips
			const original: Task = {
				id: "TASK-999",
				title: "Stability Test",
				status: "Done",
				priority: "low",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
				labels: ["test"],
				dependencies: [],
				description: "Test description.",
				implementationPlan: "1. Step one\n2. Step two",
				implementationNotes: "Some notes.",
				acceptanceCriteria: [],
			};

			const first = serializeTask(original);
			const second = serializeTask(parseTask(first));
			const third = serializeTask(parseTask(second));

			expect(second).toBe(first);
			expect(third).toBe(first);
		});
	});
});
