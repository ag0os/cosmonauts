import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import matter from "gray-matter";
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
	fromFile?: string;
}

/**
 * Shape of a single row in a `task create --from-file` YAML document.
 * Field names mirror the on-disk Task representation (`labels`, `dependencies`)
 * rather than the CLI flag aliases (`-l`, `--depends-on`).
 */
export interface TaskBatchRow {
	title?: unknown;
	description?: unknown;
	priority?: unknown;
	assignee?: unknown;
	labels?: unknown;
	due?: unknown;
	dependencies?: unknown;
	ac?: unknown;
	parent?: unknown;
}

export function registerCreateCommand(program: Command): void {
	program
		.command("create")
		.description("Create a new task")
		.argument("[title]", "Task title (omit when using --from-file)")
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
		.option(
			"--from-file <path>",
			"Read a YAML array of task specs from <path> and create them in order",
		)
		.action(
			async (title: string | undefined, options: TaskCreateCliOptions) => {
				const projectRoot = process.cwd();
				const globalOptions = program.opts();
				const mode = getOutputMode(globalOptions);

				if (options.fromFile) {
					await runBatchCreate({
						filePath: options.fromFile,
						title,
						options,
						projectRoot,
						globalOptions,
						mode,
					});
					return;
				}

				if (!title) {
					printCliError(
						"Missing required argument: <title> (or use --from-file <path>)",
						globalOptions,
					);
					process.exit(1);
				}

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
			},
		);
}

interface BatchCreateContext {
	filePath: string;
	title: string | undefined;
	options: TaskCreateCliOptions;
	projectRoot: string;
	globalOptions: { json?: boolean; plain?: boolean };
	mode: CliOutputMode;
}

async function runBatchCreate(ctx: BatchCreateContext): Promise<void> {
	if (ctx.title !== undefined) {
		printCliError(
			"Cannot combine positional <title> with --from-file. Move the task into the YAML file or drop --from-file.",
			ctx.globalOptions,
		);
		process.exit(1);
	}
	if (hasPerTaskOptions(ctx.options)) {
		printCliError(
			"Per-task flags (-d, -p, -a, -l, --due, --depends-on, --ac, --parent) are ignored in --from-file mode. Put those fields in the YAML rows instead.",
			ctx.globalOptions,
		);
		process.exit(1);
	}

	let raw: string;
	try {
		raw = await readFile(resolve(ctx.projectRoot, ctx.filePath), "utf-8");
	} catch (error) {
		printCliError(
			`Failed to read ${ctx.filePath}: ${String(error)}`,
			ctx.globalOptions,
		);
		process.exit(1);
	}

	const parsed = parseTaskBatchYaml(raw);
	if (!parsed.ok) {
		printCliError(parsed.error, ctx.globalOptions);
		process.exit(1);
	}

	const inputs = parseTaskBatchInputs(parsed.value);
	if (!inputs.ok) {
		printCliError(inputs.error, ctx.globalOptions);
		process.exit(1);
	}

	const manager = new TaskManager(ctx.projectRoot);
	const created: Task[] = [];
	try {
		for (const input of inputs.value) {
			created.push(await manager.createTask(input));
		}
	} catch (error) {
		printCliError(String(error), ctx.globalOptions, {
			prefix: `Error creating task after ${created.length} of ${inputs.value.length} succeeded`,
		});
		process.exit(1);
	}

	emitBatchResult(created, ctx.mode);
}

function hasPerTaskOptions(options: TaskCreateCliOptions): boolean {
	if (options.description !== undefined) return true;
	if (options.priority !== undefined) return true;
	if (options.assignee !== undefined) return true;
	if (options.due !== undefined) return true;
	if (options.parent !== undefined) return true;
	if (options.label && options.label.length > 0) return true;
	if (options.dependsOn && options.dependsOn.length > 0) return true;
	if (options.ac && options.ac.length > 0) return true;
	return false;
}

function emitBatchResult(tasks: readonly Task[], mode: CliOutputMode): void {
	if (mode === "json") {
		printJson(tasks);
		return;
	}
	if (mode === "plain") {
		printLines(tasks.map((task) => task.id));
		return;
	}
	printLines(tasks.map((task) => `Created task ${task.id}: ${task.title}`));
}

/**
 * gray-matter ships js-yaml as its default engine but does not surface it on
 * its TypeScript type. Cast through `unknown` to reuse the same parser we
 * already depend on, rather than adding a new top-level dependency.
 */
const grayMatterYaml = (
	matter as unknown as {
		engines: { yaml: { parse: (raw: string) => unknown } };
	}
).engines.yaml;

export function parseTaskBatchYaml(raw: string): CliParseResult<unknown> {
	try {
		return { ok: true, value: grayMatterYaml.parse(raw) };
	} catch (error) {
		return {
			ok: false,
			error: `Invalid YAML in batch file: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function parseTaskBatchInputs(
	rawRows: unknown,
): CliParseResult<TaskCreateInput[]> {
	if (rawRows === null || rawRows === undefined) {
		return { ok: false, error: "Batch file is empty." };
	}
	if (!Array.isArray(rawRows)) {
		return {
			ok: false,
			error:
				"Batch file must contain a YAML array of task specs at the top level.",
		};
	}
	if (rawRows.length === 0) {
		return { ok: false, error: "Batch file contains no task rows." };
	}

	const inputs: TaskCreateInput[] = [];
	for (let index = 0; index < rawRows.length; index += 1) {
		const row = rawRows[index];
		const result = parseTaskBatchRow(row, index);
		if (!result.ok) {
			return result;
		}
		inputs.push(result.value);
	}
	return { ok: true, value: inputs };
}

function parseTaskBatchRow(
	row: unknown,
	index: number,
): CliParseResult<TaskCreateInput> {
	const rowLabel = `row ${index + 1}`;
	if (row === null || typeof row !== "object" || Array.isArray(row)) {
		return {
			ok: false,
			error: `${rowLabel}: expected a mapping of task fields.`,
		};
	}
	const spec = row as TaskBatchRow;

	if (typeof spec.title !== "string" || spec.title.trim().length === 0) {
		return { ok: false, error: `${rowLabel}: missing required field "title".` };
	}

	const description = ensureOptionalString(
		spec.description,
		"description",
		rowLabel,
	);
	if (!description.ok) return description;

	const assignee = ensureOptionalString(spec.assignee, "assignee", rowLabel);
	if (!assignee.ok) return assignee;

	const parent = ensureOptionalString(spec.parent, "parent", rowLabel);
	if (!parent.ok) return parent;

	const labels = ensureOptionalStringArray(spec.labels, "labels", rowLabel);
	if (!labels.ok) return labels;

	const dependencies = ensureOptionalStringArray(
		spec.dependencies,
		"dependencies",
		rowLabel,
	);
	if (!dependencies.ok) return dependencies;

	const ac = ensureOptionalStringArray(spec.ac, "ac", rowLabel);
	if (!ac.ok) return ac;

	let priority: TaskPriority | undefined;
	if (spec.priority !== undefined && spec.priority !== null) {
		if (typeof spec.priority !== "string" || !isValidPriority(spec.priority)) {
			return {
				ok: false,
				error: `${rowLabel}: invalid priority "${String(spec.priority)}". Must be one of: high, medium, low.`,
			};
		}
		priority = spec.priority;
	}

	// YAML 1.1 (js-yaml's default, what gray-matter ships) auto-converts
	// timestamp-shaped scalars like `2026-06-01` into Date objects before this
	// validator runs. Accept both Date and string forms so unquoted YAML dates
	// don't need to be escaped.
	let dueDate: Date | undefined;
	if (spec.due !== undefined && spec.due !== null) {
		if (spec.due instanceof Date) {
			if (Number.isNaN(spec.due.getTime())) {
				return {
					ok: false,
					error: `${rowLabel}: "due" is not a valid date.`,
				};
			}
			dueDate = spec.due;
		} else if (typeof spec.due === "string") {
			const parsed = parseTaskDueDate(spec.due);
			if (!parsed.ok) {
				return { ok: false, error: `${rowLabel}: ${parsed.error}` };
			}
			dueDate = parsed.value;
		} else {
			return {
				ok: false,
				error: `${rowLabel}: "due" must be a date string (YYYY-MM-DD) or a YAML date value.`,
			};
		}
	}

	return {
		ok: true,
		value: {
			title: spec.title,
			description: description.value,
			priority,
			assignee: assignee.value,
			labels: labels.value,
			dueDate,
			dependencies: dependencies.value,
			acceptanceCriteria: ac.value,
			parent: parent.value,
		},
	};
}

function ensureOptionalString(
	value: unknown,
	field: string,
	rowLabel: string,
): CliParseResult<string | undefined> {
	if (value === undefined || value === null) {
		return { ok: true, value: undefined };
	}
	if (typeof value !== "string") {
		return {
			ok: false,
			error: `${rowLabel}: "${field}" must be a string.`,
		};
	}
	return { ok: true, value };
}

function ensureOptionalStringArray(
	value: unknown,
	field: string,
	rowLabel: string,
): CliParseResult<string[] | undefined> {
	if (value === undefined || value === null) {
		return { ok: true, value: undefined };
	}
	if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
		return {
			ok: false,
			error: `${rowLabel}: "${field}" must be an array of strings.`,
		};
	}
	return { ok: true, value: value as string[] };
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
