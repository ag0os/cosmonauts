import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type {
	AcceptanceCriterion,
	Task,
	TaskUpdateInput,
} from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";
import { parseTaskPriorityOption, parseTaskStatusOption } from "./shared.ts";

export interface TaskEditCliOptions {
	title?: string;
	description?: string;
	status?: string;
	priority?: string;
	assignee?: string;
	due?: string;
	plan?: string;
	appendPlan?: string;
	notes?: string;
	appendNotes?: string;
	addLabel?: string[];
	removeLabel?: string[];
	addDep?: string[];
	removeDep?: string[];
	addAc?: string[];
	removeAc?: number[];
	checkAc?: number[];
	uncheckAc?: number[];
}

export interface LabelEditOptions {
	addLabels?: readonly string[];
	removeLabels?: readonly string[];
}

export interface DependencyEditOptions {
	addDependencies?: readonly string[];
	removeDependencies?: readonly string[];
}

export interface AcceptanceCriterionEditOptions {
	addCriteria?: readonly string[];
	removeIndices?: readonly number[];
	checkIndices?: readonly number[];
	uncheckIndices?: readonly number[];
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
export interface FieldChange {
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

export function registerEditCommand(program: Command): void {
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
		.action(async (taskId: string, options: TaskEditCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);

			try {
				const existingTask = await manager.getTask(taskId);

				if (!existingTask) {
					printCliError(`Task not found: ${taskId}`, globalOptions, {
						prefix: "Error",
					});
					process.exit(1);
					return;
				}

				const update = buildTaskUpdate(existingTask, options);
				if (!update.ok) {
					printCliError(update.error, globalOptions, { prefix: "Error" });
					process.exit(1);
					return;
				}

				const updatedTask = await manager.updateTask(
					taskId,
					update.value.updateInput,
				);
				printTaskEditSuccess(
					updatedTask,
					update.value.updateInput,
					update.value.changes,
					mode,
				);
			} catch (error) {
				printCliError(`Error updating task: ${String(error)}`, globalOptions);
				process.exit(1);
			}
		});
}

export function buildTaskUpdate(
	existing: Task,
	options: TaskEditCliOptions,
): CliParseResult<{
	updateInput: TaskUpdateInput;
	changes: FieldChange[];
}> {
	const updateInput: TaskUpdateInput = {};
	const changes: FieldChange[] = [];

	const basicFields = applyBasicFieldEdits(existing, options, updateInput);
	if (!basicFields.ok) {
		return basicFields;
	}
	changes.push(...basicFields.value);

	changes.push(...applyPlanEdits(existing, options, updateInput));
	changes.push(...applyNotesEdits(existing, options, updateInput));
	changes.push(...applyCollectionEdits(existing, options, updateInput));
	changes.push(
		...applyAcceptanceCriteriaUpdate(existing, options, updateInput),
	);

	if (changes.length === 0) {
		return {
			ok: false,
			error: "No changes specified. Use --help to see available options.",
		};
	}

	return { ok: true, value: { updateInput, changes } };
}

export function applyTaskLabelEdits(
	existing: readonly string[],
	edits: LabelEditOptions,
): string[] {
	const removeLabels = edits.removeLabels ?? [];
	const addLabels = edits.addLabels ?? [];
	let labels = [...existing];

	for (const label of removeLabels) {
		const labelLower = label.toLowerCase();
		labels = labels.filter((existingLabel) => {
			return existingLabel.toLowerCase() !== labelLower;
		});
	}

	for (const label of addLabels) {
		if (!labels.some((existingLabel) => isSameLabel(existingLabel, label))) {
			labels.push(label);
		}
	}

	return labels;
}

export function applyTaskDependencyEdits(
	existing: readonly string[],
	edits: DependencyEditOptions,
): string[] {
	const removeDependencies = edits.removeDependencies ?? [];
	const addDependencies = edits.addDependencies ?? [];
	let dependencies = [...existing];

	for (const dependency of removeDependencies) {
		const dependencyUpper = dependency.toUpperCase();
		dependencies = dependencies.filter((existingDependency) => {
			return existingDependency.toUpperCase() !== dependencyUpper;
		});
	}

	for (const dependency of addDependencies) {
		if (
			!dependencies.some((existingDependency) =>
				isSameDependency(existingDependency, dependency),
			)
		) {
			dependencies.push(dependency);
		}
	}

	return dependencies;
}

export function applyAcceptanceCriterionEdits(
	existing: readonly AcceptanceCriterion[],
	edits: AcceptanceCriterionEditOptions,
): AcceptanceCriterion[] {
	const removeIndices = edits.removeIndices ?? [];
	const addCriteria = edits.addCriteria ?? [];
	const checkIndices = edits.checkIndices ?? [];
	const uncheckIndices = edits.uncheckIndices ?? [];
	let criteria = existing.map((criterion) => ({ ...criterion }));

	for (const indexToRemove of [...removeIndices].sort((a, b) => b - a)) {
		const criterionIndex = criteria.findIndex(
			(criterion) => criterion.index === indexToRemove,
		);
		if (criterionIndex !== -1) {
			criteria.splice(criterionIndex, 1);
		}
	}

	criteria = criteria.map((criterion, index) => ({
		...criterion,
		index: index + 1,
	}));

	for (const text of addCriteria) {
		criteria.push({
			index: criteria.length + 1,
			text,
			checked: false,
		});
	}

	for (const indexToCheck of checkIndices) {
		criteria = setCriterionChecked(criteria, indexToCheck, true);
	}

	for (const indexToUncheck of uncheckIndices) {
		criteria = setCriterionChecked(criteria, indexToUncheck, false);
	}

	return criteria;
}

export function renderTaskEditSuccess(
	task: Task,
	update: TaskUpdateInput,
	changes: readonly FieldChange[],
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return task;
	}

	if (mode === "plain") {
		return renderPlainTaskEditSuccess(task, update);
	}

	return [
		`Updated task ${task.id}: ${task.title}`,
		`Changed: ${changes.map(formatChange).join(", ")}`,
	];
}

function applyBasicFieldEdits(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): CliParseResult<FieldChange[]> {
	const status = parseTaskStatusOption(options.status);
	if (!status.ok) {
		return status;
	}
	const priority = parseTaskPriorityOption(options.priority);
	if (!priority.ok) {
		return priority;
	}

	const dueDate = parseTaskEditDueDate(options.due);
	if (!dueDate.ok) {
		return dueDate;
	}

	return {
		ok: true,
		value: [
			...applyTitleEdit(existing, options, updateInput),
			...applyDescriptionEdit(existing, options, updateInput),
			...applyStatusEdit(existing, status.value, updateInput),
			...applyPriorityEdit(existing, priority.value, updateInput),
			...applyAssigneeEdit(existing, options, updateInput),
			...applyDueDateEdit(existing, options.due, dueDate.value, updateInput),
		],
	};
}

function applyTitleEdit(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (options.title) {
		updateInput.title = options.title;
		return [
			{
				field: "title",
				oldValue: existing.title,
				newValue: options.title,
			},
		];
	}

	return [];
}

function applyDescriptionEdit(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (options.description) {
		updateInput.description = processEscapedNewlines(options.description);
		return [
			{
				field: "description",
				oldValue: existing.description ? "existing" : "",
				newValue: "updated",
			},
		];
	}

	return [];
}

function applyStatusEdit(
	existing: Task,
	status: TaskUpdateInput["status"],
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (!status) {
		return [];
	}

	updateInput.status = status;
	return [{ field: "status", oldValue: existing.status, newValue: status }];
}

function applyPriorityEdit(
	existing: Task,
	priority: TaskUpdateInput["priority"],
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (!priority) {
		return [];
	}

	updateInput.priority = priority;
	return [
		{
			field: "priority",
			oldValue: existing.priority || "none",
			newValue: priority,
		},
	];
}

function applyAssigneeEdit(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (options.assignee) {
		updateInput.assignee = options.assignee;
		return [
			{
				field: "assignee",
				oldValue: existing.assignee || "none",
				newValue: options.assignee,
			},
		];
	}

	return [];
}

function applyDueDateEdit(
	existing: Task,
	rawDueDate: string | undefined,
	dueDate: Date | undefined,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (!dueDate) {
		return [];
	}

	updateInput.dueDate = dueDate;
	return [
		{
			field: "dueDate",
			oldValue: existing.dueDate
				? existing.dueDate.toISOString().split("T")[0] || ""
				: "none",
			newValue: dueDate.toISOString().split("T")[0] || rawDueDate || "",
		},
	];
}

function parseTaskEditDueDate(
	value: string | undefined,
): CliParseResult<Date | undefined> {
	if (value === undefined) {
		return { ok: true, value: undefined };
	}

	const dueDate = new Date(value);
	return Number.isNaN(dueDate.getTime())
		? {
				ok: false,
				error: `Invalid date format: ${value}. Use YYYY-MM-DD format.`,
			}
		: { ok: true, value: dueDate };
}

function applyPlanEdits(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (options.plan) {
		updateInput.implementationPlan = processEscapedNewlines(options.plan);
		return [
			{
				field: "plan",
				oldValue: existing.implementationPlan ? "existing" : "",
				newValue: "replaced",
			},
		];
	}

	if (!options.appendPlan) {
		return [];
	}

	const currentPlan = existing.implementationPlan || "";
	const separator = currentPlan ? "\n\n" : "";
	updateInput.implementationPlan =
		currentPlan + separator + processEscapedNewlines(options.appendPlan);
	return [{ field: "plan", oldValue: "", newValue: "" }];
}

function applyNotesEdits(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	if (options.notes) {
		updateInput.implementationNotes = processEscapedNewlines(options.notes);
		return [
			{
				field: "notes",
				oldValue: existing.implementationNotes ? "existing" : "",
				newValue: "replaced",
			},
		];
	}

	if (!options.appendNotes) {
		return [];
	}

	const currentNotes = existing.implementationNotes || "";
	const separator = currentNotes ? "\n\n" : "";
	updateInput.implementationNotes =
		currentNotes + separator + processEscapedNewlines(options.appendNotes);
	return [{ field: "notes", oldValue: "", newValue: "" }];
}

function applyCollectionEdits(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	return [
		...applyLabelUpdate(existing, options, updateInput),
		...applyDependencyUpdate(existing, options, updateInput),
	];
}

function applyLabelUpdate(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	const addLabels = options.addLabel ?? [];
	const removeLabels = options.removeLabel ?? [];
	if (addLabels.length === 0 && removeLabels.length === 0) {
		return [];
	}

	updateInput.labels = applyTaskLabelEdits(existing.labels, {
		addLabels,
		removeLabels,
	});

	return [
		...(addLabels.length > 0
			? [
					{
						field: "labels",
						oldValue: "",
						newValue: `+${addLabels.join(", +")}`,
					},
				]
			: []),
		...(removeLabels.length > 0
			? [
					{
						field: "labels",
						oldValue: `-${removeLabels.join(", -")}`,
						newValue: "",
					},
				]
			: []),
	];
}

function applyDependencyUpdate(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	const addDependencies = options.addDep ?? [];
	const removeDependencies = options.removeDep ?? [];
	if (addDependencies.length === 0 && removeDependencies.length === 0) {
		return [];
	}

	updateInput.dependencies = applyTaskDependencyEdits(existing.dependencies, {
		addDependencies,
		removeDependencies,
	});

	return [
		...(addDependencies.length > 0
			? [
					{
						field: "dependencies",
						oldValue: "",
						newValue: `+${addDependencies.join(", +")}`,
					},
				]
			: []),
		...(removeDependencies.length > 0
			? [
					{
						field: "dependencies",
						oldValue: `-${removeDependencies.join(", -")}`,
						newValue: "",
					},
				]
			: []),
	];
}

function applyAcceptanceCriteriaUpdate(
	existing: Task,
	options: TaskEditCliOptions,
	updateInput: TaskUpdateInput,
): FieldChange[] {
	const addCriteria = options.addAc ?? [];
	const removeIndices = options.removeAc ?? [];
	const checkIndices = options.checkAc ?? [];
	const uncheckIndices = options.uncheckAc ?? [];

	if (
		addCriteria.length === 0 &&
		removeIndices.length === 0 &&
		checkIndices.length === 0 &&
		uncheckIndices.length === 0
	) {
		return [];
	}

	updateInput.acceptanceCriteria = applyAcceptanceCriterionEdits(
		existing.acceptanceCriteria,
		{ addCriteria, removeIndices, checkIndices, uncheckIndices },
	);

	return [
		...renderAcceptanceAddChanges(addCriteria),
		...renderAcceptanceRemoveChanges(removeIndices),
		...renderAcceptanceCheckChanges(checkIndices),
		...renderAcceptanceUncheckChanges(uncheckIndices),
	];
}

function renderAcceptanceAddChanges(
	addCriteria: readonly string[],
): FieldChange[] {
	if (addCriteria.length === 0) {
		return [];
	}

	return [
		{
			field: "acceptanceCriteria",
			oldValue: "",
			newValue: `+${addCriteria.length} criteria`,
		},
	];
}

function renderAcceptanceRemoveChanges(
	removeIndices: readonly number[],
): FieldChange[] {
	if (removeIndices.length === 0) {
		return [];
	}

	return [
		{
			field: "acceptanceCriteria",
			oldValue: `-indices ${removeIndices.join(", ")}`,
			newValue: "",
		},
	];
}

function renderAcceptanceCheckChanges(
	checkIndices: readonly number[],
): FieldChange[] {
	if (checkIndices.length === 0) {
		return [];
	}

	return [
		{
			field: "acceptanceCriteria",
			oldValue: "",
			newValue: `checked #${checkIndices.join(", #")}`,
		},
	];
}

function renderAcceptanceUncheckChanges(
	uncheckIndices: readonly number[],
): FieldChange[] {
	if (uncheckIndices.length === 0) {
		return [];
	}

	return [
		{
			field: "acceptanceCriteria",
			oldValue: "",
			newValue: `unchecked #${uncheckIndices.join(", #")}`,
		},
	];
}

function renderPlainTaskEditSuccess(
	task: Task,
	update: TaskUpdateInput,
): string[] {
	return [
		`updated ${task.id}`,
		...(update.status ? [`status=${update.status}`] : []),
		...(update.priority ? [`priority=${update.priority}`] : []),
		...(update.title ? [`title=${update.title}`] : []),
		...(update.assignee ? [`assignee=${update.assignee}`] : []),
		...(update.dueDate
			? [`dueDate=${update.dueDate.toISOString().split("T")[0]}`]
			: []),
		...(update.labels ? [`labels=${update.labels.join(",")}`] : []),
		...(update.dependencies
			? [`dependencies=${update.dependencies.join(",")}`]
			: []),
	];
}

function printTaskEditSuccess(
	task: Task,
	update: TaskUpdateInput,
	changes: readonly FieldChange[],
	mode: CliOutputMode,
): void {
	const rendered = renderTaskEditSuccess(task, update, changes, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function setCriterionChecked(
	criteria: readonly AcceptanceCriterion[],
	indexToUpdate: number,
	checked: boolean,
): AcceptanceCriterion[] {
	return criteria.map((criterion) =>
		criterion.index === indexToUpdate ? { ...criterion, checked } : criterion,
	);
}

function isSameLabel(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

function isSameDependency(left: string, right: string): boolean {
	return left.toUpperCase() === right.toUpperCase();
}
