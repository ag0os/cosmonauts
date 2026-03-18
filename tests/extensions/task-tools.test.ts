/**
 * Integration tests for task extension tools: task_list, task_view, task_search.
 *
 * These test the extension tool wiring (parameter handling, formatting,
 * details payload) against a real TaskManager on a temp directory.
 * The task_create and task_edit tools are covered in task-plan-linkage.test.ts.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi, type MockPi } from "../helpers/mocks/index.ts";

interface ToolResult {
	content: { type: string; text: string }[];
	details: unknown;
}

const tmp = useTempDir("task-tools-ext-");
let pi: MockPi;

async function setupExtension(cwd: string): Promise<MockPi> {
	const { default: tasksExtension } = await import(
		"../../domains/shared/extensions/tasks/index.ts"
	);
	const mock = createMockPi({ cwd });
	tasksExtension(mock as never);
	return mock;
}

beforeEach(async () => {
	const manager = new TaskManager(tmp.path);
	await manager.init();
	pi = await setupExtension(tmp.path);
});

// ── Seed helpers ─────────────────────────────────────────────────────────

async function seedTasks(): Promise<{ a: Task; b: Task; c: Task }> {
	const a = (await pi.callTool("task_create", {
		title: "Implement auth",
		priority: "high",
		labels: ["backend", "plan:alpha"],
		description: "Add JWT authentication",
	})) as ToolResult;
	const b = (await pi.callTool("task_create", {
		title: "Write tests",
		priority: "medium",
		labels: ["testing"],
	})) as ToolResult;
	const c = (await pi.callTool("task_create", {
		title: "Deploy to staging",
		priority: "low",
		labels: ["devops", "plan:alpha"],
	})) as ToolResult;
	return {
		a: a.details as Task,
		b: b.details as Task,
		c: c.details as Task,
	};
}

// ── task_list ────────────────────────────────────────────────────────────

describe("task_list", () => {
	test("returns 'No tasks found' when empty", async () => {
		const result = (await pi.callTool("task_list", {})) as ToolResult;

		expect(result.content[0]?.text).toBe("No tasks found");
		expect(result.details).toEqual([]);
	});

	test("lists all tasks with formatted output", async () => {
		const { a, b } = await seedTasks();
		const result = (await pi.callTool("task_list", {})) as ToolResult;

		const text = result.content[0]?.text ?? "";
		expect(text).toContain(a.id);
		expect(text).toContain("Implement auth");
		expect(text).toContain(b.id);
		expect(text).toContain("Write tests");
		expect((result.details as Task[]).length).toBe(3);
	});

	test("filters by status", async () => {
		const { a } = await seedTasks();
		await pi.callTool("task_edit", { taskId: a.id, status: "Done" });

		const result = (await pi.callTool("task_list", {
			status: "Done",
		})) as ToolResult;

		const tasks = result.details as Task[];
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.id).toBe(a.id);
	});

	test("filters by priority", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_list", {
			priority: "high",
		})) as ToolResult;

		const tasks = result.details as Task[];
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.title).toBe("Implement auth");
	});

	test("filters by label", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_list", {
			label: "plan:alpha",
		})) as ToolResult;

		const tasks = result.details as Task[];
		expect(tasks).toHaveLength(2);
	});
});

// ── task_view ────────────────────────────────────────────────────────────

describe("task_view", () => {
	test("returns not found for nonexistent task", async () => {
		const result = (await pi.callTool("task_view", {
			taskId: "TASK-999",
		})) as ToolResult;

		expect(result.content[0]?.text).toBe("Task not found: TASK-999");
		expect(result.details).toBeNull();
	});

	test("returns task details with all fields", async () => {
		const { a } = await seedTasks();
		const result = (await pi.callTool("task_view", {
			taskId: a.id,
		})) as ToolResult;

		const text = result.content[0]?.text ?? "";
		expect(text).toContain(`${a.id}: Implement auth`);
		expect(text).toContain("Status: To Do");
		expect(text).toContain("Priority: high");
		expect(text).toContain("Labels: backend, plan:alpha");
		expect(text).toContain("Description:\nAdd JWT authentication");

		const task = result.details as Task;
		expect(task.id).toBe(a.id);
		expect(task.title).toBe("Implement auth");
	});

	test("includes acceptance criteria in output", async () => {
		const created = (await pi.callTool("task_create", {
			title: "With ACs",
			acceptanceCriteria: ["Tests pass", "No regressions"],
		})) as ToolResult;
		const task = created.details as Task;

		const result = (await pi.callTool("task_view", {
			taskId: task.id,
		})) as ToolResult;

		const text = result.content[0]?.text ?? "";
		expect(text).toContain("Acceptance Criteria:");
		expect(text).toContain("[ ] #1 Tests pass");
		expect(text).toContain("[ ] #2 No regressions");
	});

	test("includes implementation plan and notes when present", async () => {
		const created = (await pi.callTool("task_create", {
			title: "Detailed task",
		})) as ToolResult;
		const task = created.details as Task;

		await pi.callTool("task_edit", {
			taskId: task.id,
			implementationPlan: "Step 1: Do thing\nStep 2: Verify",
			implementationNotes: "Completed step 1",
		});

		const result = (await pi.callTool("task_view", {
			taskId: task.id,
		})) as ToolResult;

		const text = result.content[0]?.text ?? "";
		expect(text).toContain("Implementation Plan:\nStep 1: Do thing");
		expect(text).toContain("Implementation Notes:\nCompleted step 1");
	});

	test("includes dependencies in output", async () => {
		const first = (await pi.callTool("task_create", {
			title: "First",
		})) as ToolResult;
		const firstTask = first.details as Task;

		const second = (await pi.callTool("task_create", {
			title: "Second",
			dependencies: [firstTask.id],
		})) as ToolResult;
		const secondTask = second.details as Task;

		const result = (await pi.callTool("task_view", {
			taskId: secondTask.id,
		})) as ToolResult;

		expect(result.content[0]?.text).toContain(`Dependencies: ${firstTask.id}`);
	});
});

// ── task_search ──────────────────────────────────────────────────────────

describe("task_search", () => {
	test("returns no results message when nothing matches", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_search", {
			query: "nonexistent-term",
		})) as ToolResult;

		expect(result.content[0]?.text).toContain(
			'No tasks found matching "nonexistent-term"',
		);
		expect(result.details).toEqual([]);
	});

	test("finds tasks by title keyword", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_search", {
			query: "auth",
		})) as ToolResult;

		const tasks = result.details as Task[];
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.title).toBe("Implement auth");
		expect(result.content[0]?.text).toContain("Found 1 task(s)");
	});

	test("finds tasks by description content", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_search", {
			query: "JWT",
		})) as ToolResult;

		const tasks = result.details as Task[];
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.title).toBe("Implement auth");
	});

	test("combines search with status filter", async () => {
		const { a } = await seedTasks();
		await pi.callTool("task_edit", { taskId: a.id, status: "Done" });

		const doneResult = (await pi.callTool("task_search", {
			query: "auth",
			status: "Done",
		})) as ToolResult;
		expect(doneResult.details as Task[]).toHaveLength(1);

		const todoResult = (await pi.callTool("task_search", {
			query: "auth",
			status: "To Do",
		})) as ToolResult;
		expect(todoResult.details as Task[]).toHaveLength(0);
	});

	test("combines search with priority filter", async () => {
		await seedTasks();

		const result = (await pi.callTool("task_search", {
			query: "Implement",
			priority: "low",
		})) as ToolResult;

		expect(result.details as Task[]).toHaveLength(0);
	});
});
