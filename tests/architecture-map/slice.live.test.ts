/**
 * LIVE acceptance probe (lean brief WP3): reads this repository instead of a
 * fixture, so it runs only with LEAN_LIVE_SLICE=1. It builds the file graph
 * in memory with the same pass `generate --file-graph` runs and round-trips
 * it through the graph.json rendering, so nothing is written under
 * memory/architecture/. The fixture suite in slice.test.ts pins the same
 * guarantees for the default run.
 */

import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	buildFileGraph,
	createProjectSnapshot,
	dependenciesOf,
	dependentsOf,
	type FileGraph,
	type FileGraphExport,
	loadSliceSources,
	renderFileGraph,
	repoMapSlice,
	resolveArchitectureMapConfig,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TARGET = "lib/driver/run-one-task.ts";
const BUDGET = 1_500;
const LIVE = process.env.LEAN_LIVE_SLICE === "1";

async function liveGraph(): Promise<FileGraph> {
	const config = await resolveArchitectureMapConfig({
		projectRoot: PROJECT_ROOT,
	});
	const snapshot = await createProjectSnapshot({
		projectRoot: PROJECT_ROOT,
		config,
		analyzer: typescriptSourceAnalyzer,
	});
	const graph = await buildFileGraph({
		projectRoot: PROJECT_ROOT,
		config,
		snapshot,
	});
	return JSON.parse(renderFileGraph(graph)) as FileGraph;
}

/** Each rendered file's lines, keyed by path. */
function blocks(text: string): ReadonlyMap<string, readonly string[]> {
	const result = new Map<string, string[]>();
	let current: string[] = [];
	for (const line of text.split("\n")) {
		if (line.startsWith("  ")) {
			current.push(line);
			continue;
		}
		current = [];
		result.set(line.replace(/ \[.*\]$/u, ""), current);
	}
	return result;
}

/** A dependency's exports whose names appear as identifiers in the importer. */
function importedExports(
	importerSource: string,
	exports: readonly FileGraphExport[],
): readonly FileGraphExport[] {
	const identifiers = new Set(importerSource.match(/[A-Za-z_$][\w$]*/gu));
	return exports.filter((entry) => identifiers.has(entry.name));
}

describe.skipIf(!LIVE)(
	"repoMapSlice on this repository (live; set LEAN_LIVE_SLICE=1 to run)",
	() => {
		test("slices run-one-task.ts under 1,500 tokens with every neighbour and every imported name", async () => {
			const graph = await liveGraph();
			const dependencies = dependenciesOf(graph, TARGET).map((edge) => edge.to);
			const dependents = dependentsOf(graph, TARGET).map((edge) => edge.from);
			const sources = await loadSliceSources({
				projectRoot: PROJECT_ROOT,
				graph,
				touchSet: [TARGET],
			});
			const exportsByPath = new Map(
				graph.nodes.map((node) => [node.path, node.exports]),
			);

			const slice = repoMapSlice({
				graph,
				touchSet: [TARGET],
				budgetTokens: BUDGET,
				sources,
			});
			const rendered = blocks(slice.text);

			expect(slice.tokens).toBeLessThanOrEqual(BUDGET);
			for (const path of [TARGET, ...dependencies, ...dependents]) {
				expect(rendered.get(path), path).toBeDefined();
			}
			const imported = dependencies.flatMap((path) =>
				importedExports(
					sources.get(TARGET) ?? "",
					exportsByPath.get(path) ?? [],
				).map((entry) => ({ path, entry })),
			);
			expect(imported.map(({ entry }) => entry.name)).toContain("TaskOutcome");
			for (const { path, entry } of imported) {
				expect(rendered.get(path), `${path}: ${entry.name}`).toContain(
					`  ${entry.signature}`,
				);
			}
		}, 60_000);
	},
);
