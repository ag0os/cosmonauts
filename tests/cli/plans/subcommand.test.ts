import { describe, expect, it } from "vitest";
import { renderPlanConformanceResult } from "../../../cli/plans/commands/check-artifacts.ts";
import { createPlanProgram } from "../../../cli/plans/index.ts";
import type { PlanConformanceResult } from "../../../lib/artifacts/index.ts";

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
		expect(commandNames).toContain("check-artifacts");
	});

	it("escapes terminal controls in text diagnostics while preserving JSON data", () => {
		const controlSequence = "\u001b";
		const result: PlanConformanceResult = {
			ok: false,
			planSlug: `unsafe${controlSequence}[31m\nplan`,
			issues: [
				{
					kind: "unresolved-decision-citation",
					message: `unsafe${controlSequence}[2J\rmessage`,
					actual: `D-${controlSequence}[1m099`,
				},
			],
		};

		expect(renderPlanConformanceResult(result, "json")).toBe(result);
		for (const mode of ["plain", "human"] as const) {
			const rendered = renderPlanConformanceResult(result, mode) as string[];
			const text = rendered.join("\n");
			expect(text).not.toContain(controlSequence);
			expect(text).toContain("\\u001b");
			expect(text).toContain("\\u000a");
			expect(text).toContain("\\u000d");
		}
	});
});
