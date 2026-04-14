import { describe, expect, test } from "vitest";
import {
	buildInitPrompt,
	default as initExtension,
} from "../../domains/shared/extensions/init/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

describe("buildInitPrompt", () => {
	test("includes the project directory and init skill instruction", () => {
		const prompt = buildInitPrompt("/home/user/my-project");

		expect(prompt).toContain("/home/user/my-project");
		expect(prompt).toContain("/skill:init");
	});

	test("does not embed the old workflow checklist", () => {
		const prompt = buildInitPrompt("/tmp/project");

		expect(prompt).not.toContain("Follow these steps:");
		expect(prompt).not.toContain("AGENTS.md already exists");
		expect(prompt).not.toContain("CLAUDE.md exists in the project root");
	});
});

describe("init extension", () => {
	test("registers /init command", () => {
		const commands = new Map<string, unknown>();
		const pi = {
			...createMockPi(),
			registerCommand(name: string, def: unknown) {
				commands.set(name, def);
			},
		};

		initExtension(pi as never);

		expect(commands.has("init")).toBe(true);
	});
});
