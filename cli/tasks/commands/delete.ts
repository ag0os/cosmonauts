import * as readline from "node:readline";
import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../lib/tasks/task-types.ts";
import { printCliError } from "../../shared/errors.ts";
import type { CliOutputMode, CliParseResult } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

interface TaskDeleteCliOptions {
	force?: boolean;
}

export type TaskDeleteResult =
	| { status: "deleted"; task: Task }
	| { status: "cancelled"; task: Task };

/**
 * Prompt user for confirmation
 * @param message - Message to display
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function promptConfirm(message: string): Promise<boolean> {
	const prompt = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		prompt.question(formatConfirmQuestion(message), (answer) => {
			prompt.close();
			resolve(isConfirmedAnswer(answer));
		});
	});
}

function formatConfirmQuestion(message: string): string {
	return `${message} (y/N): `;
}

function isConfirmedAnswer(answer: string): boolean {
	const normalized = answer.trim().toLowerCase();
	return normalized === "y" || normalized === "yes";
}

export function registerDeleteCommand(program: Command): void {
	program
		.command("delete")
		.alias("rm")
		.description("Delete a task")
		.argument("<taskId>", "Task ID to delete (e.g., TASK-001)")
		.option("-f, --force", "Skip confirmation prompt")
		.action(async (taskId: string, options: TaskDeleteCliOptions) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();
			const mode = getOutputMode(globalOptions);

			const manager = new TaskManager(projectRoot);

			try {
				const task = await loadTaskForDeletion(manager, taskId);
				if (!task.ok) {
					printCliError(task.error, globalOptions, { prefix: "Error" });
					process.exit(1);
					return;
				}

				const confirmed = await confirmTaskDeletion(task.value, options.force);
				if (!confirmed) {
					printTaskDeleteResult(
						{ status: "cancelled", task: task.value },
						mode,
					);
					return;
				}

				await manager.deleteTask(taskId);
				printTaskDeleteResult({ status: "deleted", task: task.value }, mode);
			} catch (error) {
				printCliError(`Error deleting task: ${String(error)}`, globalOptions);
				process.exit(1);
			}
		});
}

export async function loadTaskForDeletion(
	manager: TaskManager,
	taskId: string,
): Promise<CliParseResult<Task>> {
	const task = await manager.getTask(taskId);

	if (!task) {
		return { ok: false, error: `Task not found: ${taskId}` };
	}

	return { ok: true, value: task };
}

export async function confirmTaskDeletion(
	task: Task,
	force = false,
): Promise<boolean> {
	if (force) {
		return true;
	}

	return promptConfirm(`Delete task ${task.id}: "${task.title}"?`);
}

export function renderTaskDeleteResult(
	result: TaskDeleteResult,
	mode: CliOutputMode,
): unknown | string[] {
	if (result.status === "cancelled") {
		return renderTaskDeleteCancellation(result.task, mode);
	}

	return renderTaskDeleteSuccess(result.task, mode);
}

function printTaskDeleteResult(
	result: TaskDeleteResult,
	mode: CliOutputMode,
): void {
	const rendered = renderTaskDeleteResult(result, mode);
	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderTaskDeleteCancellation(
	task: Task,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return { cancelled: true, id: task.id };
	}

	if (mode === "plain") {
		return ["cancelled"];
	}

	return ["Deletion cancelled."];
}

function renderTaskDeleteSuccess(
	task: Task,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return {
			deleted: true,
			id: task.id,
			title: task.title,
		};
	}

	if (mode === "plain") {
		return [`deleted ${task.id}`];
	}

	return [`Deleted task ${task.id}: ${task.title}`];
}
