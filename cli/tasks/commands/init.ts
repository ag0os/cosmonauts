import type { Command } from "commander";
import { loadConfig } from "../../../lib/tasks/file-system.js";
import { TaskManager } from "../../../lib/tasks/task-manager.js";

export function registerCommand(program: Command): void {
	program
		.command("init")
		.description("Initialize task system in the current directory")
		.option("-p, --prefix <prefix>", "Task ID prefix", "TASK")
		.option("-n, --name <name>", "Project name")
		.option("-f, --force", "Force reinitialize even if already initialized")
		.action(async (options) => {
			const projectRoot = process.cwd();
			const globalOptions = program.opts();

			// Check if already initialized
			const existingConfig = await loadConfig(projectRoot);
			if (existingConfig && !options.force) {
				if (globalOptions.json) {
					console.log(
						JSON.stringify(
							{
								status: "already_initialized",
								path: projectRoot,
								message:
									"Task system is already initialized. Use --force to reinitialize.",
							},
							null,
							2,
						),
					);
				} else if (globalOptions.plain) {
					console.log("already_initialized");
					console.log(`path=${projectRoot}`);
				} else {
					console.log(
						"Warning: Task system is already initialized in this directory",
					);
					console.log("Use --force to reinitialize");
				}
				return;
			}

			// Initialize TaskManager
			const manager = new TaskManager(projectRoot);
			const config = await manager.init({
				prefix: options.prefix,
				projectName: options.name,
			});

			// Output based on format
			if (globalOptions.json) {
				console.log(
					JSON.stringify(
						{
							status: "initialized",
							path: projectRoot,
							config,
						},
						null,
						2,
					),
				);
			} else if (globalOptions.plain) {
				console.log(`initialized ${projectRoot}`);
				console.log(`prefix=${config.prefix}`);
				if (config.projectName) {
					console.log(`name=${config.projectName}`);
				}
			} else {
				console.log(`Initialized task system in ${projectRoot}`);
				console.log(`- Created missions/tasks/ directory`);
				console.log(
					`- Created missions/tasks/config.json with prefix: ${config.prefix}`,
				);
				if (config.projectName) {
					console.log(`- Project name: ${config.projectName}`);
				}
			}
		});
}
