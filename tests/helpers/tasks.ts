import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task, TaskCreateInput } from "../../lib/tasks/task-types.ts";

export async function createInitializedTaskManager(
	projectRoot: string,
	prefix = "TEST",
): Promise<TaskManager> {
	const manager = new TaskManager(projectRoot);
	await manager.init({ prefix });
	return manager;
}

export async function createTaskFixture(
	manager: TaskManager,
	overrides: Partial<TaskCreateInput> = {},
): Promise<Task> {
	return manager.createTask({
		title: "Fixture Task",
		...overrides,
	});
}

export function createTaskRecordFixture(overrides: Partial<Task> = {}): Task {
	return {
		id: "TASK-001",
		title: "Rendered Task",
		status: "To Do",
		priority: "high",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
		...overrides,
	};
}
