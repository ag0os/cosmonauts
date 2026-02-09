/**
 * Tests for task-parser.ts
 * Covers YAML frontmatter parsing, section extraction, and acceptance criteria parsing
 */

import { describe, expect, test } from "vitest";
import { parseTask } from "../../lib/tasks/task-parser.js";

describe("parseTask", () => {
	describe("YAML frontmatter parsing", () => {
		test("parses basic frontmatter fields", () => {
			const content = `---
id: TASK-001
title: Test Task
status: To Do
priority: high
---

## Description

Test description.
`;
			const task = parseTask(content);

			expect(task.id).toBe("TASK-001");
			expect(task.title).toBe("Test Task");
			expect(task.status).toBe("To Do");
			expect(task.priority).toBe("high");
		});

		test("parses all valid status values", () => {
			const statuses: Array<"To Do" | "In Progress" | "Done" | "Blocked"> = [
				"To Do",
				"In Progress",
				"Done",
				"Blocked",
			];

			for (const status of statuses) {
				const content = `---
id: TASK-1
title: Test
status: ${status}
---
`;
				const task = parseTask(content);
				expect(task.status).toBe(status);
			}
		});

		test("normalizes case-insensitive status", () => {
			const content = `---
id: TASK-1
title: Test
status: in progress
---
`;
			const task = parseTask(content);
			expect(task.status).toBe("In Progress");
		});

		test("defaults to 'To Do' for invalid status", () => {
			const content = `---
id: TASK-1
title: Test
status: invalid
---
`;
			const task = parseTask(content);
			expect(task.status).toBe("To Do");
		});

		test("parses all valid priority values", () => {
			const priorities: Array<"high" | "medium" | "low"> = [
				"high",
				"medium",
				"low",
			];

			for (const priority of priorities) {
				const content = `---
id: TASK-1
title: Test
status: To Do
priority: ${priority}
---
`;
				const task = parseTask(content);
				expect(task.priority).toBe(priority);
			}
		});

		test("returns undefined for invalid priority", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
priority: urgent
---
`;
			const task = parseTask(content);
			expect(task.priority).toBeUndefined();
		});

		test("parses labels as array", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
labels:
  - backend
  - api
  - urgent
---
`;
			const task = parseTask(content);
			expect(task.labels).toEqual(["backend", "api", "urgent"]);
		});

		test("parses single label as array", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
labels: backend
---
`;
			const task = parseTask(content);
			expect(task.labels).toEqual(["backend"]);
		});

		test("handles missing labels gracefully", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---
`;
			const task = parseTask(content);
			expect(task.labels).toEqual([]);
		});

		test("parses dependencies as array", () => {
			const content = `---
id: TASK-3
title: Test
status: To Do
dependencies:
  - TASK-1
  - TASK-2
---
`;
			const task = parseTask(content);
			expect(task.dependencies).toEqual(["TASK-1", "TASK-2"]);
		});

		test("parses date fields", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
createdAt: 2026-01-15T10:00:00.000Z
updatedAt: 2026-01-20T14:30:00.000Z
dueDate: 2026-02-01T00:00:00.000Z
---
`;
			const task = parseTask(content);

			expect(task.createdAt).toBeInstanceOf(Date);
			expect(task.updatedAt).toBeInstanceOf(Date);
			expect(task.dueDate).toBeInstanceOf(Date);
			expect(task.createdAt.toISOString()).toBe("2026-01-15T10:00:00.000Z");
			expect(task.updatedAt.toISOString()).toBe("2026-01-20T14:30:00.000Z");
			expect(task.dueDate?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
		});

		test("defaults createdAt and updatedAt to current date when missing", () => {
			const before = new Date();
			const content = `---
id: TASK-1
title: Test
status: To Do
---
`;
			const task = parseTask(content);
			const after = new Date();

			expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(task.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
			expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(task.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		test("parses assignee field", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
assignee: john.doe
---
`;
			const task = parseTask(content);
			expect(task.assignee).toBe("john.doe");
		});
	});

	describe("section extraction", () => {
		test("extracts Description section", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

This is the task description.
It can span multiple lines.

## Implementation Plan

Some plan here.
`;
			const task = parseTask(content);
			expect(task.description).toBe(
				"This is the task description.\nIt can span multiple lines.",
			);
		});

		test("extracts Implementation Plan section", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Brief description.

## Implementation Plan

1. First step
2. Second step
3. Third step
`;
			const task = parseTask(content);
			expect(task.implementationPlan).toBe(
				"1. First step\n2. Second step\n3. Third step",
			);
		});

		test("extracts Implementation Notes section", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Description here.

## Implementation Notes

Started working on this.
Found an edge case to handle.
`;
			const task = parseTask(content);
			expect(task.implementationNotes).toBe(
				"Started working on this.\nFound an edge case to handle.",
			);
		});

		test("handles missing sections gracefully", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Only description present.
`;
			const task = parseTask(content);

			expect(task.description).toBe("Only description present.");
			expect(task.implementationPlan).toBeUndefined();
			expect(task.implementationNotes).toBeUndefined();
		});

		test("handles empty file body", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---
`;
			const task = parseTask(content);

			expect(task.description).toBeUndefined();
			expect(task.implementationPlan).toBeUndefined();
			expect(task.implementationNotes).toBeUndefined();
		});

		test("extracts sections case-insensitively", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## DESCRIPTION

Uppercase header.

## implementation plan

Lowercase header.
`;
			const task = parseTask(content);

			expect(task.description).toBe("Uppercase header.");
			expect(task.implementationPlan).toBe("Lowercase header.");
		});
	});

	describe("acceptance criteria parsing", () => {
		test("parses acceptance criteria from AC:BEGIN/AC:END markers", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Test description.

<!-- AC:BEGIN -->
- [ ] #1 Write unit tests
- [x] #2 Implement the feature
- [ ] #3 Update documentation
<!-- AC:END -->
`;
			const task = parseTask(content);

			expect(task.acceptanceCriteria).toHaveLength(3);
			expect(task.acceptanceCriteria[0]).toEqual({
				index: 1,
				text: "Write unit tests",
				checked: false,
			});
			expect(task.acceptanceCriteria[1]).toEqual({
				index: 2,
				text: "Implement the feature",
				checked: true,
			});
			expect(task.acceptanceCriteria[2]).toEqual({
				index: 3,
				text: "Update documentation",
				checked: false,
			});
		});

		test("parses checkbox format - [ ] #N text", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

<!-- AC:BEGIN -->
- [ ] #1 Unchecked item
- [x] #2 Checked item
<!-- AC:END -->
`;
			const task = parseTask(content);

			expect(task.acceptanceCriteria[0]?.checked).toBe(false);
			expect(task.acceptanceCriteria[1]?.checked).toBe(true);
		});

		test("handles empty acceptance criteria", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

No acceptance criteria here.
`;
			const task = parseTask(content);
			expect(task.acceptanceCriteria).toEqual([]);
		});

		test("handles empty AC markers", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

<!-- AC:BEGIN -->
<!-- AC:END -->
`;
			const task = parseTask(content);
			expect(task.acceptanceCriteria).toEqual([]);
		});

		test("parses legacy acceptance criteria format without AC markers", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Acceptance Criteria

- [ ] First criterion
- [x] Second criterion
- [ ] Third criterion
`;
			const task = parseTask(content);

			expect(task.acceptanceCriteria).toHaveLength(3);
			expect(task.acceptanceCriteria[0]).toEqual({
				index: 1,
				text: "First criterion",
				checked: false,
			});
			expect(task.acceptanceCriteria[1]).toEqual({
				index: 2,
				text: "Second criterion",
				checked: true,
			});
		});

		test("assigns sequential indices to legacy format", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Acceptance Criteria

- [ ] Item one
- [ ] Item two
- [ ] Item three
`;
			const task = parseTask(content);

			expect(task.acceptanceCriteria[0]?.index).toBe(1);
			expect(task.acceptanceCriteria[1]?.index).toBe(2);
			expect(task.acceptanceCriteria[2]?.index).toBe(3);
		});
	});

	describe("rawContent preservation", () => {
		test("preserves unrecognized content in rawContent", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Description text.

## Custom Section

This is custom content that should be preserved.

Some more custom text.
`;
			const task = parseTask(content);

			expect(task.rawContent).toContain("## Custom Section");
			expect(task.rawContent).toContain(
				"This is custom content that should be preserved.",
			);
		});

		test("returns undefined rawContent when all content is recognized", () => {
			const content = `---
id: TASK-1
title: Test
status: To Do
---

## Description

Just a description.
`;
			const task = parseTask(content);
			expect(task.rawContent).toBeUndefined();
		});
	});

	describe("line ending normalization", () => {
		test("handles CRLF line endings", () => {
			const content =
				"---\r\nid: TASK-1\r\ntitle: Test\r\nstatus: To Do\r\n---\r\n\r\n## Description\r\n\r\nDescription text.\r\n";

			const task = parseTask(content);

			expect(task.id).toBe("TASK-1");
			expect(task.description).toBe("Description text.");
		});
	});
});
