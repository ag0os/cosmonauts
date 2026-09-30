/**
 * Tests for cli/analysis/subcommand.ts: option wiring, JSON and text output,
 * and operational failures of `cosmonauts analysis changed-functions`.
 */

import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createAnalysisProgram,
	renderChangedFunctionsText,
} from "../../../cli/analysis/subcommand.ts";
import type {
	ChangedFunction,
	ChangedFunctionsReport,
	ResolveChangedFunctionsOptions,
} from "../../../lib/code-health/changed-functions.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const REGRESSED: ChangedFunction = {
	file: "src/sample.ts",
	name: "simple",
	startLine: 27,
	endLine: 32,
	cyclomatic: 2,
	cognitive: 1,
	crap: 6,
	base: { cyclomatic: 1, cognitive: 0, crap: 2 },
	regressed: true,
};

const NEW_FUNCTION: ChangedFunction = {
	file: "src/sample.ts",
	name: "<arrow>",
	startLine: 34,
	endLine: 36,
	cyclomatic: 1,
	cognitive: 0,
	crap: null,
	base: null,
	regressed: false,
};

function report(functions: readonly ChangedFunction[]): ChangedFunctionsReport {
	return { base: "main", baseCommit: "abc123", functions };
}

describe("renderChangedFunctionsText", () => {
	test("marks a regressed function and shows its base metrics", () => {
		expect(renderChangedFunctionsText(report([REGRESSED]))).toEqual([
			"src/sample.ts:27-32  simple  cyclomatic 2 (base 1)  cognitive 1 (base 0)  crap 6 (base 2)  REGRESSED",
		]);
	});

	test("marks a new function and prints a missing CRAP as n/a", () => {
		expect(renderChangedFunctionsText(report([NEW_FUNCTION]))).toEqual([
			"src/sample.ts:34-36  <arrow>  cyclomatic 1  cognitive 0  crap n/a  NEW",
		]);
	});

	test("prints no marker for a changed function that did not regress", () => {
		const line = renderChangedFunctionsText(
			report([{ ...REGRESSED, regressed: false }]),
		)[0];

		expect(line).toMatch(/crap 6 \(base 2\)$/);
	});

	test("says so when no function changed", () => {
		expect(renderChangedFunctionsText(report([]))).toEqual([
			"No changed functions since main.",
		]);
	});
});

describe("analysis changed-functions command", () => {
	let output: ReturnType<typeof captureCliOutput> | undefined;

	afterEach(() => {
		output?.restore();
		output = undefined;
	});

	function run(
		argv: string[],
		result = report([REGRESSED]),
		signals = new EventEmitter(),
		implementation = async (_options: ResolveChangedFunctionsOptions) => result,
	) {
		const resolve = vi.fn(implementation);
		const program = createAnalysisProgram({
			cwd: "/repo",
			resolveChangedFunctions: resolve,
			signals,
		});
		for (const command of [program, ...program.commands])
			command.exitOverride();
		output = captureCliOutput();
		return { resolve, done: program.parseAsync(argv, { from: "user" }) };
	}

	test("passes the base, file, and working directory to the resolver", async () => {
		const { resolve, done } = run([
			"changed-functions",
			"--base",
			"main",
			"--file",
			"src/sample.ts",
		]);
		await done;

		expect(resolve).toHaveBeenCalledWith({
			cwd: "/repo",
			base: "main",
			file: "src/sample.ts",
			signal: expect.any(AbortSignal),
		});
	});

	test.each([
		"SIGINT",
		"SIGTERM",
	])("aborts the resolver's signal on %s", async (name) => {
		const signals = new EventEmitter();
		let aborted: boolean | undefined;
		const { done } = run(
			["changed-functions", "--base", "main"],
			report([]),
			signals,
			async (options) => {
				signals.emit(name);
				aborted = options.signal?.aborted;
				return report([]);
			},
		);
		await done;

		expect(aborted).toBe(true);
	});

	test("removes its signal listeners when the run ends", async () => {
		const signals = new EventEmitter();
		const during: number[] = [];
		const { done } = run(
			["changed-functions", "--base", "main"],
			report([]),
			signals,
			async () => {
				during.push(
					signals.listenerCount("SIGINT"),
					signals.listenerCount("SIGTERM"),
				);
				return report([]);
			},
		);
		await done;

		expect(during).toEqual([1, 1]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	test("prints the report as JSON with --format json", async () => {
		const { done } = run([
			"changed-functions",
			"--base",
			"main",
			"--format",
			"json",
		]);
		await done;

		expect(JSON.parse(output?.stdout() ?? "")).toEqual(report([REGRESSED]));
	});

	test("prints base as null for a new function in JSON", async () => {
		const { done } = run(
			["changed-functions", "--base", "main", "--format", "json"],
			report([NEW_FUNCTION]),
		);
		await done;

		expect(JSON.parse(output?.stdout() ?? "").functions[0]).toHaveProperty(
			"base",
			null,
		);
	});

	test("prints one text line per function by default", async () => {
		const { done } = run(["changed-functions", "--base", "main"]);
		await done;

		expect(output?.stdout()).toBe(
			`${renderChangedFunctionsText(report([REGRESSED]))[0]}\n`,
		);
	});

	test("rejects an unknown format", async () => {
		const { done } = run([
			"changed-functions",
			"--base",
			"main",
			"--format",
			"xml",
		]);

		await expect(done).rejects.toThrow(/Allowed choices are text, json/);
	});

	test("requires a base revision", async () => {
		const { done } = run(["changed-functions"]);

		await expect(done).rejects.toThrow(/--base <rev>/);
	});
});

describe("analysis changed-functions against a real repository", () => {
	const tmp = useTempDir("analysis-cli-");

	test("fails for an unknown base revision", async () => {
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: tmp.path });
		git("init", "-q", "-b", "main");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		git("config", "commit.gpgsign", "false");
		await writeFile(join(tmp.path, "a.ts"), "export const a = 1;\n");
		git("add", "a.ts");
		git("commit", "-q", "--no-verify", "-m", "base");

		const program = createAnalysisProgram({ cwd: tmp.path });

		await expect(
			program.parseAsync(["changed-functions", "--base", "nope"], {
				from: "user",
			}),
		).rejects.toThrow("unknown base revision: nope");
	});
});
