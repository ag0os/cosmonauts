/**
 * Tests for the builder context pack: plan section, repo-map slice,
 * AGENTS.md, and verification commands, verbatim and in that order.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { FileGraph } from "../../lib/architecture-map/index.ts";
import {
	buildContextPack,
	planPathWarnings,
	readVerificationCommands,
} from "../../lib/lean-run/context-pack.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("lean-run-context-pack-");

const PLAN_SECTION = "## Approach\n\nAdd retries to the fetch helper.";
const AGENTS_MD = "# Project\n\nUse `import type` for type-only imports.\n";

const GRAPH: FileGraph = {
	schemaVersion: 1,
	projectHash: "project",
	graphHash: "graph",
	nodes: [
		{
			path: "src/fetch.ts",
			kind: "source",
			exports: [
				{
					name: "fetchWithRetry",
					kind: "function",
					signature: "function fetchWithRetry(url: string): Promise<string>",
				},
			],
		},
		{
			path: "src/retry.ts",
			kind: "source",
			exports: [
				{
					name: "retry",
					kind: "function",
					signature: "function retry<T>(run: () => Promise<T>): Promise<T>",
				},
			],
		},
	],
	edges: [
		{ from: "src/fetch.ts", to: "src/retry.ts", weight: 1, typeOnly: false },
	],
};

async function writeProject(scripts: Record<string, string>): Promise<void> {
	await writeFile(join(tmp.path, "AGENTS.md"), AGENTS_MD);
	await writeFile(
		join(tmp.path, "package.json"),
		JSON.stringify({ name: "fixture", scripts }),
	);
}

describe("buildContextPack", () => {
	test("joins the plan section, slice, AGENTS.md, and verification commands in order", async () => {
		await writeProject({
			build: "tsc",
			typecheck: "tsc --noEmit",
			test: "vitest run",
			lint: "biome check .",
		});

		const pack = await buildContextPack({
			planSection: PLAN_SECTION,
			touches: ["src/fetch.ts"],
			reuses: ["src/retry.ts"],
			graph: GRAPH,
			budget: 500,
			projectRoot: tmp.path,
		});

		expect(pack).toBe(
			[
				"# Plan",
				"",
				PLAN_SECTION,
				"",
				"# Repo map",
				"",
				"src/fetch.ts [touch]",
				"  function fetchWithRetry(url: string): Promise<string>",
				"src/retry.ts [reuse]",
				"  function retry<T>(run: () => Promise<T>): Promise<T>",
				"",
				"# Repository conventions (AGENTS.md)",
				"",
				AGENTS_MD.trim(),
				"",
				"# Verification commands",
				"",
				"bun run test",
				"bun run lint",
				"bun run typecheck",
				"",
			].join("\n"),
		);
	});

	test("uses explicit verification commands instead of package.json scripts", async () => {
		await writeProject({ test: "vitest run" });

		const pack = await buildContextPack({
			planSection: PLAN_SECTION,
			touches: ["src/fetch.ts"],
			reuses: [],
			graph: GRAPH,
			budget: 500,
			projectRoot: tmp.path,
			verificationCommands: ["make check"],
		});

		expect(pack.endsWith("# Verification commands\n\nmake check\n")).toBe(true);
	});

	test("leaves out the conventions section when the project has no AGENTS.md", async () => {
		const pack = await buildContextPack({
			planSection: PLAN_SECTION,
			touches: ["src/fetch.ts"],
			reuses: [],
			graph: GRAPH,
			budget: 500,
			projectRoot: tmp.path,
		});

		expect(pack).not.toContain("# Repository conventions");
		expect(pack).not.toContain("# Verification commands");
	});

	test("puts each warning on its own line above the plan", async () => {
		const pack = await buildContextPack({
			planSection: PLAN_SECTION,
			touches: ["src/fetch.ts"],
			reuses: [],
			graph: GRAPH,
			budget: 500,
			projectRoot: tmp.path,
			warnings: ["plan path not found: src/typo.ts", "second"],
		});

		expect(
			pack.startsWith(
				"Warning: plan path not found: src/typo.ts\nWarning: second\n\n# Plan\n",
			),
		).toBe(true);
	});
});

describe("planPathWarnings", () => {
	test("warns about a path that is neither on disk nor in the graph", async () => {
		expect(
			planPathWarnings({
				touches: ["src/fetch.ts"],
				reuses: ["tests/helpers/mermaid-structure.ts"],
				graph: GRAPH,
				projectRoot: tmp.path,
			}),
		).toEqual([
			"plan path not found (new file?): tests/helpers/mermaid-structure.ts",
		]);
	});

	test("words a Touches file the plan creates as a possible new file", () => {
		expect(
			planPathWarnings({
				touches: ["src/new.ts"],
				reuses: [],
				graph: GRAPH,
				projectRoot: tmp.path,
			}),
		).toEqual(["plan path not found (new file?): src/new.ts"]);
	});

	test("warns in other words about a file on disk the graph does not hold", async () => {
		await writeFile(join(tmp.path, "notes.md"), "# Notes\n");

		expect(
			planPathWarnings({
				touches: ["notes.md"],
				reuses: [],
				graph: GRAPH,
				projectRoot: tmp.path,
			}),
		).toEqual(["plan path is not in the file graph: notes.md"]);
	});

	test("accepts a graph file, a directory holding one, and a glob", () => {
		expect(
			planPathWarnings({
				touches: ["src/fetch.ts", "src/", "src/**/*.ts"],
				reuses: ["src/retry.ts"],
				graph: GRAPH,
				projectRoot: tmp.path,
			}),
		).toEqual([]);
	});
});

describe("readVerificationCommands", () => {
	test("lists only the test, lint, and typecheck scripts the project defines", async () => {
		await writeProject({ lint: "biome check .", build: "tsc" });

		expect(await readVerificationCommands(tmp.path)).toEqual(["bun run lint"]);
	});
});
