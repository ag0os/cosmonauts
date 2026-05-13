import { describe, expect, it } from "vitest";
import {
	createSkillsProgram,
	renderSkillsList,
	type SkillListItem,
} from "../../../cli/skills/subcommand.ts";
import type { DiscoveredSkill } from "../../../lib/skills/index.ts";

function skill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
	return {
		name: "plan",
		description: "How to structure plans",
		domain: "coding",
		dirPath: "/abs/coding/skills/plan",
		...overrides,
	};
}

describe("renderSkillsList", () => {
	const skills: DiscoveredSkill[] = [
		skill(),
		skill({
			name: "tdd",
			description: "Test-first development",
			domain: "coding",
			dirPath: "/abs/coding/skills/tdd",
		}),
		skill({
			name: "pi",
			description: "Pi framework reference",
			domain: "shared",
			dirPath: "/abs/shared/skills/pi",
		}),
	];

	it("emits a JSON array stripped of internal dirPath", () => {
		const result = renderSkillsList(skills, "json");
		expect(result.kind).toBe("json");
		if (result.kind === "json") {
			const items = result.value as SkillListItem[];
			expect(items).toHaveLength(3);
			expect(items[0]).toEqual({
				name: "plan",
				description: "How to structure plans",
				domain: "coding",
			});
			// dirPath is an absolute filesystem detail; agents shouldn't see it.
			expect(
				(items[0] as unknown as Record<string, unknown>).dirPath,
			).toBeUndefined();
		}
	});

	it("plain mode emits tab-separated name, domain, description", () => {
		expect(renderSkillsList(skills, "plain")).toEqual({
			kind: "lines",
			lines: [
				"plan\tcoding\tHow to structure plans",
				"tdd\tcoding\tTest-first development",
				"pi\tshared\tPi framework reference",
			],
		});
	});

	it("human mode pads name and domain columns to align rows", () => {
		const rendered = renderSkillsList(skills, "human");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			// All rows should share leading-padding alignment with two-space gutter.
			expect(rendered.lines[0]).toMatch(
				/^ {2}plan {2}\s*coding\s* {2}How to structure plans$/,
			);
			expect(rendered.lines[1]).toMatch(
				/^ {2}tdd\s+ {2}\s*coding\s* {2}Test-first development$/,
			);
			expect(rendered.lines[2]).toMatch(
				/^ {2}pi\s+ {2}\s*shared\s* {2}Pi framework reference$/,
			);
		}
	});

	it("human mode emits 'No skills found.' on empty input", () => {
		expect(renderSkillsList([], "human")).toEqual({
			kind: "lines",
			lines: ["No skills found."],
		});
	});

	it("JSON mode on empty input emits an empty array", () => {
		expect(renderSkillsList([], "json")).toEqual({ kind: "json", value: [] });
	});
});

describe("createSkillsProgram", () => {
	it("returns a Commander program named 'cosmonauts skills'", () => {
		const program = createSkillsProgram();
		expect(program.name()).toBe("cosmonauts skills");
	});

	it("registers list and export subcommands", () => {
		const program = createSkillsProgram();
		const commandNames = program.commands.map((c) => c.name());
		expect(commandNames).toContain("list");
		expect(commandNames).toContain("export");
	});

	it("exposes --json and --plain output options", () => {
		const program = createSkillsProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--json");
		expect(optionNames).toContain("--plain");
	});
});
