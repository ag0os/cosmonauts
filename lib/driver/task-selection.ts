import type { TaskManager } from "../tasks/task-manager.ts";
import { isTaskClosed } from "../tasks/task-types.ts";

export async function listPendingPlanTaskIds(
	taskManager: TaskManager,
	planSlug: string,
): Promise<string[]> {
	const tasks = await taskManager.listTasks({ label: `plan:${planSlug}` });
	return tasks
		.filter((task) => !isTaskClosed(task.status))
		.map((task) => task.id);
}
