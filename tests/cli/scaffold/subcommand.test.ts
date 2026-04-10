import { describe, expect, it } from "vitest";
import { createScaffoldProgram } from "../../../cli/scaffold/subcommand.ts";

describe("createScaffoldProgram", () => {
	it("returns a Commander program", () => {
		const program = createScaffoldProgram();
		expect(program.name()).toBe("cosmonauts scaffold");
	});

	it("has --plain and --json global options", () => {
		const program = createScaffoldProgram();
		const opts = program.opts();
		expect(opts.plain).toBeUndefined();
		expect(opts.json).toBeUndefined();
	});

	it("registers the missions subcommand", () => {
		const program = createScaffoldProgram();
		const commandNames = program.commands.map((c) => c.name());

		expect(commandNames).toContain("missions");
	});
});
