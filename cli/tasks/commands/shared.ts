import type {
	Task,
	TaskPriority,
	TaskStatus,
} from "../../../lib/tasks/task-types.ts";
import type { CliParseResult } from "../../shared/output.ts";
import { renderTable } from "../../shared/output.ts";

const TASK_STATUS_ALIASES = new Map<string, TaskStatus>([
	["todo", "To Do"],
	["to-do", "To Do"],
	["to do", "To Do"],
	["in-progress", "In Progress"],
	["inprogress", "In Progress"],
	["in progress", "In Progress"],
	["done", "Done"],
	["blocked", "Blocked"],
]);

const TASK_PRIORITY_VALUES = ["high", "medium", "low"] as const;

export function parseTaskStatusOption(
	status: string | undefined,
): CliParseResult<TaskStatus | undefined> {
	if (!status) {
		return { ok: true, value: undefined };
	}

	const normalizedStatus = TASK_STATUS_ALIASES.get(status.toLowerCase());
	if (!normalizedStatus) {
		return {
			ok: false,
			error: `Invalid status: ${status}. Must be one of: todo, in-progress, done, blocked`,
		};
	}

	return { ok: true, value: normalizedStatus };
}

export function parseTaskPriorityOption(
	priority: string | undefined,
): CliParseResult<TaskPriority | undefined> {
	if (!priority) {
		return { ok: true, value: undefined };
	}

	const normalized = priority.toLowerCase();
	const normalizedPriority =
		TASK_PRIORITY_VALUES.find((value) => value === normalized) ?? undefined;
	if (!normalizedPriority) {
		return {
			ok: false,
			error: `Invalid priority: ${priority}. Must be one of: high, medium, low`,
		};
	}

	return { ok: true, value: normalizedPriority };
}

export function renderTaskSummaryRow(task: Task): string {
	return `${task.id} | ${task.status} | ${task.priority ?? "-"} | ${task.title}`;
}

export function renderTaskSummaryTable(tasks: readonly Task[]): string[] {
	return renderTable(tasks, [
		{
			header: "ID",
			width: (rows) => Math.max(8, ...rows.map((task) => task.id.length)),
			render: (task) => task.id,
		},
		{
			header: "STATUS",
			width: (rows) => Math.max(11, ...rows.map((task) => task.status.length)),
			render: (task) => task.status,
		},
		{
			header: "PRIORITY",
			width: () => 9,
			render: (task) => task.priority ?? "-",
		},
		{
			header: "TITLE",
			width: (rows) =>
				Math.max(...rows.map((task) => task.title.length), "TITLE".length),
			render: (task) => task.title,
		},
	]);
}
