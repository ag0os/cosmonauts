/**
 * Tests for refreshFileGraph on a small TypeScript fixture: a missing,
 * stale, unreadable or wrong-schema graph.json is regenerated with the
 * file-graph pass; a current one is left alone.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	type FileGraphRead,
	type FileGraphRefresh,
	readFileGraph,
	refreshFileGraph,
} from "../../lib/lean-run/graph-refresh.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("lean-run-graph-refresh-");

const GRAPH_JSON = "memory/architecture/graph.json";

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
	"src/greet.ts": [
		'import { name } from "./name.ts";',
		"export function greet(): string {",
		'\treturn "hi " + name;',
		"}",
		"",
	].join("\n"),
	"src/name.ts": 'export const name = "lean";\n',
};

async function writeProject(
	files: Readonly<Record<string, string>> = FILES,
): Promise<void> {
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(tmp.path, path)), { recursive: true });
		await writeFile(join(tmp.path, path), content);
	}
}

function refresh() {
	return refreshFileGraph({ projectRoot: tmp.path });
}

function nodePaths(result: FileGraphRefresh | FileGraphRead): string[] {
	return result.outcome === "unavailable"
		? []
		: result.graph.nodes.map((node) => node.path);
}

describe("refreshFileGraph", () => {
	test("generates a missing graph.json", async () => {
		await writeProject();

		const result = await refresh();

		expect(result).toMatchObject({ outcome: "regenerated", cause: "missing" });
		expect(nodePaths(result)).toEqual(["src/greet.ts", "src/name.ts"]);
		await expect(
			readFile(join(tmp.path, GRAPH_JSON), "utf-8"),
		).resolves.toContain('"src/greet.ts"');
	});

	test("leaves a current graph.json alone", async () => {
		await writeProject();
		await refresh();
		const before = await readFile(join(tmp.path, GRAPH_JSON), "utf-8");

		const result = await refresh();

		expect(result.outcome).toBe("current");
		expect(await readFile(join(tmp.path, GRAPH_JSON), "utf-8")).toBe(before);
	});

	test("regenerates a graph.json that a source change made stale", async () => {
		await writeProject();
		await refresh();
		await writeProject({ "src/extra.ts": "export const extra = 1;\n" });

		const result = await refresh();

		expect(result).toMatchObject({ outcome: "regenerated", cause: "stale" });
		expect(nodePaths(result)).toContain("src/extra.ts");
	});

	test("regenerates a graph.json that is not valid JSON", async () => {
		await writeProject({ ...FILES, [GRAPH_JSON]: "{ not json" });

		const result = await refresh();

		expect(result).toMatchObject({ outcome: "regenerated", cause: "corrupt" });
		expect(result.outcome === "regenerated" && result.detail).toMatch(/JSON/u);
		expect(nodePaths(result)).toEqual(["src/greet.ts", "src/name.ts"]);
	});

	test("regenerates a graph.json with an unknown schema", async () => {
		await writeProject({
			...FILES,
			[GRAPH_JSON]: JSON.stringify({ schemaVersion: 99, nodes: [] }),
		});

		const result = await refresh();

		expect(result).toMatchObject({
			outcome: "regenerated",
			cause: "corrupt",
			detail: expect.stringContaining("Unrecognized file graph format"),
		});
	});

	test("reports the graph unavailable for a project without TypeScript", async () => {
		await writeProject({ "README.md": "no code\n" });

		const result = await refresh();

		expect(result).toMatchObject({
			outcome: "unavailable",
			reason: expect.stringContaining("TypeScript"),
		});
	});
});

describe("readFileGraph", () => {
	test("builds a missing graph in memory and writes no graph.json", async () => {
		await writeProject();

		const result = await readFileGraph({ projectRoot: tmp.path });

		expect(result.outcome).toBe("built");
		expect(nodePaths(result)).toEqual(["src/greet.ts", "src/name.ts"]);
		expect(existsSync(join(tmp.path, "memory"))).toBe(false);
	});

	test("reads a current graph.json as it is", async () => {
		await writeProject();
		await refresh();

		const result = await readFileGraph({ projectRoot: tmp.path });

		expect(result.outcome).toBe("current");
		expect(nodePaths(result)).toEqual(["src/greet.ts", "src/name.ts"]);
	});

	test("reports the graph unavailable for a project without TypeScript", async () => {
		await writeProject({ "README.md": "no code\n" });

		const result = await readFileGraph({ projectRoot: tmp.path });

		expect(result).toMatchObject({
			outcome: "unavailable",
			reason: expect.stringContaining("TypeScript"),
		});
	});
});
