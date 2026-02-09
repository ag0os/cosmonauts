import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type {
	AcceptanceCriterion,
	TaskPriority,
	TaskStatus,
	TaskUpdateInput,
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
 * Helper to collect multiple string values for repeatable options
 */
function collectStrings(value: string, previous: string[]): string[] {
	return [...previous, value];
}

/**
 * Helper to collect multiple integer values for repeatable options
 */
function collectIndices(value: string, previous: number[]): number[] {
	const num = parseInt(value, 10);
	if (!Number.isNaN(num)) {
		return [...previous, num];
	}
	return previous;
}

/**
 * Process escaped newlines in string values
 * Converts literal \n sequences to actual newlines
 */
function processEscapedNewlines(value: string): string {
	return value.replace(/\\n/g, "\n");
}

/**
 * Track which fields were changed for output
 */
interface FieldChange {
	field: string;
	oldValue: string;
	newValue: string;
}

/**
 * Format a change for display
 */
function formatChange(change: FieldChange): string {
	if (change.oldValue && change.newValue) {
		return `${change.field} (${change.oldValue} → ${change.newValue})`;
	} else if (change.newValue) {
		return `${change.field} (set)`;
	} else {
		return `${change.field} (appended)`;
	}
}

export function registerCommand(program: Command): void {
	program
		.command("edit")
		.alias("update")
		.description("Edit a task")
		.argument("<taskId>", "Task ID to edit (e.g., TASK-001)")
		// Basic fields
		.option("-t, --title <title>", "Update title")
		.option("-d, --description <text>", "Update description")
		.option(
			"-s, --status <status>",
			"Update status: todo, in-progress, done, blocked",
		)
		.option("-p, --priority <priority>", "Update priority: high, medium, low")
		.option("-a, --assignee <name>", "Update assignee")
		.option("--due <date>", "Update due date (YYYY-MM-DD)")
		// Plan and notes
		.option("--plan <text>", "Set implementation plan (replaces existing)")
		.option("--append-plan <text>", "Append to implementation plan")
		.option("--notes <text>", "Set implementation notes (replaces existing)")
		.option("--append-notes <text>", "Append to implementation notes")
		// Labels (add/remove)
		.option(
			"--add-label <label>",
			"Add a label (can be used multiple times)",
			collectStrings,
			[],
		)
		.option(
			"--remove-label <label>",
			"Remove a label (can be used multiple times)",
			collectStrings,
			[],
		)
		// Dependencies (add/remove)
		.option(
			"--add-dep <taskId>",
			"Add a dependency (can be used multiple times)",
			collectStrings,
			[],
		)
		.option(
			"--remove-dep <taskId>",
			"Remove a dependency (can be used multiple times)",
			collectStrings,
			[],
		)
		// Acceptance criteria
		.option(
			"--add-ac <text>",
			"Add acceptance criterion (can be used multiple times)",
			collectStrings,
			[],
		)
		.option(
			"--remove-ac <index>",
			"Remove acceptance criterion by index (can be used multiple times)",
			collectIndices,
			[],
		)
		.option(
			"--check-ac <index>",
			"Mark criterion as complete (can be used multiple times)",
			collectIndices,
			[],
		)
		.option(
			"--uncheck-ac <index>",
			"Mark criterion as incomplete (can be used multiple times)",
			collectIndices,
			[],
		)
		.action(async (taskId, options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new TaskManager(projectRoot);

			try {
				// First, get the existing task
				const existingTask = await manager.getTask(taskId);

				if (!existingTask) {
					const errorMsg = `Task not found: ${taskId}`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(`Error: ${errorMsg}`);
					}
					process.exit(1);
				}

				// Track changes for output
				const changes: FieldChange[] = [];

				// Build the update input
				const updateInput: TaskUpdateInput = {};

				// Basic fields
				if (options.title) {
					changes.push({
						field: "title",
						oldValue: existingTask.title,
						newValue: options.title,
					});
					updateInput.title = options.title;
				}

				if (options.description) {
					changes.push({
						field: "description",
						oldValue: existingTask.description ? "existing" : "",
						newValue: "updated",
					});
					updateInput.description = processEscapedNewlines(options.description);
				}

				if (options.status) {
					const normalizedStatus = normalizeStatus(options.status);
					if (!normalizedStatus) {
						const errorMsg = `Invalid status: ${options.status}. Must be one of: todo, in-progress, done, blocked`;
						if (globalOptions.json) {
							console.log(JSON.stringify({ error: errorMsg }, null, 2));
						} else {
							console.error(`Error: ${errorMsg}`);
						}
						process.exit(1);
					}
					changes.push({
						field: "status",
						oldValue: existingTask.status,
						newValue: normalizedStatus,
					});
					updateInput.status = normalizedStatus;
				}

				if (options.priority) {
					const normalizedPriority = normalizePriority(options.priority);
					if (!normalizedPriority) {
						const errorMsg = `Invalid priority: ${options.priority}. Must be one of: high, medium, low`;
						if (globalOptions.json) {
							console.log(JSON.stringify({ error: errorMsg }, null, 2));
						} else {
							console.error(`Error: ${errorMsg}`);
						}
						process.exit(1);
					}
					changes.push({
						field: "priority",
						oldValue: existingTask.priority || "none",
						newValue: normalizedPriority,
					});
					updateInput.priority = normalizedPriority;
				}

				if (options.assignee) {
					changes.push({
						field: "assignee",
						oldValue: existingTask.assignee || "none",
						newValue: options.assignee,
					});
					updateInput.assignee = options.assignee;
				}

				if (options.due) {
					const dueDate = new Date(options.due);
					if (Number.isNaN(dueDate.getTime())) {
						const errorMsg = `Invalid date format: ${options.due}. Use YYYY-MM-DD format.`;
						if (globalOptions.json) {
							console.log(JSON.stringify({ error: errorMsg }, null, 2));
						} else {
							console.error(`Error: ${errorMsg}`);
						}
						process.exit(1);
					}
					changes.push({
						field: "dueDate",
						oldValue: existingTask.dueDate
							? existingTask.dueDate.toISOString().split("T")[0] || ""
							: "none",
						newValue: dueDate.toISOString().split("T")[0] || options.due,
					});
					updateInput.dueDate = dueDate;
				}

				// Plan handling (process escaped newlines for better CLI experience)
				if (options.plan) {
					changes.push({
						field: "plan",
						oldValue: existingTask.implementationPlan ? "existing" : "",
						newValue: "replaced",
					});
					updateInput.implementationPlan = processEscapedNewlines(options.plan);
				} else if (options.appendPlan) {
					const currentPlan = existingTask.implementationPlan || "";
					const separator = currentPlan ? "\n\n" : "";
					changes.push({
						field: "plan",
						oldValue: "",
						newValue: "",
					});
					updateInput.implementationPlan =
						currentPlan +
						separator +
						processEscapedNewlines(options.appendPlan);
				}

				// Notes handling (process escaped newlines for better CLI experience)
				if (options.notes) {
					changes.push({
						field: "notes",
						oldValue: existingTask.implementationNotes ? "existing" : "",
						newValue: "replaced",
					});
					updateInput.implementationNotes = processEscapedNewlines(
						options.notes,
					);
				} else if (options.appendNotes) {
					const currentNotes = existingTask.implementationNotes || "";
					const separator = currentNotes ? "\n\n" : "";
					changes.push({
						field: "notes",
						oldValue: "",
						newValue: "",
					});
					updateInput.implementationNotes =
						currentNotes +
						separator +
						processEscapedNewlines(options.appendNotes);
				}

				// Labels (add/remove)
				const addLabels: string[] = options.addLabel || [];
				const removeLabels: string[] = options.removeLabel || [];
				if (addLabels.length > 0 || removeLabels.length > 0) {
					let labels = [...existingTask.labels];

					// Remove labels first
					for (const label of removeLabels) {
						const labelLower = label.toLowerCase();
						labels = labels.filter((l) => l.toLowerCase() !== labelLower);
					}

					// Then add new labels
					for (const label of addLabels) {
						if (!labels.some((l) => l.toLowerCase() === label.toLowerCase())) {
							labels.push(label);
						}
					}

					if (addLabels.length > 0) {
						changes.push({
							field: "labels",
							oldValue: "",
							newValue: `+${addLabels.join(", +")}`,
						});
					}
					if (removeLabels.length > 0) {
						changes.push({
							field: "labels",
							oldValue: `-${removeLabels.join(", -")}`,
							newValue: "",
						});
					}
					updateInput.labels = labels;
				}

				// Dependencies (add/remove)
				const addDeps: string[] = options.addDep || [];
				const removeDeps: string[] = options.removeDep || [];
				if (addDeps.length > 0 || removeDeps.length > 0) {
					let dependencies = [...existingTask.dependencies];

					// Remove dependencies first
					for (const dep of removeDeps) {
						const depUpper = dep.toUpperCase();
						dependencies = dependencies.filter(
							(d) => d.toUpperCase() !== depUpper,
						);
					}

					// Then add new dependencies
					for (const dep of addDeps) {
						if (
							!dependencies.some((d) => d.toUpperCase() === dep.toUpperCase())
						) {
							dependencies.push(dep);
						}
					}

					if (addDeps.length > 0) {
						changes.push({
							field: "dependencies",
							oldValue: "",
							newValue: `+${addDeps.join(", +")}`,
						});
					}
					if (removeDeps.length > 0) {
						changes.push({
							field: "dependencies",
							oldValue: `-${removeDeps.join(", -")}`,
							newValue: "",
						});
					}
					updateInput.dependencies = dependencies;
				}

				// Acceptance criteria handling
				const addAcs: string[] = options.addAc || [];
				const removeAcIndices: number[] = options.removeAc || [];
				const checkAcIndices: number[] = options.checkAc || [];
				const uncheckAcIndices: number[] = options.uncheckAc || [];

				if (
					addAcs.length > 0 ||
					removeAcIndices.length > 0 ||
					checkAcIndices.length > 0 ||
					uncheckAcIndices.length > 0
				) {
					let criteria: AcceptanceCriterion[] = [
						...existingTask.acceptanceCriteria,
					];

					// Remove criteria by index (sort in reverse to avoid index shifting issues)
					const sortedRemoveIndices = [...removeAcIndices].sort(
						(a, b) => b - a,
					);
					for (const indexToRemove of sortedRemoveIndices) {
						const criterionIndex = criteria.findIndex(
							(c) => c.index === indexToRemove,
						);
						if (criterionIndex !== -1) {
							criteria.splice(criterionIndex, 1);
						}
					}

					// Re-index after removal
					criteria = criteria.map((c, i) => ({
						...c,
						index: i + 1,
					}));

					// Add new criteria
					for (const text of addAcs) {
						const newIndex = criteria.length + 1;
						criteria.push({
							index: newIndex,
							text,
							checked: false,
						});
					}

					// Check/uncheck criteria
					for (const indexToCheck of checkAcIndices) {
						const criterion = criteria.find((c) => c.index === indexToCheck);
						if (criterion) {
							criterion.checked = true;
						}
					}

					for (const indexToUncheck of uncheckAcIndices) {
						const criterion = criteria.find((c) => c.index === indexToUncheck);
						if (criterion) {
							criterion.checked = false;
						}
					}

					// Track changes
					if (addAcs.length > 0) {
						changes.push({
							field: "acceptanceCriteria",
							oldValue: "",
							newValue: `+${addAcs.length} criteria`,
						});
					}
					if (removeAcIndices.length > 0) {
						changes.push({
							field: "acceptanceCriteria",
							oldValue: `-indices ${removeAcIndices.join(", ")}`,
							newValue: "",
						});
					}
					if (checkAcIndices.length > 0) {
						changes.push({
							field: "acceptanceCriteria",
							oldValue: "",
							newValue: `checked #${checkAcIndices.join(", #")}`,
						});
					}
					if (uncheckAcIndices.length > 0) {
						changes.push({
							field: "acceptanceCriteria",
							oldValue: "",
							newValue: `unchecked #${uncheckAcIndices.join(", #")}`,
						});
					}

					updateInput.acceptanceCriteria = criteria;
				}

				// Check if any changes were requested
				if (changes.length === 0) {
					const errorMsg =
						"No changes specified. Use --help to see available options.";
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(`Error: ${errorMsg}`);
					}
					process.exit(1);
				}

				// Perform the update
				const updatedTask = await manager.updateTask(taskId, updateInput);

				// Output based on format
				if (globalOptions.json) {
					console.log(JSON.stringify(updatedTask, null, 2));
				} else if (globalOptions.plain) {
					console.log(`updated ${updatedTask.id}`);
					// Output changed fields in plain format
					if (updateInput.status) {
						console.log(`status=${updateInput.status}`);
					}
					if (updateInput.priority) {
						console.log(`priority=${updateInput.priority}`);
					}
					if (updateInput.title) {
						console.log(`title=${updateInput.title}`);
					}
					if (updateInput.assignee) {
						console.log(`assignee=${updateInput.assignee}`);
					}
					if (updateInput.dueDate) {
						console.log(
							`dueDate=${updateInput.dueDate.toISOString().split("T")[0]}`,
						);
					}
					if (updateInput.labels) {
						console.log(`labels=${updateInput.labels.join(",")}`);
					}
					if (updateInput.dependencies) {
						console.log(`dependencies=${updateInput.dependencies.join(",")}`);
					}
				} else {
					// Default formatted output
					console.log(`Updated task ${updatedTask.id}: ${updatedTask.title}`);
					const changeDescriptions = changes.map(formatChange);
					console.log(`Changed: ${changeDescriptions.join(", ")}`);
				}
			} catch (error) {
				const errorMsg = `Error updating task: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
