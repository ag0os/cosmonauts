import * as readline from "node:readline";
import type { Command } from "commander";
import { TaskManager } from "../../../lib/tasks/task-manager.js";

/**
 * Prompt user for confirmation
 * @param message - Message to display
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function promptConfirm(message: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${message} (y/N): `, (answer) => {
			rl.close();
			const normalized = answer.trim().toLowerCase();
			resolve(normalized === "y" || normalized === "yes");
		});
	});
}

export function registerCommand(program: Command): void {
	program
		.command("delete")
		.alias("rm")
		.description("Delete a task")
		.argument("<taskId>", "Task ID to delete (e.g., TASK-001)")
		.option("-f, --force", "Skip confirmation prompt")
		.action(async (taskId, options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			const manager = new TaskManager(projectRoot);

			try {
				// First, verify the task exists
				const task = await manager.getTask(taskId);

				if (!task) {
					const errorMsg = `Task not found: ${taskId}`;
					if (globalOptions.json) {
						console.log(JSON.stringify({ error: errorMsg }, null, 2));
					} else {
						console.error(`Error: ${errorMsg}`);
					}
					process.exit(1);
				}

				// Confirm deletion unless --force is specified
				if (!options.force) {
					const confirmed = await promptConfirm(
						`Delete task ${task.id}: "${task.title}"?`,
					);
					if (!confirmed) {
						if (globalOptions.json) {
							console.log(
								JSON.stringify({ cancelled: true, id: task.id }, null, 2),
							);
						} else if (globalOptions.plain) {
							console.log("cancelled");
						} else {
							console.log("Deletion cancelled.");
						}
						return;
					}
				}

				// Perform the deletion
				await manager.deleteTask(taskId);

				// Output based on format
				if (globalOptions.json) {
					console.log(
						JSON.stringify(
							{
								deleted: true,
								id: task.id,
								title: task.title,
							},
							null,
							2,
						),
					);
				} else if (globalOptions.plain) {
					console.log(`deleted ${task.id}`);
				} else {
					console.log(`Deleted task ${task.id}: ${task.title}`);
				}
			} catch (error) {
				const errorMsg = `Error deleting task: ${error}`;
				if (globalOptions.json) {
					console.log(JSON.stringify({ error: errorMsg }, null, 2));
				} else {
					console.error(errorMsg);
				}
				process.exit(1);
			}
		});
}
