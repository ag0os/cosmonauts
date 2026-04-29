import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type { Task, TaskListFilter } from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";
import {
	parseTaskPriorityOption,
	parseTaskStatusOption,
	renderTaskSummaryRow,
	renderTaskSummaryTable,
} from "./shared.ts";

interface TaskListCliOptions {
	status?: string;
	priority?: string;
	assignee?: string;
	label?: string;
	ready?: boolean;
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

	const status = parseTaskStatusOption(options.status);
	if (!status.ok) {
		return status;
	}
	if (status.value) {
		filter.status = status.value;
	}

	const priority = parseTaskPriorityOption(options.priority);
	if (!priority.ok) {
		return priority;
	}
	if (priority.value) {
		filter.priority = priority.value;
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

	return renderTaskSummaryTable(tasks);
}

export function renderTaskRow(task: Task): string {
	return renderTaskSummaryRow(task);
}

function printTaskList(tasks: readonly Task[], mode: CliOutputMode): void {
	const rendered = renderTaskList(tasks, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}
