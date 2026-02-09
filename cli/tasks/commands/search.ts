import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type {
	Task,
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

/**
 * Calculate relevance score for a task based on search query
 * Higher score = more relevant
 */
function calculateRelevance(task: Task, query: string): number {
	const queryLower = query.toLowerCase();
	let score = 0;

	// Title matches are most relevant (weight: 10)
	if (task.title.toLowerCase().includes(queryLower)) {
		score += 10;
		// Exact match in title gets bonus
		if (task.title.toLowerCase() === queryLower) {
			score += 5;
		}
		// Title starts with query gets bonus
		if (task.title.toLowerCase().startsWith(queryLower)) {
			score += 3;
		}
	}

	// Description matches (weight: 5)
	if (task.description?.toLowerCase().includes(queryLower)) {
		score += 5;
	}

	// Implementation notes matches (weight: 3)
	if (task.implementationNotes?.toLowerCase().includes(queryLower)) {
		score += 3;
	}

	// Implementation plan matches (weight: 2)
	if (task.implementationPlan?.toLowerCase().includes(queryLower)) {
		score += 2;
	}

	// Count occurrences for additional relevance
	const allText = [
		task.title,
		task.description,
		task.implementationNotes,
		task.implementationPlan,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	const occurrences = (
		allText.match(new RegExp(escapeRegExp(queryLower), "g")) || []
	).length;
	score += Math.min(occurrences, 5); // Cap occurrence bonus at 5

	return score;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function registerCommand(program: Command): void {
	program
		.command("search")
		.description("Search tasks by query")
		.argument("<query>", "Search query")
		.option(
			"-s, --status <status>",
			"Filter by status: todo, in-progress, done, blocked",
		)
		.option(
			"-p, --priority <priority>",
			"Filter by priority: high, medium, low",
		)
		.option("-l, --label <label>", "Filter by label")
		.option("--limit <number>", "Maximum number of results", "10")
		.action(async (query, options) => {
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

			if (options.label) {
				filter.label = options.label;
			}

			// Parse limit
			const limit = parseInt(options.limit, 10);
			if (Number.isNaN(limit) || limit < 1) {
				const errorMsg = `Invalid limit: ${options.limit}. Must be a positive number`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}

			try {
				// Search tasks using TaskManager
				const tasks = await manager.search(
					query,
					Object.keys(filter).length > 0 ? filter : undefined,
				);

				// Sort by relevance score (descending)
				const scoredTasks = tasks.map((task) => ({
					task,
					score: calculateRelevance(task, query),
				}));
				scoredTasks.sort((a, b) => b.score - a.score);

				// Apply limit
				const limitedTasks = scoredTasks.slice(0, limit).map((st) => st.task);

				// Output based on format
				if (globalOptions.json) {
					console.log(JSON.stringify(limitedTasks, null, 2));
				} else if (globalOptions.plain) {
					for (const task of limitedTasks) {
						console.log(
							`${task.id} | ${task.status} | ${task.priority || "-"} | ${task.title}`,
						);
					}
				} else {
					// Table format
					if (limitedTasks.length === 0) {
						console.log(`No tasks found matching "${query}"`);
						return;
					}

					console.log(
						`Found ${limitedTasks.length} task(s) matching "${query}":`,
					);
					console.log();

					// Calculate column widths dynamically
					const idWidth = Math.max(8, ...limitedTasks.map((t) => t.id.length));
					const statusWidth = Math.max(
						11,
						...limitedTasks.map((t) => t.status.length),
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
					for (const task of limitedTasks) {
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
					console.error(`Error searching tasks: ${error}`);
				}
				process.exit(1);
			}
		});
}
