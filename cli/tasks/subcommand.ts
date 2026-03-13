import { Command } from "commander";
import { registerCommand as registerCreate } from "./commands/create.ts";
import { registerCommand as registerDelete } from "./commands/delete.ts";
import { registerCommand as registerEdit } from "./commands/edit.ts";
import { registerCommand as registerInit } from "./commands/init.ts";
import { registerCommand as registerList } from "./commands/list.ts";
import { registerCommand as registerSearch } from "./commands/search.ts";
import { registerCommand as registerView } from "./commands/view.ts";

export function createTaskProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts task")
		.description("Task management for cosmonauts projects")
		.version("1.0.0");

	program
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	registerInit(program);
	registerCreate(program);
	registerList(program);
	registerView(program);
	registerEdit(program);
	registerDelete(program);
	registerSearch(program);

	return program;
}
