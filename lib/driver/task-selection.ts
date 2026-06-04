import type { TaskManager } from "../tasks/task-manager.ts";

export async function listPendingPlanTaskIds(
	taskManager: TaskManager,
	planSlug: string,
): Promise<string[]> {
	const tasks = await taskManager.listTasks({ label: `plan:${planSlug}` });
	return tasks.filter((task) => task.status !== "Done").map((task) => task.id);
}
