import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type {
	TaskListFilter,
	TaskPriority,
	TaskStatus,
} from "../../../lib/tasks/task-types.js";

/**
 * Map CLI status shorthand to TaskStatus
 */
function normalizeStatus(status: string): TaskStatus | null {
	const statusMap: Record<string, TaskStatus> = {
		todo: "To Do",
		"to-do": "To Do",
		"to do": "To Do",
		"in-progress": "In Progress",
		inprogress: "In Progress",
		"in progress": "In Progress",
		done: "Done",
		blocked: "Blocked",
	};
	return statusMap[status.toLowerCase()] ?? null;
}

/**
 * Validate and normalize priority value
 */
function normalizePriority(priority: string): TaskPriority | null {
	const validPriorities: TaskPriority[] = ["high", "medium", "low"];
	const normalized = priority.toLowerCase();
	return validPriorities.includes(normalized as TaskPriority)
		? (normalized as TaskPriority)
		: null;
}

export function registerCommand(program: Command): void {
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
		.action(async (options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new TaskManager(projectRoot);

			// Build the filter object
			const filter: TaskListFilter = {};

			if (options.status) {
				const normalizedStatus = normalizeStatus(options.status);
				if (!normalizedStatus) {
					const errorMsg = `Invalid status: ${options.status}. Must be one of: todo, in-progress, done, blocked`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(errorMsg);
					}
					process.exit(1);
				}
				filter.status = normalizedStatus;
			}

			if (options.priority) {
				const normalizedPriority = normalizePriority(options.priority);
				if (!normalizedPriority) {
					const errorMsg = `Invalid priority: ${options.priority}. Must be one of: high, medium, low`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(errorMsg);
					}
					process.exit(1);
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

			try {
				const tasks = await manager.listTasks(filter);

				// Output based on format
				if (globalOptions.json) {
					console.log(JSON.stringify(tasks, null, 2));
				} else if (globalOptions.plain) {
					for (const task of tasks) {
						console.log(
							`${task.id} | ${task.status} | ${task.priority || "-"} | ${task.title}`,
						);
					}
				} else {
					// Table format
					if (tasks.length === 0) {
						console.log("No tasks found");
						return;
					}

					// Calculate column widths dynamically
					const idWidth = Math.max(8, ...tasks.map((t) => t.id.length));
					const statusWidth = Math.max(
						11,
						...tasks.map((t) => t.status.length),
					);
					const priorityWidth = 9;

					// Print header
					const header = [
						"ID".padEnd(idWidth),
						"STATUS".padEnd(statusWidth),
						"PRIORITY".padEnd(priorityWidth),
						"TITLE",
					].join("  ");
					console.log(header);

					// Print tasks
					for (const task of tasks) {
						const id = task.id.padEnd(idWidth);
						const status = task.status.padEnd(statusWidth);
						const priority = (task.priority || "-").padEnd(priorityWidth);
						console.log(`${id}  ${status}  ${priority}  ${task.title}`);
					}
				}
			} catch (error) {
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: String(error) }, null, 2));
				} else {
					console.error(`Error listing tasks: ${error}`);
				}
				process.exit(1);
			}
		});
}
