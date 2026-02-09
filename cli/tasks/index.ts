import { Command } from "commander";
import { registerCommand as registerCreate } from "./commands/create.js";
import { registerCommand as registerDelete } from "./commands/delete.js";
import { registerCommand as registerEdit } from "./commands/edit.js";
import { registerCommand as registerInit } from "./commands/init.js";
import { registerCommand as registerList } from "./commands/list.js";
import { registerCommand as registerSearch } from "./commands/search.js";
import { registerCommand as registerView } from "./commands/view.js";

const program = new Command();

program
	.name("cosmonauts-tasks")
	.description("Task management for cosmonauts projects")
	.version("1.0.0");

// Global options
program
	.option("--plain", "Output in plain text format (for agents)")
	.option("--json", "Output in JSON format");

// Register subcommands
registerInit(program);
registerCreate(program);
registerList(program);
registerView(program);
registerEdit(program);
registerDelete(program);
registerSearch(program);

program.parse();
