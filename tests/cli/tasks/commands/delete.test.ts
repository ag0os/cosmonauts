import "../../../helpers/readline.ts";
import { describe, expect, it, vi } from "vitest";
import type { TaskDeleteResult } from "../../../../cli/tasks/commands/delete.ts";
import {
	confirmTaskDeletion,
	loadTaskForDeletion,
	registerDeleteCommand,
	renderTaskDeleteResult,
} from "../../../../cli/tasks/commands/delete.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../../lib/tasks/task-types.ts";
import {
	runCommonDeleteCommandTests,
	setupDeleteCommandContext,
} from "../../../helpers/delete-command-tests.ts";
import { getReadlineMocks } from "../../../helpers/readline.ts";
import {
	createInitializedTaskManager,
	createTaskFixture,
} from "../../../helpers/tasks.ts";

const readlineMocks = getReadlineMocks();

describe("renderTaskDeleteResult", () => {
	const task: Task = {
		id: "TASK-001",
		title: "Rendered Task",
		status: "To Do",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	};

	it("returns deleted JSON output", () => {
		const result: TaskDeleteResult = { status: "deleted", task };

		expect(renderTaskDeleteResult(result, "json")).toEqual({
			deleted: true,
			id: "TASK-001",
			title: "Rendered Task",
		});
	});

	it("returns deleted plain output", () => {
		expect(
			renderTaskDeleteResult({ status: "deleted", task }, "plain"),
		).toEqual(["deleted TASK-001"]);
	});

	it("returns deleted human output", () => {
		expect(
			renderTaskDeleteResult({ status: "deleted", task }, "human"),
		).toEqual(["Deleted task TASK-001: Rendered Task"]);
	});

	it("returns cancelled JSON output", () => {
		const result: TaskDeleteResult = { status: "cancelled", task };

		expect(renderTaskDeleteResult(result, "json")).toEqual({
			cancelled: true,
			id: "TASK-001",
		});
	});

	it("returns cancelled plain output", () => {
		expect(
			renderTaskDeleteResult({ status: "cancelled", task }, "plain"),
		).toEqual(["cancelled"]);
	});

	it("returns cancelled human output", () => {
		expect(
			renderTaskDeleteResult({ status: "cancelled", task }, "human"),
		).toEqual(["Deletion cancelled."]);
	});
});

describe("task delete command", () => {
	const getContext = setupDeleteCommandContext("task-delete-command-test-");

	runCommonDeleteCommandTests<Task, TaskManager>({
		entityName: "task",
		registerDeleteCommand,
		getContext,
		forceCase: {
			create: async (tempDir) => {
				const { manager, task } = await createTaskInTempDir(
					tempDir,
					"Remove Me",
				);
				return { manager, entity: task };
			},
			id: (task) => task.id,
			get: (manager, id) => manager.getTask(id),
			args: () => ["delete", "TASK-001", "--force"],
			expectedStdout: "Deleted task TASK-001: Remove Me\n",
		},
		notFound: {
			setup: async (tempDir) => {
				await createInitializedTaskManager(tempDir, "TASK");
			},
			id: "TASK-404",
			jsonError: '{\n  "error": "Task not found: TASK-404"\n}\n',
			humanError: "Error: Task not found: TASK-404\n",
		},
		cancellation: {
			create: async (tempDir) => {
				const { manager, task } = await createTaskInTempDir(tempDir, "Keep Me");
				return { manager, entity: task };
			},
			id: (task) => task.id,
			get: (manager, id) => manager.getTask(id),
			spyOnDelete: () => vi.spyOn(TaskManager.prototype, "deleteTask"),
			jsonStdout: '{\n  "cancelled": true,\n  "id": "TASK-001"\n}\n',
		},
		managerError: {
			create: async (tempDir) => {
				await createTaskInTempDir(tempDir, "Delete Fails");
			},
			mockFailure: mockDeleteTaskFailure,
			id: "TASK-001",
			jsonStdout: '{\n  "error": "Error deleting task: Error: disk full"\n}\n',
			humanStderr: "Error deleting task: Error: disk full\n",
		},
	});

	it("loads an existing task for deletion", async () => {
		const { tempDir } = getContext();
		const { manager, task } = await createTaskInTempDir(tempDir, "Load Me");

		await expect(loadTaskForDeletion(manager, task.id)).resolves.toEqual({
			ok: true,
			value: task,
		});
	});

	it("returns a parse error when the task cannot be loaded", async () => {
		const { tempDir } = getContext();
		const manager = await createInitializedTaskManager(tempDir, "TASK");

		await expect(loadTaskForDeletion(manager, "TASK-404")).resolves.toEqual({
			ok: false,
			error: "Task not found: TASK-404",
		});
	});

	it("confirms deletion without prompting when force is set", async () => {
		const { tempDir } = getContext();
		const { task } = await createTaskInTempDir(tempDir, "Forced");

		await expect(confirmTaskDeletion(task, true)).resolves.toBe(true);
		expect(readlineMocks.question).not.toHaveBeenCalled();
	});
});

async function createTaskInTempDir(
	tempDir: string,
	title: string,
): Promise<{ manager: TaskManager; task: Task }> {
	const manager = await createInitializedTaskManager(tempDir, "TASK");
	const task = await createTaskFixture(manager, { title });
	return { manager, task };
}

function mockDeleteTaskFailure(): void {
	vi.spyOn(TaskManager.prototype, "deleteTask").mockRejectedValue(
		new Error("disk full"),
	);
}
