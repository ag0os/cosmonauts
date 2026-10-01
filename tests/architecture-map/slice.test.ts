/**
 * Tests for the repo-map slice: personalized PageRank around a touch set,
 * required neighbours, the hard token budget, and deterministic rendering.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	estimateTokens,
	type FileGraph,
	type FileGraphEdge,
	type FileGraphExport,
	type FileGraphNode,
	generateArchitectureMap,
	loadFileGraph,
	loadSliceSources,
	personalizedPageRank,
	repoMapSlice,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-slice-");

const TARGET = "src/core/target.ts";
const DEPENDENCIES = [
	"src/core/types.ts",
	"src/core/util.ts",
	"src/lib/log.ts",
] as const;
const DEPENDENTS = ["src/app/main.ts", "tests/core/target.test.ts"] as const;
const TWO_HOPS = "src/far/format-helpers.ts";
const UNRELATED = ["src/other/x.ts", "src/other/y.ts"] as const;

function fn(name: string, params = ""): FileGraphExport {
	return {
		name,
		kind: "function",
		signature: `function ${name}(${params}): void`,
	};
}

function iface(name: string): FileGraphExport {
	return { name, kind: "interface", signature: `interface ${name}` };
}

function node(
	path: string,
	exports: readonly FileGraphExport[] = [],
): FileGraphNode {
	return { path, kind: path.startsWith("tests/") ? "test" : "source", exports };
}

function edge(
	from: string,
	to: string,
	weight: number,
	typeOnly = false,
): FileGraphEdge {
	return { from, to, weight, typeOnly };
}

function fixtureGraph(): FileGraph {
	return {
		schemaVersion: 1,
		projectHash: "project",
		graphHash: "graph",
		nodes: [
			node("src/app/main.ts", [fn("main")]),
			node(TARGET, [
				fn("runTarget", "options: TargetOptions"),
				iface("TargetOptions"),
			]),
			node("src/core/types.ts", [
				iface("Alpha"),
				iface("Beta"),
				iface("Gamma"),
				iface("Delta"),
			]),
			node("src/core/util.ts", [fn("parse"), fn("format"), fn("unusedUtil")]),
			node(TWO_HOPS, [fn("pad"), fn("trimAll")]),
			node("src/lib/log.ts", [fn("log")]),
			node("src/other/x.ts", [fn("x")]),
			node("src/other/y.ts", [fn("y")]),
			node("tests/core/target.test.ts"),
		],
		edges: [
			edge("src/app/main.ts", TARGET, 1),
			edge(TARGET, "src/core/types.ts", 3, true),
			edge(TARGET, "src/core/util.ts", 2),
			edge(TARGET, "src/lib/log.ts", 1),
			edge("src/core/util.ts", TWO_HOPS, 2),
			edge("src/other/x.ts", "src/other/y.ts", 1),
			edge("tests/core/target.test.ts", TARGET, 2),
		],
	};
}

/** The target's imports: three of four types, one of three utils, and log. */
const TARGET_IMPORTS: ReadonlyMap<string, string> = new Map([
	[
		TARGET,
		[
			'import type { Beta, Delta, Gamma } from "./types.ts";',
			'import { parse } from "./util.ts";',
			'import { log } from "../lib/log.ts";',
			"",
		].join("\n"),
	],
]);
const IMPORTED_SIGNATURES = [
	"interface Beta",
	"interface Delta",
	"interface Gamma",
	"function parse(): void",
	"function log(): void",
] as const;
/** Below the full required slice, above its paths plus imported names. */
const TIGHT_BUDGET = 100;
/** The smallest budget at which every required file's bare path fits. */
const BARE_PATHS_FIT = 59;

/** A 27-file directory touch set, like lib/architecture-map/ in miniature. */
const DIRECTORY = "src/map";
const DIRECTORY_SIZE = 27;
const DIRECTORY_DEPENDENCIES = Array.from(
	{ length: 10 },
	(_, index) => `src/core/dependency-${String(index).padStart(2, "0")}.ts`,
);
const DIRECTORY_DEPENDENTS = Array.from(
	{ length: 10 },
	(_, index) => `src/cli/command-${String(index).padStart(2, "0")}.ts`,
);

function directoryModules(): readonly string[] {
	return Array.from(
		{ length: DIRECTORY_SIZE },
		(_, index) => `${DIRECTORY}/module-${String(index).padStart(2, "0")}.ts`,
	);
}

/** Six exports per module: together far more than 1,500 tokens of signatures. */
function moduleExports(module: number): readonly FileGraphExport[] {
	return Array.from({ length: 6 }, (_, index) =>
		fn(
			`moduleOperation${module}x${index}`,
			"options: ModuleOperationOptions, context: ModuleContext",
		),
	);
}

/**
 * Each module imports two shared dependencies and the next module, and one
 * command imports it; the neighbours' bare paths fit well inside 1,500.
 */
function directoryGraph(): FileGraph {
	const modules = directoryModules();
	const pick = (list: readonly string[], index: number) =>
		list[index % list.length] ?? "";
	return {
		schemaVersion: 1,
		projectHash: "project",
		graphHash: "graph",
		nodes: [
			...modules.map((path, index) => node(path, moduleExports(index))),
			...DIRECTORY_DEPENDENCIES.map((path) => node(path, [fn("helper")])),
			...DIRECTORY_DEPENDENTS.map((path) => node(path, [fn("command")])),
		],
		edges: modules.flatMap((path, index) => [
			edge(path, pick(DIRECTORY_DEPENDENCIES, index), 2),
			edge(path, pick(DIRECTORY_DEPENDENCIES, index + 3), 1),
			edge(path, pick(modules, index + 1), 1),
			edge(pick(DIRECTORY_DEPENDENTS, index), path, 1),
		]),
	};
}

/** Each rendered file's signature lines, keyed by path. */
function signaturesByPath(
	text: string,
): ReadonlyMap<string, readonly string[]> {
	const result = new Map<string, string[]>();
	let current: string[] = [];
	for (const line of text.split("\n")) {
		if (line.startsWith("  ")) {
			if (!line.startsWith("  … ")) current.push(line.trim());
			continue;
		}
		current = [];
		result.set(line.replace(/ \[.*\]$/u, ""), current);
	}
	return result;
}

function slice(budgetTokens: number, sources?: ReadonlyMap<string, string>) {
	return repoMapSlice({
		graph: fixtureGraph(),
		touchSet: [TARGET],
		budgetTokens,
		...(sources ? { sources } : {}),
	});
}

describe("personalizedPageRank", () => {
	test("ranks touch-set neighbours above unrelated files", () => {
		const scores = personalizedPageRank({
			graph: fixtureGraph(),
			seeds: [TARGET],
		});

		for (const neighbour of [...DEPENDENCIES, ...DEPENDENTS]) {
			expect(scores.get(neighbour) ?? 0).toBeGreaterThan(0);
		}
		expect(UNRELATED.map((path) => scores.get(path))).toEqual([0, 0]);
	});

	test("weights a neighbour by its imported-name count", () => {
		const scores = personalizedPageRank({
			graph: fixtureGraph(),
			seeds: [TARGET],
		});

		expect(scores.get("src/core/types.ts") ?? 0).toBeGreaterThan(
			scores.get("src/lib/log.ts") ?? 0,
		);
	});
});

describe("repoMapSlice", () => {
	test("lists the touch set, then its dependencies and dependents by rank", () => {
		const result = slice(10_000);

		expect(result.included).toEqual([
			TARGET,
			"src/core/util.ts",
			"src/core/types.ts",
			"tests/core/target.test.ts",
			"src/app/main.ts",
			"src/lib/log.ts",
			TWO_HOPS,
		]);
	});

	test("labels each file with its relation to the touch set", () => {
		const lines = slice(10_000).text.split("\n");

		expect(lines.filter((line) => !line.startsWith("  "))).toEqual([
			`${TARGET} [touch]`,
			"src/core/util.ts [dependency]",
			"src/core/types.ts [dependency]",
			"tests/core/target.test.ts [dependent]",
			"src/app/main.ts [dependent]",
			"src/lib/log.ts [dependency]",
			`${TWO_HOPS} [related]`,
		]);
	});

	test("leaves out files unreachable from the touch set", () => {
		const result = slice(10_000);

		expect(result.included).not.toContain(UNRELATED[0]);
		expect(result.dropped).not.toContain(UNRELATED[0]);
	});

	test("drops lower-ranked files whole before trimming the required ones", () => {
		const full = slice(10_000);
		const budget = full.tokens - 1;

		const result = slice(budget);

		expect(result.tokens).toBeLessThanOrEqual(budget);
		expect(result.dropped).toEqual([TWO_HOPS]);
		expect(result.text).not.toContain("more");
	});

	test("trims export lists when the required files alone exceed the budget", () => {
		const result = slice(60);

		expect(result.tokens).toBeLessThanOrEqual(60);
		expect(result.included).toEqual(
			expect.arrayContaining([TARGET, ...DEPENDENCIES, ...DEPENDENTS]),
		);
		expect(result.text).toMatch(/ {2}… \d+ more/u);
	});

	test("keeps exports a touch-set file names before the others", () => {
		const sources = new Map([
			[TARGET, 'import { unusedUtil } from "./util.ts";\nunusedUtil();\n'],
		]);
		const requiredOnly = slice(slice(10_000).tokens - 1, sources);

		const result = slice(requiredOnly.tokens - 1, sources);
		const utilLines = result.text.split("src/core/util.ts [dependency]\n")[1];

		expect(utilLines?.split("\n")[0]).toBe("  function unusedUtil(): void");
		expect(result.text).toMatch(/ {2}… \d+ more/u);
	});

	test("keeps every direct dependency and dependent at a tight budget", () => {
		const result = slice(TIGHT_BUDGET, TARGET_IMPORTS);

		expect(result.included).toEqual(
			expect.arrayContaining([TARGET, ...DEPENDENCIES, ...DEPENDENTS]),
		);
	});

	test("shows every name the touch set imports before unused or dependents' exports", () => {
		const result = slice(TIGHT_BUDGET, TARGET_IMPORTS);
		const lines = result.text.split("\n");

		for (const signature of IMPORTED_SIGNATURES) {
			expect(lines, signature).toContain(`  ${signature}`);
		}
		expect(result.text).not.toMatch(/function (format|unusedUtil|main)\(/u);
	});

	test("never shows a neighbour's signature while the touch file hides one when bare paths overflow", () => {
		const required = [TARGET, ...DEPENDENCIES, ...DEPENDENTS];
		const included = (budget: number) => slice(budget, TARGET_IMPORTS).included;
		expect(included(BARE_PATHS_FIT)).toEqual(expect.arrayContaining(required));
		expect(included(BARE_PATHS_FIT - 1)).not.toEqual(
			expect.arrayContaining(required),
		);

		for (let budget = 0; budget < BARE_PATHS_FIT; budget += 1) {
			const rendered = signaturesByPath(slice(budget, TARGET_IMPORTS).text);
			const neighbourSignatures = [...rendered]
				.filter(([path]) => path !== TARGET)
				.flatMap(([, signatures]) => signatures);
			if (neighbourSignatures.length === 0) continue;

			expect(rendered.get(TARGET), `budget ${budget}`).toHaveLength(2);
		}
	});

	test("drops neighbours to keep the touch file's signatures when paths overflow", () => {
		const result = slice(30);

		expect(result.text).toBe(
			[
				`${TARGET} [touch]`,
				"  interface TargetOptions",
				"  function runTarget(options: TargetOptions): void",
			].join("\n"),
		);
	});

	test("drops required files whole, lowest rank first, when bare paths overflow", () => {
		const result = slice(30);

		expect(result.tokens).toBeLessThanOrEqual(30);
		expect(result.included[0]).toBe(TARGET);
		expect(result.dropped).toContain("src/lib/log.ts");
		expect(result.dropped.at(-1)).toBe(TWO_HOPS);
	});

	test("never exceeds the budget at any size", () => {
		for (let budget = 0; budget <= 160; budget += 1) {
			const result = slice(budget);
			expect(result.tokens).toBeLessThanOrEqual(budget);
			expect(estimateTokens(result.text)).toBe(result.tokens);
		}
	});

	test("renders identical output for reordered input", () => {
		const graph = fixtureGraph();
		const reordered: FileGraph = {
			...graph,
			nodes: [...graph.nodes].reverse(),
			edges: [...graph.edges].reverse(),
		};

		const first = repoMapSlice({ graph, touchSet: [TARGET], budgetTokens: 60 });
		const second = repoMapSlice({
			graph: reordered,
			touchSet: [TARGET],
			budgetTokens: 60,
		});

		expect(second).toEqual(first);
	});

	test("labels a file in an import cycle the same for reordered input", () => {
		const graph = fixtureGraph();
		const cyclic: FileGraph = {
			...graph,
			edges: [...graph.edges, edge("src/core/util.ts", TARGET, 1)],
		};
		const reordered: FileGraph = {
			...cyclic,
			nodes: [...cyclic.nodes].reverse(),
			edges: [...cyclic.edges].reverse(),
		};
		const render = (input: FileGraph) =>
			repoMapSlice({ graph: input, touchSet: [TARGET], budgetTokens: 10_000 })
				.text;

		expect(render(reordered)).toBe(render(cyclic));
		expect(render(cyclic)).toContain(
			"src/core/util.ts [dependency, dependent]",
		);
	});

	test("expands a directory entry to the files under it", () => {
		const result = repoMapSlice({
			graph: fixtureGraph(),
			touchSet: ["./src/other/"],
			budgetTokens: 1_000,
		});

		expect(result.included).toEqual(["src/other/x.ts", "src/other/y.ts"]);
	});

	test("reports touch-set entries that are not in the graph", () => {
		const result = repoMapSlice({
			graph: fixtureGraph(),
			touchSet: ["src/new-file.ts", TARGET],
			budgetTokens: 1_000,
		});

		expect(result.unknown).toEqual(["src/new-file.ts"]);
		expect(result.included[0]).toBe(TARGET);
	});

	test("labels reuse-set files as reuse and leaves their neighbours optional", () => {
		const result = repoMapSlice({
			graph: fixtureGraph(),
			touchSet: ["src/app/main.ts"],
			reuseSet: ["src/core/util.ts"],
			budgetTokens: 1_000,
		});

		expect(
			result.text.split("\n").filter((line) => !line.startsWith("  ")),
		).toEqual([
			"src/app/main.ts [touch]",
			`${TARGET} [dependency]`,
			"src/core/util.ts [reuse]",
			"src/core/types.ts [related]",
			`${TWO_HOPS} [related]`,
			"tests/core/target.test.ts [related]",
			"src/lib/log.ts [related]",
		]);
	});

	test("treats a path in both the touch and reuse sets as a touch file", () => {
		const result = repoMapSlice({
			graph: fixtureGraph(),
			touchSet: [TARGET],
			reuseSet: [TARGET],
			budgetTokens: 1_000,
		});

		expect(result.text.split("\n")[0]).toBe(`${TARGET} [touch]`);
	});

	test("reports reuse-set entries that are not in the graph", () => {
		const result = repoMapSlice({
			graph: fixtureGraph(),
			touchSet: [TARGET],
			reuseSet: ["src/missing-helper.ts"],
			budgetTokens: 1_000,
		});

		expect(result.unknown).toEqual(["src/missing-helper.ts"]);
	});

	test("renders every neighbour's path for a directory touch set whose exports exceed the budget", () => {
		const graph = directoryGraph();
		const neighbours = [...DIRECTORY_DEPENDENCIES, ...DIRECTORY_DEPENDENTS];

		const result = repoMapSlice({
			graph,
			touchSet: [`${DIRECTORY}/`],
			budgetTokens: 1_500,
		});

		expect(result.tokens).toBeLessThanOrEqual(1_500);
		expect(result.included).toEqual(
			expect.arrayContaining([...directoryModules(), ...neighbours]),
		);
		for (const path of neighbours) {
			expect(result.text, path).toContain(`\n${path} [`);
		}
	});

	test("rejects a negative budget", () => {
		expect(() => slice(-1)).toThrow(RangeError);
	});
});

describe("repoMapSlice over a generated graph", () => {
	const files: Readonly<Record<string, string>> = {
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
		"src/core/target.ts": [
			'import type { Settings } from "./settings.ts";',
			"export interface TargetOptions {",
			"\treadonly settings: Settings;",
			"\treadonly retries: number;",
			"}",
			"export function runTarget(options: TargetOptions): number {",
			"\treturn options.retries;",
			"}",
			"",
		].join("\n"),
		"src/core/settings.ts": [
			"export type Settings = {",
			"\treadonly verbose: boolean;",
			"};",
			"export interface Unused {",
			"\treadonly flag: boolean;",
			"}",
			"",
		].join("\n"),
		"tests/core/target.test.ts": [
			'import { runTarget } from "../../src/core/target.ts";',
			"runTarget({ settings: { verbose: false }, retries: 1 });",
			"",
		].join("\n"),
	};

	async function generatedGraph(): Promise<FileGraph> {
		for (const [path, content] of Object.entries(files)) {
			await mkdir(dirname(join(tmp.path, path)), { recursive: true });
			await writeFile(join(tmp.path, path), content);
		}
		await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			configOverrides: {
				sourceRoots: ["src"],
				narrative: { enabled: false, maxModulesPerRun: 20 },
			},
			fileGraph: true,
		});
		const graph = await loadFileGraph({ projectRoot: tmp.path });
		if (!graph) throw new Error("graph.json was not generated");
		return graph;
	}

	test("renders signatures with type bodies elided", async () => {
		const graph = await generatedGraph();

		const result = repoMapSlice({
			graph,
			touchSet: [TARGET],
			budgetTokens: 1_000,
		});

		expect(result.text).toBe(
			[
				`${TARGET} [touch]`,
				"  interface TargetOptions",
				"  function runTarget(options: TargetOptions): number",
				"src/core/settings.ts [dependency]",
				"  type Settings = { … }",
				"  interface Unused",
				"tests/core/target.test.ts [dependent]",
			].join("\n"),
		);
	});

	test("reads the touch set and its importers to rank referenced exports", async () => {
		const graph = await generatedGraph();

		const sources = await loadSliceSources({
			projectRoot: tmp.path,
			graph,
			touchSet: [TARGET],
		});

		expect([...sources.keys()]).toEqual([TARGET, "tests/core/target.test.ts"]);
	});
});
