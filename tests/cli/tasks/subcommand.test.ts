import { describe, expect, it } from "vitest";
import { createTaskProgram } from "../../../cli/tasks/subcommand.ts";

describe("createTaskProgram", () => {
	it("returns a Commander program", () => {
		const program = createTaskProgram();
		expect(program.name()).toBe("cosmonauts task");
	});

	it("has --plain and --json global options", () => {
		const program = createTaskProgram();
		const opts = program.opts();
		expect(opts.plain).toBeUndefined();
		expect(opts.json).toBeUndefined();
	});

	it("registers expected subcommands", () => {
		const program = createTaskProgram();
		const commandNames = program.commands.map((c) => c.name());

		expect(commandNames).toContain("init");
		expect(commandNames).toContain("create");
		expect(commandNames).toContain("list");
		expect(commandNames).toContain("view");
		expect(commandNames).toContain("edit");
		expect(commandNames).toContain("delete");
		expect(commandNames).toContain("search");
	});
});
