/**
 * Tests for init extension.
 * Verifies the buildInitPrompt function and command registration.
 */

import { describe, expect, test } from "vitest";
import {
	buildInitPrompt,
	default as initExtension,
} from "../../domains/shared/extensions/init/index.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

describe("buildInitPrompt", () => {
	test("includes the project directory in the prompt", () => {
		const prompt = buildInitPrompt("/home/user/my-project");

		expect(prompt).toContain("/home/user/my-project");
	});

	test("instructs to check for existing AGENTS.md", () => {
		const prompt = buildInitPrompt("/tmp/project");

		expect(prompt).toContain("AGENTS.md already exists");
	});

	test("instructs to check for CLAUDE.md as foundation", () => {
		const prompt = buildInitPrompt("/tmp/project");

		expect(prompt).toContain("CLAUDE.md");
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
