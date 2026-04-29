import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

// AC markers used in markdown files
const AC_BEGIN_MARKER = "<!-- AC:BEGIN -->";
const AC_END_MARKER = "<!-- AC:END -->";

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
	// Split always returns at least one element for a valid ISO date string
	const datePart = date.toISOString().split("T")[0];
	return datePart ?? date.toISOString();
}

/**
 * Strip AC markers and their content from text for display
 */
function stripAcMarkers(text: string): string {
	const beginIndex = text.indexOf(AC_BEGIN_MARKER);
	const endIndex = text.indexOf(AC_END_MARKER);

	if (beginIndex === -1 || endIndex === -1) {
		return text;
	}

	const before = text.substring(0, beginIndex);
	const after = text.substring(endIndex + AC_END_MARKER.length);
	return (before + after).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Format acceptance criteria for plain text output
 */
function formatAcceptanceCriteriaPlain(task: Task): string[] {
	return task.acceptanceCriteria.map((ac) => {
		const checkbox = ac.checked ? "[x]" : "[ ]";
		return `ac.${ac.index}=${checkbox} ${ac.text}`;
	});
}

/**
 * Output task in plain key=value format
 */
function renderTaskPlain(task: Task): string[] {
	const lines = [
		`id=${task.id}`,
		`title=${task.title}`,
		`status=${task.status}`,
		`priority=${task.priority || ""}`,
		`assignee=${task.assignee || ""}`,
		`labels=${task.labels.join(",")}`,
		`dependencies=${task.dependencies.join(",")}`,
		`created=${task.createdAt.toISOString()}`,
		`updated=${task.updatedAt.toISOString()}`,
	];

	if (task.dueDate) {
		lines.push(`dueDate=${task.dueDate.toISOString()}`);
	}

	// Strip AC markers from description for clean output
	const cleanDescription = task.description
		? stripAcMarkers(task.description)
		: "";
	lines.push(`description=${cleanDescription.replace(/\n/g, "\\n")}`);

	if (task.implementationPlan) {
		// Escape newlines for plain format
		lines.push(`plan=${task.implementationPlan.replace(/\n/g, "\\n")}`);
	}

	lines.push(...formatAcceptanceCriteriaPlain(task));

	if (task.implementationNotes) {
		// Escape newlines for plain format
		lines.push(`notes=${task.implementationNotes.replace(/\n/g, "\\n")}`);
	}

	return lines;
}

function renderTaskHeader(task: Task): string[] {
	const headerText = `${task.id}: ${task.title}`;
	return [headerText, "\u2501".repeat(Math.min(headerText.length + 2, 60))];
}

export function renderTaskMetadata(task: Task): string[] {
	const lines = [`Status: ${task.status}`];
	if (task.priority) {
		lines.push(`Priority: ${task.priority}`);
	}
	if (task.assignee) {
		lines.push(`Assignee: ${task.assignee}`);
	}
	if (task.labels.length > 0) {
		lines.push(`Labels: ${task.labels.join(", ")}`);
	}
	if (task.dependencies.length > 0) {
		lines.push(`Dependencies: ${task.dependencies.join(", ")}`);
	}
	if (task.dueDate) {
		lines.push(`Due Date: ${formatDate(task.dueDate)}`);
	}
	lines.push(`Created: ${formatDate(task.createdAt)}`);
	lines.push(`Updated: ${formatDate(task.updatedAt)}`);

	return lines;
}

export function renderTaskDescription(task: Task): string[] {
	if (!task.description) {
		return [];
	}

	const cleanDescription = stripAcMarkers(task.description);
	if (!cleanDescription) {
		return [];
	}

	return ["Description:", ...renderIndentedLines(cleanDescription)];
}

function renderTaskImplementationPlan(task: Task): string[] {
	if (!task.implementationPlan) {
		return [];
	}

	return [
		"Implementation Plan:",
		...renderIndentedLines(task.implementationPlan),
	];
}

function renderTaskAcceptanceCriteria(task: Task): string[] {
	if (task.acceptanceCriteria.length === 0) {
		return [];
	}

	return [
		"Acceptance Criteria:",
		...task.acceptanceCriteria.map((ac) => {
			const checkbox = ac.checked ? "[x]" : "[ ]";
			return `  ${checkbox} #${ac.index} ${ac.text}`;
		}),
	];
}

function renderTaskImplementationNotes(task: Task): string[] {
	if (!task.implementationNotes) {
		return [];
	}

	return [
		"Implementation Notes:",
		...renderIndentedLines(task.implementationNotes),
	];
}

export function renderFormattedTask(task: Task): string[] {
	return joinSections([
		renderTaskHeader(task),
		renderTaskMetadata(task),
		renderTaskDescription(task),
		renderTaskImplementationPlan(task),
		renderTaskAcceptanceCriteria(task),
		renderTaskImplementationNotes(task),
	]);
}

function renderIndentedLines(text: string): string[] {
	return text.split("\n").map((line) => `  ${line}`);
}

function joinSections(sections: readonly string[][]): string[] {
	const rendered: string[] = [];

	for (const section of sections) {
		if (section.length === 0) {
			continue;
		}

		if (rendered.length > 0) {
			rendered.push("");
		}
		rendered.push(...section);
	}

	return rendered;
}

export function registerViewCommand(program: Command): void {
	program
		.command("view")
		.alias("show")
		.description("View a single task")
		.argument("<taskId>", "Task ID to view (e.g., TASK-001)")
		.action(async (taskId) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);

			try {
				const task = await manager.getTask(taskId);

				if (!task) {
					printCliError(`Task not found: ${taskId}`, globalOptions, {
						prefix: "Error",
						jsonMessage: `Error: Task not found: ${taskId}`,
					});
					process.exit(1);
					return;
				}

				printTask(task, mode);
			} catch (error) {
				printCliError(String(error), globalOptions, {
					prefix: "Error viewing task",
				});
				process.exit(1);
			}
		});
}

function printTask(task: Task, mode: CliOutputMode): void {
	if (mode === "json") {
		printJson(task);
		return;
	}

	if (mode === "plain") {
		printLines(renderTaskPlain(task));
		return;
	}

	printLines(renderFormattedTask(task));
}
