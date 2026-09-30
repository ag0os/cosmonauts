/**
 * Tests for the file-level graph pass: nodes (sources and tests), weighted
 * import edges, elided export signatures, and the graph.json bundle entry.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import {
	checkFileGraphFreshness,
	dependenciesOf,
	dependentsOf,
	type FileGraph,
	generateArchitectureMap,
	loadFileGraph,
	resolveArchitectureMapConfig,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-file-graph-");

const TARGET = "lib/driver/run-one-task.ts";

const CONFIG_OVERRIDES = {
	sourceRoots: ["lib", "cli"],
	narrative: { enabled: false, maxModulesPerRun: 20 },
};

const FIXTURE: Readonly<Record<string, string>> = {
	"package.json": JSON.stringify({ type: "module" }),
	"tsconfig.json": JSON.stringify({
		compilerOptions: {
			target: "ES2023",
			module: "NodeNext",
			moduleResolution: "NodeNext",
			allowImportingTsExtensions: true,
			noEmit: true,
			strict: true,
		},
	}),
	[TARGET]: [
		'import { readFile } from "node:fs/promises";',
		'import type { BaseCtx, DriverRunSpec, TaskOutcome } from "./types.ts";',
		'import * as helpers from "./runtime-helpers.ts";',
		'import { type ParsedReport, parseReport } from "./report-parser.ts";',
		'import "./setup.ts";',
		'export { formatReport } from "./report-format.ts";',
		"",
		"export interface RunOneTaskCtx extends BaseCtx<string> {",
		"\treadonly projectRoot: string;",
		"\treadonly timeoutMs: number;",
		"}",
		"export type TaskResult<T> = {",
		"\treadonly outcome: T;",
		"\treadonly notes: readonly string[];",
		"};",
		'export type Outcome = "done" | "blocked" | "failed";',
		"export const DEFAULT_TASK_TIMEOUT_MS = 1000;",
		"export enum Mode {",
		"\tInline,",
		"\tDetached,",
		"}",
		"class BaseRunner {}",
		"interface Startable {",
		"\tstart(): void;",
		"}",
		"export class Runner<T> extends BaseRunner implements Startable {",
		"\tconstructor(readonly value: T) {",
		"\t\tsuper();",
		"\t}",
		"\tstart(): void {}",
		"}",
		"export async function runOneTask(",
		"\tspec: DriverRunSpec,",
		"\tctx: RunOneTaskCtx,",
		"): Promise<TaskOutcome> {",
		'\tconst report: ParsedReport = parseReport(await readFile(ctx.projectRoot, "utf-8"));',
		"\treturn { status: helpers.normalize(report.outcome), plan: spec.planSlug };",
		"}",
		"",
	].join("\n"),
	"lib/driver/types.ts": [
		"export interface BaseCtx<T> {",
		"\treadonly id: T;",
		"}",
		"export interface DriverRunSpec {",
		"\treadonly planSlug: string;",
		"}",
		"export interface TaskOutcome {",
		"\treadonly status: string;",
		"\treadonly plan: string;",
		"}",
		"",
	].join("\n"),
	"lib/driver/runtime-helpers.ts":
		"export function normalize(value: string): string {\n\treturn value.trim();\n}\n",
	"lib/driver/report-parser.ts": [
		"export interface ParsedReport {",
		"\treadonly outcome: string;",
		"}",
		"export function parseReport(raw: string): ParsedReport {",
		"\treturn { outcome: raw };",
		"}",
		"",
	].join("\n"),
	"lib/driver/report-format.ts":
		"export function formatReport(value: string): string {\n\treturn value;\n}\n",
	"lib/driver/setup.ts": "export const ready = true;\n",
	"lib/driver/drive-scheduler-backend.ts": [
		'import { DEFAULT_TASK_TIMEOUT_MS, runOneTask } from "./run-one-task.ts";',
		"export const schedule = () => [DEFAULT_TASK_TIMEOUT_MS, runOneTask] as const;",
		"",
	].join("\n"),
	"cli/drive/subcommand.ts": [
		'import type { RunOneTaskCtx } from "../../lib/driver/run-one-task.ts";',
		"export function describeCtx(ctx: RunOneTaskCtx): string {",
		"\treturn ctx.projectRoot;",
		"}",
		"",
	].join("\n"),
	"tests/driver/run-one-task.test.ts": [
		'import { type RunOneTaskCtx, runOneTask } from "../../lib/driver/run-one-task.ts";',
		"export const subject: [typeof runOneTask, RunOneTaskCtx | undefined] = [runOneTask, undefined];",
		"",
	].join("\n"),
	"tests/driver/retry.test.ts": [
		'export const load = () => import("../../lib/driver/run-one-task.ts");',
		"",
	].join("\n"),
};

describe("file graph pass", () => {
	test("lists source and test files as nodes", async () => {
		const graph = await generateFixtureGraph(tmp.path);

		expect(graph.nodes.map((node) => [node.path, node.kind])).toEqual([
			["cli/drive/subcommand.ts", "source"],
			["lib/driver/drive-scheduler-backend.ts", "source"],
			["lib/driver/report-format.ts", "source"],
			["lib/driver/report-parser.ts", "source"],
			[TARGET, "source"],
			["lib/driver/runtime-helpers.ts", "source"],
			["lib/driver/setup.ts", "source"],
			["lib/driver/types.ts", "source"],
			["tests/driver/retry.test.ts", "test"],
			["tests/driver/run-one-task.test.ts", "test"],
		]);
	});

	test("weights the target's dependencies by imported names and flags type-only imports", async () => {
		const graph = await generateFixtureGraph(tmp.path);

		expect(dependenciesOf(graph, TARGET)).toEqual([
			edge(TARGET, "lib/driver/report-format.ts", 1, false),
			edge(TARGET, "lib/driver/report-parser.ts", 2, false),
			edge(TARGET, "lib/driver/runtime-helpers.ts", 1, false),
			edge(TARGET, "lib/driver/setup.ts", 1, false),
			edge(TARGET, "lib/driver/types.ts", 3, true),
		]);
	});

	test("lists source and test dependents of the target", async () => {
		const graph = await generateFixtureGraph(tmp.path);

		expect(dependentsOf(graph, TARGET)).toEqual([
			edge("cli/drive/subcommand.ts", TARGET, 1, true),
			edge("lib/driver/drive-scheduler-backend.ts", TARGET, 2, false),
			edge("tests/driver/retry.test.ts", TARGET, 1, false),
			edge("tests/driver/run-one-task.test.ts", TARGET, 2, false),
		]);
	});

	test("records one-line export signatures with type bodies elided", async () => {
		const graph = await generateFixtureGraph(tmp.path);
		const target = graph.nodes.find((node) => node.path === TARGET);

		expect(target?.exports).toEqual([
			{
				name: "DEFAULT_TASK_TIMEOUT_MS",
				kind: "const",
				signature: "const DEFAULT_TASK_TIMEOUT_MS: 1000",
			},
			{ name: "Mode", kind: "enum", signature: "enum Mode" },
			{
				name: "Outcome",
				kind: "type",
				signature: 'type Outcome = "done" | "blocked" | "failed"',
			},
			{
				name: "RunOneTaskCtx",
				kind: "interface",
				signature: "interface RunOneTaskCtx extends BaseCtx<string>",
			},
			{
				name: "Runner",
				kind: "class",
				signature: "class Runner<T> extends BaseRunner implements Startable",
			},
			{
				name: "TaskResult",
				kind: "type",
				signature: "type TaskResult<T> = { … }",
			},
			{
				name: "runOneTask",
				kind: "function",
				signature:
					"async function runOneTask(spec: DriverRunSpec, ctx: RunOneTaskCtx): Promise<TaskOutcome>",
			},
		]);
	});

	test("writes byte-identical graph.json when generated twice", async () => {
		await writeFixture(tmp.path);
		await generate(tmp.path, true);
		const first = await readGraphJson(tmp.path);
		await rm(join(tmp.path, "memory"), { recursive: true, force: true });
		await generate(tmp.path, true);

		expect(await readGraphJson(tmp.path)).toBe(first);
	});

	test("records the same project hash as the index", async () => {
		const graph = await generateFixtureGraph(tmp.path);
		const index = matter(
			await readFile(
				join(tmp.path, "memory", "architecture", "index.md"),
				"utf-8",
			),
		);

		expect(graph.projectHash).toBe(index.data.projectHash);
	});

	test("reports the graph stale after a test file changes", async () => {
		await generateFixtureGraph(tmp.path);
		await expect(checkFreshness(tmp.path)).resolves.toMatchObject({
			kind: "current",
		});

		await writeFile(
			join(tmp.path, "tests", "driver", "retry.test.ts"),
			"export const changed = true;\n",
			"utf-8",
		);

		await expect(checkFreshness(tmp.path)).resolves.toMatchObject({
			kind: "stale",
		});
	});

	test("reports the graph stale after a source file changes", async () => {
		await generateFixtureGraph(tmp.path);

		await writeFile(
			join(tmp.path, "lib", "driver", "setup.ts"),
			"export const ready = false;\n",
			"utf-8",
		);

		await expect(checkFreshness(tmp.path)).resolves.toMatchObject({
			kind: "stale",
		});
	});

	test("leaves the module-level output unchanged and only adds graph.json", async () => {
		await writeFixture(tmp.path);
		await generate(tmp.path, false);
		const moduleOutput = await readMarkdownOutput(tmp.path);

		const result = await generate(tmp.path, true);

		expect(result).toMatchObject({
			kind: "written",
			changedFiles: ["memory/architecture/graph.json"],
		});
		expect(await readMarkdownOutput(tmp.path)).toEqual(moduleOutput);
	});

	test("keeps graph.json byte-identical when generated without the flag", async () => {
		await writeFixture(tmp.path);
		await generate(tmp.path, true);
		const first = await readGraphJson(tmp.path);

		const result = await generate(tmp.path, false);

		expect(result).not.toMatchObject({
			changedFiles: expect.arrayContaining(["memory/architecture/graph.json"]),
		});
		expect(await readGraphJson(tmp.path)).toBe(first);
	});

	test("reports a carried-over graph stale once the sources change", async () => {
		await writeFixture(tmp.path);
		await generate(tmp.path, true);
		await writeFile(
			join(tmp.path, "lib", "driver", "setup.ts"),
			"export const ready = false;\n",
			"utf-8",
		);

		await generate(tmp.path, false);

		await expect(checkFreshness(tmp.path)).resolves.toMatchObject({
			kind: "stale",
		});
	});

	test("tags a test file inside a source root as a test", async () => {
		await writeFixture(tmp.path);
		await writeFile(
			join(tmp.path, "lib", "driver", "inline.test.ts"),
			'import { ready } from "./setup.ts";\nexport const checked = ready;\n',
			"utf-8",
		);

		const graph = await generateFixtureGraph(tmp.path);

		expect(
			graph.nodes.find((node) => node.path === "lib/driver/inline.test.ts")
				?.kind,
		).toBe("test");
	});

	test("renders renamed exports under their exported name", async () => {
		await writeFixture(tmp.path);
		await writeFile(
			join(tmp.path, "lib", "driver", "aliases.ts"),
			[
				"function local(x: number): number {",
				"\treturn x;",
				"}",
				"const value = 1;",
				"export { local as renamed, value as renamedValue };",
				"",
			].join("\n"),
			"utf-8",
		);

		const graph = await generateFixtureGraph(tmp.path);

		expect(exportsOf(graph, "lib/driver/aliases.ts")).toEqual([
			{
				name: "renamed",
				kind: "function",
				signature: "function renamed(x: number): number",
			},
			{
				name: "renamedValue",
				kind: "const",
				signature: "const renamedValue: 1",
			},
		]);
	});

	test("renders an anonymous default export with an export default prefix", async () => {
		await writeFixture(tmp.path);
		await writeFile(
			join(tmp.path, "lib", "driver", "anonymous.ts"),
			"export default function (z: boolean): void {}\n",
			"utf-8",
		);

		const graph = await generateFixtureGraph(tmp.path);

		expect(exportsOf(graph, "lib/driver/anonymous.ts")).toEqual([
			{
				name: "default",
				kind: "function",
				signature: "export default function(z: boolean): void",
			},
		]);
	});

	test("returns undefined when no graph has been generated", async () => {
		await expect(
			loadFileGraph({ projectRoot: tmp.path }),
		).resolves.toBeUndefined();
	});
});

function exportsOf(graph: FileGraph, path: string) {
	return graph.nodes.find((node) => node.path === path)?.exports;
}

function edge(from: string, to: string, weight: number, typeOnly: boolean) {
	return { from, to, weight, typeOnly };
}

async function generateFixtureGraph(projectRoot: string): Promise<FileGraph> {
	await writeFixture(projectRoot);
	await generate(projectRoot, true);
	const graph = await loadFileGraph({ projectRoot });
	if (!graph) throw new Error("graph.json was not written");
	return graph;
}

function generate(projectRoot: string, fileGraph: boolean) {
	return generateArchitectureMap({
		projectRoot,
		analyzer: typescriptSourceAnalyzer,
		configOverrides: CONFIG_OVERRIDES,
		fileGraph,
	});
}

async function checkFreshness(projectRoot: string) {
	return checkFileGraphFreshness({
		projectRoot,
		config: await resolveArchitectureMapConfig({
			projectRoot,
			overrides: CONFIG_OVERRIDES,
		}),
		analyzer: typescriptSourceAnalyzer,
	});
}

async function writeFixture(projectRoot: string): Promise<void> {
	for (const [path, content] of Object.entries(FIXTURE)) {
		const absolute = join(projectRoot, path);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, content, "utf-8");
	}
}

function readGraphJson(projectRoot: string): Promise<string> {
	return readFile(
		join(projectRoot, "memory", "architecture", "graph.json"),
		"utf-8",
	);
}

async function readMarkdownOutput(
	projectRoot: string,
): Promise<Record<string, string>> {
	const root = join(projectRoot, "memory", "architecture");
	const entries = await readdir(root, { recursive: true });
	const output: Record<string, string> = {};
	for (const entry of entries.filter((name) => name.endsWith(".md")).sort()) {
		output[entry] = await readFile(join(root, entry), "utf-8");
	}
	return output;
}
