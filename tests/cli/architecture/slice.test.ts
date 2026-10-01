/**
 * Tests for `cosmonauts architecture slice`: the happy path over a
 * generated graph.json, and the actionable errors when it is missing or stale.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { executeArchitectureSlice } from "../../../cli/architecture/slice.ts";
import { createArchitectureProgram } from "../../../cli/architecture/subcommand.ts";
import {
	generateArchitectureMap,
	type RepoMapSlice,
	typescriptSourceAnalyzer,
} from "../../../lib/architecture-map/index.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("architecture-slice-cli-");

const FILES: Readonly<Record<string, string>> = {
	"package.json": JSON.stringify({ type: "module" }),
	"tsconfig.json": JSON.stringify({
		compilerOptions: {
			module: "NodeNext",
			moduleResolution: "NodeNext",
			allowImportingTsExtensions: true,
			noEmit: true,
			strict: true,
		},
	}),
	"src/queue.ts": [
		'import { clamp } from "./limits.ts";',
		"export function enqueue(size: number): number {",
		"\treturn clamp(size);",
		"}",
		"",
	].join("\n"),
	"src/limits.ts":
		"export function clamp(value: number): number {\n\treturn Math.min(value, 10);\n}\n",
};

const QUEUE_SLICE = [
	"src/queue.ts [touch]",
	"  function enqueue(size: number): number",
	"src/limits.ts [dependency]",
	"  function clamp(value: number): number",
].join("\n");

async function writeFixture(): Promise<void> {
	for (const [path, content] of Object.entries(FILES)) {
		await mkdir(dirname(join(tmp.path, path)), { recursive: true });
		await writeFile(join(tmp.path, path), content);
	}
}

async function generateGraph(): Promise<void> {
	await writeFixture();
	const result = await generateArchitectureMap({
		projectRoot: tmp.path,
		analyzer: typescriptSourceAnalyzer,
		fileGraph: true,
	});
	expect(result.kind).toBe("written");
}

function run(options: { touch: readonly string[]; format?: string }) {
	return executeArchitectureSlice({
		projectRoot: tmp.path,
		touch: options.touch,
		budget: "1500",
		format: options.format ?? "text",
	});
}

afterEach(() => {
	process.exitCode = undefined;
});

describe("architecture slice command", () => {
	test("prints the slice for a comma-separated touch list", async () => {
		await generateGraph();
		const program = createArchitectureProgram({ projectRoot: tmp.path });
		const output = captureCliOutput();

		try {
			await program.parseAsync(
				["slice", "--touch", "src/queue.ts,src/limits.ts", "--budget", "200"],
				{ from: "user" },
			);
		} finally {
			output.restore();
		}

		expect(output.stdout()).toBe(
			[
				"src/limits.ts [touch]",
				"  function clamp(value: number): number",
				"src/queue.ts [touch]",
				"  function enqueue(size: number): number",
				"",
			].join("\n"),
		);
		expect(process.exitCode).toBeUndefined();
	});

	test("prints the slice result as JSON with --format json", async () => {
		await generateGraph();

		const result = await run({ touch: ["src/queue.ts"], format: "json" });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toEqual({
			kind: "json",
			value: {
				text: QUEUE_SLICE,
				included: ["src/queue.ts", "src/limits.ts"],
				dropped: [],
				tokens: Math.ceil(QUEUE_SLICE.length / 4),
				unknown: [],
			} satisfies RepoMapSlice,
		});
	});

	test("names the generate command when graph.json is missing", async () => {
		await writeFixture();

		const result = await run({ touch: ["src/queue.ts"] });

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBeUndefined();
		expect(result.stderr).toEqual([
			"No file graph at memory/architecture/graph.json.",
			"Run `cosmonauts architecture generate --file-graph` first.",
		]);
	});

	test("names the generate command when graph.json is stale", async () => {
		await generateGraph();
		await writeFile(
			join(tmp.path, "src/limits.ts"),
			"export const LIMIT = 10;\n",
		);

		const result = await run({ touch: ["src/queue.ts"] });

		expect(result.exitCode).toBe(1);
		expect(result.stderr.at(-1)).toBe(
			"Run `cosmonauts architecture generate --file-graph` to refresh it.",
		);
	});

	test("fails when no touch path is in the graph", async () => {
		await generateGraph();

		const result = await run({ touch: ["src/missing.ts"] });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toEqual(["Not in the file graph: src/missing.ts"]);
	});

	test("rejects a budget that is not a positive integer", async () => {
		const result = await executeArchitectureSlice({
			projectRoot: tmp.path,
			touch: ["src/queue.ts"],
			budget: "lots",
			format: "text",
		});

		expect(result).toEqual({
			exitCode: 1,
			stderr: ['--budget must be a positive integer, got "lots".'],
		});
	});
});
