import { describe, expect, test } from "vitest";
import { createDefaultProjectConfig } from "../../lib/config/defaults.ts";
import { buildInitBootstrapPrompt } from "../../lib/init/prompt.ts";

describe("buildInitBootstrapPrompt", () => {
	const cwd = "/tmp/project";
	const defaultConfig = createDefaultProjectConfig();
	const prompt = buildInitBootstrapPrompt({ cwd, defaultConfig });

	test("includes the init skill instruction", () => {
		expect(prompt).toContain("/skill:init");
	});

	test("includes the working directory", () => {
		expect(prompt).toContain(cwd);
	});

	test("embeds the serialized default config", () => {
		expect(prompt).toContain(JSON.stringify(defaultConfig, null, 2));
	});

	test("requires confirmation before writing files", () => {
		expect(prompt).toContain("Do not write or overwrite any files");
		expect(prompt).toContain("explicitly confirms");
	});
});
