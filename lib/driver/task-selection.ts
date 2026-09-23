import type { TaskManager } from "../tasks/task-manager.ts";
import { isTaskClosed } from "../tasks/task-types.ts";

export async function assertDriveTasksNotCancelled(
	taskManager: TaskManager,
	taskIds: readonly string[],
): Promise<void> {
	if (taskIds.length === 0) return;
	const statuses = await taskManager.getTaskStatuses(taskIds);
	const cancelled = taskIds.filter(
		(taskId) => statuses.get(taskId.toUpperCase()) === "Cancelled",
	);
	if (cancelled.length > 0) {
		throw new Error(
			`Drive cannot run Cancelled task(s): ${cancelled.map((taskId) => `${taskId} is Cancelled`).join(", ")}`,
		);
	}
}

export async function listPendingPlanTaskIds(
	taskManager: TaskManager,
	planSlug: string,
): Promise<string[]> {
	const tasks = await taskManager.listTasks({ label: `plan:${planSlug}` });
	return tasks
		.filter((task) => !isTaskClosed(task.status))
		.map((task) => task.id);
}
