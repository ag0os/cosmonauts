import { Command } from "commander";
import { registerArchiveCommand } from "./commands/archive.ts";
import { registerCreateCommand } from "./commands/create.ts";
import { registerDeleteCommand } from "./commands/delete.ts";
import { registerEditCommand } from "./commands/edit.ts";
import { registerListCommand } from "./commands/list.ts";
import { registerViewCommand } from "./commands/view.ts";

export function createPlanProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts plan")
		.description("Plan management for cosmonauts projects")
		.version("1.0.0");

	program
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	registerCreateCommand(program);
	registerListCommand(program);
	registerViewCommand(program);
	registerEditCommand(program);
	registerDeleteCommand(program);
	registerArchiveCommand(program);

	return program;
}
