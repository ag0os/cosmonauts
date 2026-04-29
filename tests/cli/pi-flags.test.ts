import { describe, expect, test } from "vitest";
import { parsePiFlags } from "../../cli/pi-flags.ts";

describe("parsePiFlags", () => {
	test("warns for disabled flags and skips their values", () => {
		const result = parsePiFlags([
			"--provider",
			"anthropic",
			"--tools",
			"read,write",
			"--extension",
			"/tmp/ext",
			"run",
		]);

		expect(result.flags).toEqual({});
		expect(result.remaining).toEqual(["run"]);
		expect(result.warnings).toEqual([
			'Flag "--provider" is not supported by cosmonauts (Pi flag "provider" is disabled)',
			'Flag "--tools" is not supported by cosmonauts (Pi flag "tools" is disabled)',
			'Flag "--extension" is not supported by cosmonauts (Pi flag "extensions" is disabled)',
		]);
	});

	test("preserves unknown flags in remaining args", () => {
		const result = parsePiFlags(["--unknown", "value", "-x"]);

		expect(result.flags).toEqual({});
		expect(result.remaining).toEqual(["--unknown", "value", "-x"]);
		expect(result.warnings).toEqual([]);
	});

	test("accumulates repeated theme flags", () => {
		const result = parsePiFlags(["--theme", "dark", "--theme", "light"]);

		expect(result.flags).toEqual({ themes: ["dark", "light"] });
		expect(result.remaining).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	test("parses no-themes as an enabled boolean flag", () => {
		const result = parsePiFlags(["--no-themes", "prompt"]);

		expect(result.flags).toEqual({ noThemes: true });
		expect(result.remaining).toEqual(["prompt"]);
		expect(result.warnings).toEqual([]);
	});

	test("drops enabled flags with missing values", () => {
		const result = parsePiFlags(["--session"]);

		expect(result.flags).toEqual({});
		expect(result.remaining).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	test("preserves non-flag positional args in order around Pi flags", () => {
		const result = parsePiFlags([
			"first",
			"--continue",
			"second",
			"--theme",
			"dark",
		]);

		expect(result.flags).toEqual({ continue: true, themes: ["dark"] });
		expect(result.remaining).toEqual(["first", "second"]);
		expect(result.warnings).toEqual([]);
	});
});
