import { Command } from "commander";
import { registerMissionsCommand } from "./commands/missions.ts";

export function createScaffoldProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts scaffold")
		.description("Project scaffolding for cosmonauts")
		.version("1.0.0");

	program
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	registerMissionsCommand(program);

	return program;
}
