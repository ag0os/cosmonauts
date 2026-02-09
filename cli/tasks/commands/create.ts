import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type { TaskCreateInput, TaskPriority } from "../../../lib/tasks/task-types.js";

export function registerCommand(program: Command): void {
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
		.action(async (title, options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new TaskManager(projectRoot);

			// Validate priority if provided
			if (options.priority && !isValidPriority(options.priority)) {
				console.error(
					`Invalid priority: ${options.priority}. Must be one of: high, medium, low`,
				);
				process.exit(1);
			}

			const input: TaskCreateInput = {
				title,
				description: options.description,
				priority: options.priority as TaskPriority | undefined,
				assignee: options.assignee,
				labels: options.label,
				dueDate: options.due ? new Date(options.due) : undefined,
				dependencies: options.dependsOn,
				acceptanceCriteria: options.ac,
				parent: options.parent,
			};

			try {
				const task = await manager.createTask(input);

				// Output based on format
				if (globalOptions.json) {
					console.log(JSON.stringify(task, null, 2));
				} else if (globalOptions.plain) {
					console.log(task.id);
				} else {
					console.log(`Created task ${task.id}: ${task.title}`);
				}
			} catch (error) {
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: String(error) }, null, 2));
				} else {
					console.error(`Error creating task: ${error}`);
				}
				process.exit(1);
			}
		});
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
