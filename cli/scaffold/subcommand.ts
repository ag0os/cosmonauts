import { Command } from "commander";
import { registerCommand as registerMissions } from "./commands/missions.ts";

export function createScaffoldProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts scaffold")
		.description("Project scaffolding for cosmonauts")
		.version("1.0.0");

	program
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	registerMissions(program);

	return program;
}
