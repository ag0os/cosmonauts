/**
 * Tests for CLI argument parsing (parseCliArgs).
 *
 * Only tests the pure argument-parsing logic — no real Pi sessions or API keys.
 */

import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../../cli/main.ts";

describe("parseCliArgs", () => {
	test("defaults: interactive mode, no prompt", () => {
		const opts = parseCliArgs([]);

		expect(opts.print).toBe(false);
		expect(opts.prompt).toBeUndefined();
		expect(opts.workflow).toBeUndefined();
		expect(opts.chain).toBeUndefined();
		expect(opts.model).toBeUndefined();
		expect(opts.thinking).toBeUndefined();
		expect(opts.init).toBe(false);
		expect(opts.listWorkflows).toBe(false);
	});

	test("positional args joined into prompt", () => {
		const opts = parseCliArgs(["hello", "world"]);

		expect(opts.prompt).toBe("hello world");
	});

	test("single positional arg as prompt", () => {
		const opts = parseCliArgs(["what is 2+2"]);

		expect(opts.prompt).toBe("what is 2+2");
	});

	test("--print flag sets print mode", () => {
		const opts = parseCliArgs(["--print", "do something"]);

		expect(opts.print).toBe(true);
		expect(opts.prompt).toBe("do something");
	});

	test("-p shorthand sets print mode", () => {
		const opts = parseCliArgs(["-p", "do something"]);

		expect(opts.print).toBe(true);
		expect(opts.prompt).toBe("do something");
	});

	test("--workflow sets workflow name", () => {
		const opts = parseCliArgs(["--workflow", "plan-and-build", "my prompt"]);

		expect(opts.workflow).toBe("plan-and-build");
		expect(opts.prompt).toBe("my prompt");
	});

	test("-w shorthand sets workflow name", () => {
		const opts = parseCliArgs(["-w", "plan-and-build"]);

		expect(opts.workflow).toBe("plan-and-build");
	});

	test("--chain sets chain expression", () => {
		const opts = parseCliArgs([
			"--chain",
			"planner -> coordinator",
			"build it",
		]);

		expect(opts.chain).toBe("planner -> coordinator");
		expect(opts.prompt).toBe("build it");
	});

	test("-c shorthand sets chain expression", () => {
		const opts = parseCliArgs(["-c", "planner -> worker"]);

		expect(opts.chain).toBe("planner -> worker");
	});

	test("--model sets model override", () => {
		const opts = parseCliArgs(["--model", "anthropic/claude-opus-4-0"]);

		expect(opts.model).toBe("anthropic/claude-opus-4-0");
	});

	test("-m shorthand sets model override", () => {
		const opts = parseCliArgs(["-m", "anthropic/claude-opus-4-0"]);

		expect(opts.model).toBe("anthropic/claude-opus-4-0");
	});

	test("--thinking without value defaults to high", () => {
		const opts = parseCliArgs(["--thinking"]);

		expect(opts.thinking).toBe("high");
	});

	test("--thinking with value sets specific level", () => {
		const opts = parseCliArgs(["--thinking", "medium"]);

		expect(opts.thinking).toBe("medium");
	});

	test("--thinking with valid levels", () => {
		for (const level of ["off", "minimal", "low", "medium", "high", "xhigh"]) {
			const opts = parseCliArgs(["--thinking", level]);
			expect(opts.thinking).toBe(level);
		}
	});

	test("--thinking with invalid value throws", () => {
		expect(() => parseCliArgs(["--thinking", "turbo"])).toThrow(
			/Invalid thinking level/,
		);
	});

	test("init subcommand sets init flag", () => {
		const opts = parseCliArgs(["init"]);

		expect(opts.init).toBe(true);
		expect(opts.prompt).toBeUndefined();
	});

	test("--list-workflows flag", () => {
		const opts = parseCliArgs(["--list-workflows"]);

		expect(opts.listWorkflows).toBe(true);
	});

	test("combined flags: --print with --model and prompt", () => {
		const opts = parseCliArgs([
			"--print",
			"--model",
			"anthropic/claude-opus-4-0",
			"explain this",
		]);

		expect(opts.print).toBe(true);
		expect(opts.model).toBe("anthropic/claude-opus-4-0");
		expect(opts.prompt).toBe("explain this");
	});

	test("combined flags: --workflow with --thinking", () => {
		const opts = parseCliArgs([
			"--workflow",
			"plan-and-build",
			"--thinking",
			"high",
			"build feature",
		]);

		expect(opts.workflow).toBe("plan-and-build");
		expect(opts.thinking).toBe("high");
		expect(opts.prompt).toBe("build feature");
	});
});
