import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type {
	Task,
	TaskCreateInput,
	TaskPriority,
} from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

interface TaskCreateCliOptions {
	description?: string;
	priority?: string;
	assignee?: string;
	label?: string[];
	due?: string;
	dependsOn?: string[];
	ac?: string[];
	parent?: string;
}

export function registerCreateCommand(program: Command): void {
	program
		.command("create")
		.description("Create a new task")
		.argument("<title>", "Task title")
		.option("-d, --description <text>", "Task description")
		.option("-p, --priority <level>", "Priority (high, medium, low)")
		.option("-a, --assignee <name>", "Assignee")
		.option(
			"-l, --label <label>",
			"Add label (can be used multiple times)",
			collect,
			[],
		)
		.option("--due <date>", "Due date (ISO format or relative like 2024-12-31)")
		.option(
			"--depends-on <taskId>",
			"Add dependency (can be used multiple times)",
			collect,
			[],
		)
		.option(
			"--ac <criterion>",
			"Add acceptance criterion (can be used multiple times)",
			collect,
			[],
		)
		.option("--parent <taskId>", "Parent task ID")
		.action(async (title: string, options: TaskCreateCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);
			const input = parseTaskCreateInput(title, options);
			if (!input.ok) {
				printTaskCreateParseError(input.error, globalOptions);
				process.exit(1);
			}

			try {
				const task = await manager.createTask(input.value);
				const rendered = renderTaskCreateSuccess(task, mode);

				if (mode === "json") {
					printJson(rendered);
				} else {
					printLines(rendered as string[]);
				}
			} catch (error) {
				printCliError(String(error), globalOptions, {
					prefix: "Error creating task",
				});
				process.exit(1);
			}
		});
}

export function parseTaskCreateInput(
	title: string,
	options: TaskCreateCliOptions,
): CliParseResult<TaskCreateInput> {
	let priority: TaskPriority | undefined;
	if (options.priority) {
		if (!isValidPriority(options.priority)) {
			return {
				ok: false,
				error: `Invalid priority: ${options.priority}. Must be one of: high, medium, low`,
			};
		}
		priority = options.priority;
	}

	const dueDate = parseTaskDueDate(options.due);
	if (!dueDate.ok) {
		return dueDate;
	}

	return {
		ok: true,
		value: {
			title,
			description: options.description,
			priority,
			assignee: options.assignee,
			labels: options.label,
			dueDate: dueDate.value,
			dependencies: options.dependsOn,
			acceptanceCriteria: options.ac,
			parent: options.parent,
		},
	};
}

export function parseTaskDueDate(
	value: string | undefined,
): CliParseResult<Date | undefined> {
	if (!value) {
		return { ok: true, value: undefined };
	}

	const dueDate = new Date(value);
	if (Number.isNaN(dueDate.getTime())) {
		return {
			ok: false,
			error: `Invalid date format: ${value}. Use YYYY-MM-DD format.`,
		};
	}

	return { ok: true, value: dueDate };
}

export function renderTaskCreateSuccess(
	task: Task,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return task;
	}

	if (mode === "plain") {
		return [task.id];
	}

	return [`Created task ${task.id}: ${task.title}`];
}

/**
 * Helper to collect multiple values for repeatable options
 */
function collect(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

/**
 * Validate priority value
 */
function isValidPriority(value: string): value is TaskPriority {
	return ["high", "medium", "low"].includes(value);
}

function printTaskCreateParseError(
	message: string,
	globalOptions: { json?: boolean; plain?: boolean },
): void {
	if (message.startsWith("Invalid priority:")) {
		printCliError(message, { ...globalOptions, json: false });
		return;
	}

	printCliError(message, globalOptions, { prefix: "Error" });
}
