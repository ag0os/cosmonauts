import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { isTaskClosed } from "../../lib/tasks/task-types.ts";

/**
 * Create a completion check that returns true when all tasks in the
 * project are Done or Cancelled.
 */
export function createDefaultCompletionCheck(
	projectRoot: string,
	label?: string,
): () => Promise<boolean> {
	return async (): Promise<boolean> => {
		const state = await evaluateDefaultCompletionState(projectRoot, label);
		return state.status === "complete";
	};
}

type DefaultCompletionState =
	| { status: "complete" }
	| { status: "pending" }
	| { status: "terminal"; reason: string };

/**
 * Evaluate completion for the default coordinator loop.
 *
 * Terminal states let loop stages exit immediately instead of burning
 * iterations when there is no actionable work left.
 */
export async function evaluateDefaultCompletionState(
	projectRoot: string,
	label?: string,
): Promise<DefaultCompletionState> {
	const tm = new TaskManager(projectRoot);
	const tasks = await tm.listTasks(label ? { label } : undefined);

	if (tasks.length === 0) {
		return {
			status: "terminal",
			reason: label
				? `No tasks found for completion label "${label}"`
				: "No tasks found for completion check",
		};
	}

	if (tasks.every(taskCompleteForChain)) {
		return { status: "complete" };
	}

	if (tasks.every((task) => task.status === "Blocked")) {
		return {
			status: "terminal",
			reason: label
				? `All tasks for completion label "${label}" are Blocked`
				: "All tasks are Blocked",
		};
	}

	// A scope whose tasks are all closed (Done or Cancelled) but not yet
	// complete has Done tasks with unchecked criteria; it stays pending, since
	// re-invoking the coordinator is how those criteria get finished.
	const noActionableDetails = await describeNoActionableTasks(tm, tasks);
	if (
		tasks.some((task) => !isTaskClosed(task.status)) &&
		noActionableDetails !== undefined
	) {
		const summary = label
			? `No actionable tasks for completion label "${label}": none is In Progress or To Do with every dependency Done`
			: "No actionable tasks: none is In Progress or To Do with every dependency Done";
		return {
			status: "terminal",
			reason: `${summary}. ${noActionableDetails}`,
		};
	}

	return { status: "pending" };
}

function taskCompleteForChain(
	task: Awaited<ReturnType<TaskManager["listTasks"]>>[number],
): boolean {
	return (
		isTaskClosed(task.status) &&
		(task.status === "Cancelled" || taskAcceptanceCriteriaComplete(task))
	);
}

/**
 * Only an In Progress task, or a To Do task whose dependencies are all Done,
 * can move the scope forward. A Cancelled dependency never becomes Done.
 */
async function describeNoActionableTasks(
	tm: TaskManager,
	tasks: Awaited<ReturnType<TaskManager["listTasks"]>>,
): Promise<string | undefined> {
	if (tasks.some((task) => task.status === "In Progress")) return undefined;
	const todo = tasks.filter((task) => task.status === "To Do");
	const statuses = await tm.getTaskStatuses(
		todo.flatMap((task) => task.dependencies),
	);
	if (
		todo.some((task) =>
			task.dependencies.every(
				(id) => statuses.get(id.toUpperCase()) === "Done",
			),
		)
	) {
		return undefined;
	}

	const details: string[] = [];
	const stranded = todo.map((task) => {
		const unsatisfied = task.dependencies
			.filter((id) => statuses.get(id.toUpperCase()) !== "Done")
			.map((id) => `${id}: ${statuses.get(id.toUpperCase()) ?? "missing"}`);
		return `${task.id} (${unsatisfied.join(", ")})`;
	});
	if (stranded.length > 0) {
		details.push(`Stranded: ${stranded.join("; ")}`);
	}
	const blocked = tasks
		.filter((task) => task.status === "Blocked")
		.map((task) => task.id);
	if (blocked.length > 0) {
		details.push(`Blocked: ${blocked.join(", ")}`);
	}
	return details.join(". ");
}

function taskAcceptanceCriteriaComplete(
	task: Awaited<ReturnType<TaskManager["listTasks"]>>[number],
): boolean {
	return (
		task.acceptanceCriteria.length === 0 ||
		task.acceptanceCriteria.every((criterion) => criterion.checked)
	);
}
