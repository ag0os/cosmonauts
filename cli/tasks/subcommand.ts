import { Command } from "commander";
import { scaffoldMissions } from "../scaffold/commands/missions.ts";
import { registerCreateCommand } from "./commands/create.ts";
import { registerDeleteCommand } from "./commands/delete.ts";
import { registerEditCommand } from "./commands/edit.ts";
import { registerListCommand } from "./commands/list.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerViewCommand } from "./commands/view.ts";

export function createTaskProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts task")
		.description("Task management for cosmonauts projects")
		.version("1.0.0");

	program
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	registerInitAlias(program);
	registerCreateCommand(program);
	registerListCommand(program);
	registerViewCommand(program);
	registerEditCommand(program);
	registerDeleteCommand(program);
	registerSearchCommand(program);

	return program;
}

/** Deprecated alias: `task init` → `scaffold missions`. */
function registerInitAlias(program: Command): void {
	program
		.command("init")
		.description("[deprecated: use `cosmonauts scaffold missions`]")
		.option("-p, --prefix <prefix>", "Task ID prefix", "TASK")
		.option("-n, --name <name>", "Project name")
		.option("-f, --force", "Force reinitialize even if already initialized")
		.action(async (options) => {
			console.warn(
				"Warning: `cosmonauts task init` is deprecated. Use `cosmonauts scaffold missions` instead.",
			);
			await scaffoldMissions(options, program.opts());
		});
}
