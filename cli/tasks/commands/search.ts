import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type * as TaskTypes from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";
import {
	parseTaskFilterOptions,
	renderTaskSummaryRow,
	renderTaskSummaryTable,
} from "./shared.ts";

interface TaskSearchCliOptions {
	status?: string;
	priority?: string;
	label?: string;
	limit?: string;
}

/**
 * Calculate relevance score for a task based on search query
 * Higher score = more relevant
 */
export function scoreTaskForQuery(task: TaskTypes.Task, query: string): number {
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

export function registerSearchCommand(program: Command): void {
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
		.action(async (query: string, options: TaskSearchCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);
			const parsed = parseTaskSearchOptions(options);

			if (!parsed.ok) {
				printCliError(parsed.error, globalOptions);
				process.exit(1);
			}

			try {
				const tasks = await manager.search(query, parsed.value.filter);
				const rankedTasks = rankTaskSearchResults(
					tasks,
					query,
					parsed.value.limit,
				);
				printTaskSearchResults(rankedTasks, query, mode);
			} catch (error) {
				printCliError(String(error), globalOptions, {
					prefix: "Error searching tasks",
				});
				process.exit(1);
			}
		});
}

export function parseTaskSearchOptions(
	options: TaskSearchCliOptions,
): CliParseResult<{ filter?: TaskTypes.TaskListFilter; limit: number }> {
	const parsed = parseTaskFilterOptions(options);
	if (!parsed.ok) {
		return parsed;
	}
	const filter = parsed.value;

	const limit = parseInt(options.limit ?? "10", 10);
	if (Number.isNaN(limit) || limit < 1) {
		return {
			ok: false,
			error: `Invalid limit: ${options.limit}. Must be a positive number`,
		};
	}

	return {
		ok: true,
		value: {
			filter: Object.keys(filter).length > 0 ? filter : undefined,
			limit,
		},
	};
}

export function rankTaskSearchResults(
	tasks: readonly TaskTypes.Task[],
	query: string,
	limit: number,
): TaskTypes.Task[] {
	return tasks
		.map((task) => ({
			task,
			score: scoreTaskForQuery(task, query),
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((scoredTask) => scoredTask.task);
}

export function renderTaskSearchResults(
	tasks: readonly TaskTypes.Task[],
	query: string,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return tasks;
	}

	if (mode === "plain") {
		return tasks.map(renderTaskSearchRow);
	}

	if (tasks.length === 0) {
		return [`No tasks found matching "${query}"`];
	}

	return [
		`Found ${tasks.length} task(s) matching "${query}":`,
		"",
		...renderTaskSummaryTable(tasks),
	];
}

function renderTaskSearchRow(task: TaskTypes.Task): string {
	return renderTaskSummaryRow(task);
}

function printTaskSearchResults(
	tasks: readonly TaskTypes.Task[],
	query: string,
	mode: CliOutputMode,
): void {
	const rendered = renderTaskSearchResults(tasks, query, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}
