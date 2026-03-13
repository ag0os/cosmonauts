import { describe, expect, it } from "vitest";
import { createPlanProgram } from "../../../cli/plans/index.ts";

describe("createPlanProgram", () => {
	it("returns a Commander program", () => {
		const program = createPlanProgram();
		expect(program.name()).toBe("cosmonauts plan");
	});

	it("has --plain and --json global options", () => {
		const program = createPlanProgram();
		const opts = program.opts();
		expect(opts.plain).toBeUndefined();
		expect(opts.json).toBeUndefined();
	});

	it("registers expected subcommands", () => {
		const program = createPlanProgram();
		const commandNames = program.commands.map((c) => c.name());

		expect(commandNames).toContain("create");
		expect(commandNames).toContain("list");
		expect(commandNames).toContain("view");
		expect(commandNames).toContain("edit");
		expect(commandNames).toContain("delete");
		expect(commandNames).toContain("archive");
	});
});
