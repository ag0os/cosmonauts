import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type { Task } from "../../../lib/tasks/task-types.js";

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
function outputPlain(task: Task): void {
	console.log(`id=${task.id}`);
	console.log(`title=${task.title}`);
	console.log(`status=${task.status}`);
	console.log(`priority=${task.priority || ""}`);
	console.log(`assignee=${task.assignee || ""}`);
	console.log(`labels=${task.labels.join(",")}`);
	console.log(`dependencies=${task.dependencies.join(",")}`);
	console.log(`created=${task.createdAt.toISOString()}`);
	console.log(`updated=${task.updatedAt.toISOString()}`);
	if (task.dueDate) {
		console.log(`dueDate=${task.dueDate.toISOString()}`);
	}
	// Strip AC markers from description for clean output
	const cleanDescription = task.description
		? stripAcMarkers(task.description)
		: "";
	console.log(`description=${cleanDescription.replace(/\n/g, "\\n")}`);
	if (task.implementationPlan) {
		// Escape newlines for plain format
		console.log(`plan=${task.implementationPlan.replace(/\n/g, "\\n")}`);
	}
	for (const line of formatAcceptanceCriteriaPlain(task)) {
		console.log(line);
	}
	if (task.implementationNotes) {
		// Escape newlines for plain format
		console.log(`notes=${task.implementationNotes.replace(/\n/g, "\\n")}`);
	}
}

/**
 * Output task in formatted, human-readable view
 */
function outputFormatted(task: Task): void {
	// Header line with ID and title
	const headerText = `${task.id}: ${task.title}`;
	console.log(headerText);
	console.log("\u2501".repeat(Math.min(headerText.length + 2, 60)));
	console.log();

	// Core metadata
	console.log(`Status: ${task.status}`);
	if (task.priority) {
		console.log(`Priority: ${task.priority}`);
	}
	if (task.assignee) {
		console.log(`Assignee: ${task.assignee}`);
	}
	if (task.labels.length > 0) {
		console.log(`Labels: ${task.labels.join(", ")}`);
	}
	if (task.dependencies.length > 0) {
		console.log(`Dependencies: ${task.dependencies.join(", ")}`);
	}
	if (task.dueDate) {
		console.log(`Due Date: ${formatDate(task.dueDate)}`);
	}
	console.log(`Created: ${formatDate(task.createdAt)}`);
	console.log(`Updated: ${formatDate(task.updatedAt)}`);

	// Description section
	if (task.description) {
		// Strip AC markers from description for clean output
		const cleanDescription = stripAcMarkers(task.description);
		if (cleanDescription) {
			console.log();
			console.log("Description:");
			// Indent each line of description
			for (const line of cleanDescription.split("\n")) {
				console.log(`  ${line}`);
			}
		}
	}

	// Implementation Plan section
	if (task.implementationPlan) {
		console.log();
		console.log("Implementation Plan:");
		for (const line of task.implementationPlan.split("\n")) {
			console.log(`  ${line}`);
		}
	}

	// Acceptance Criteria section
	if (task.acceptanceCriteria.length > 0) {
		console.log();
		console.log("Acceptance Criteria:");
		for (const ac of task.acceptanceCriteria) {
			const checkbox = ac.checked ? "[x]" : "[ ]";
			console.log(`  ${checkbox} #${ac.index} ${ac.text}`);
		}
	}

	// Implementation Notes section
	if (task.implementationNotes) {
		console.log();
		console.log("Implementation Notes:");
		for (const line of task.implementationNotes.split("\n")) {
			console.log(`  ${line}`);
		}
	}
}

export function registerCommand(program: Command): void {
	program
		.command("view")
		.alias("show")
		.description("View a single task")
		.argument("<taskId>", "Task ID to view (e.g., TASK-001)")
		.action(async (taskId) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new TaskManager(projectRoot);

			try {
				const task = await manager.getTask(taskId);

				if (!task) {
					const errorMsg = `Error: Task not found: ${taskId}`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(errorMsg);
					}
					process.exit(1);
				}

				// Output based on format
				if (globalOptions.json) {
					console.log(JSON.stringify(task, null, 2));
				} else if (globalOptions.plain) {
					outputPlain(task);
				} else {
					outputFormatted(task);
				}
			} catch (error) {
				const errorMsg = `Error viewing task: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
