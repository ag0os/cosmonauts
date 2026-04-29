import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type {
	Task,
	TaskListFilter,
	TaskStatus,
} from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import {
	getOutputMode,
	printJson,
	printLines,
	renderTable,
} from "../../shared/output.ts";

interface TaskListCliOptions {
	status?: string;
	priority?: string;
	assignee?: string;
	label?: string;
	ready?: boolean;
}

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

/**
 * Map CLI status shorthand to TaskStatus
 */
function normalizeStatus(status: string): TaskStatus | null {
	return TASK_STATUS_ALIASES.get(status.toLowerCase()) ?? null;
}

/**
 * Validate and normalize priority value
 */
function normalizePriority(
	priority: string,
): (typeof TASK_PRIORITY_VALUES)[number] | null {
	const normalized = priority.toLowerCase();
	return TASK_PRIORITY_VALUES.find((value) => value === normalized) ?? null;
}

export function registerListCommand(program: Command): void {
	program
		.command("list")
		.alias("ls")
		.description("List all tasks")
		.option(
			"-s, --status <status>",
			"Filter by status: todo, in-progress, done, blocked",
		)
		.option(
			"-p, --priority <priority>",
			"Filter by priority: high, medium, low",
		)
		.option("-a, --assignee <name>", "Filter by assignee")
		.option("-l, --label <label>", "Filter by label")
		.option("--ready", "Show only tasks with no dependencies")
		.action(async (options: TaskListCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);
			const filter = parseTaskListFilter(options);

			if (!filter.ok) {
				printCliError(filter.error, globalOptions);
				process.exit(1);
			}

			try {
				const tasks = await manager.listTasks(filter.value);
				printTaskList(tasks, mode);
			} catch (error) {
				printCliError(String(error), globalOptions, {
					prefix: "Error listing tasks",
				});
				process.exit(1);
			}
		});
}

export function parseTaskListFilter(
	options: TaskListCliOptions,
): CliParseResult<TaskListFilter> {
	const filter: TaskListFilter = {};

	if (options.status) {
		const normalizedStatus = normalizeStatus(options.status);
		if (!normalizedStatus) {
			return {
				ok: false,
				error: `Invalid status: ${options.status}. Must be one of: todo, in-progress, done, blocked`,
			};
		}
		filter.status = normalizedStatus;
	}

	if (options.priority) {
		const normalizedPriority = normalizePriority(options.priority);
		if (!normalizedPriority) {
			return {
				ok: false,
				error: `Invalid priority: ${options.priority}. Must be one of: high, medium, low`,
			};
		}
		filter.priority = normalizedPriority;
	}

	if (options.assignee) {
		filter.assignee = options.assignee;
	}

	if (options.label) {
		filter.label = options.label;
	}

	if (options.ready) {
		filter.hasNoDependencies = true;
	}

	return { ok: true, value: filter };
}

export function renderTaskList(
	tasks: readonly Task[],
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return tasks;
	}

	if (mode === "plain") {
		return tasks.map(renderTaskRow);
	}

	if (tasks.length === 0) {
		return ["No tasks found"];
	}

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

export function renderTaskRow(task: Task): string {
	return `${task.id} | ${task.status} | ${task.priority ?? "-"} | ${task.title}`;
}

function printTaskList(tasks: readonly Task[], mode: CliOutputMode): void {
	const rendered = renderTaskList(tasks, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}
