import type {
	FileGraph,
	FileGraphNodeKind,
} from "../../../lib/architecture-map/index.ts";

/** A FileGraph built from `importer -> imported` pairs; `tests/` paths are test nodes, as in the real graph. */
export function fixtureGraph(
	edges: readonly (readonly [from: string, to: string])[],
): FileGraph {
	const paths = new Set(edges.flat());
	return {
		schemaVersion: 1,
		projectHash: "project-hash",
		graphHash: "graph-hash",
		nodes: [...paths].sort().map((path) => ({
			path,
			kind: nodeKind(path),
			exports: [],
		})),
		edges: edges.map(([from, to]) => ({
			from,
			to,
			weight: 1,
			typeOnly: false,
		})),
	};
}

function nodeKind(path: string): FileGraphNodeKind {
	return path.startsWith("tests/") ? "test" : "source";
}

/**
 * lib/a.ts is imported by lib/b.ts and tests/a.test.ts; lib/b.ts by lib/c.ts
 * and the test helper tests/helpers/b.ts (itself imported by
 * tests/b.test.ts); lib/c.ts by tests/c.test.ts and, in a cycle, lib/b.ts.
 * lib/unrelated.ts has its own test.
 */
export const LAYERED_GRAPH = fixtureGraph([
	["lib/b.ts", "lib/a.ts"],
	["tests/a.test.ts", "lib/a.ts"],
	["lib/c.ts", "lib/b.ts"],
	["tests/helpers/b.ts", "lib/b.ts"],
	["tests/b.test.ts", "tests/helpers/b.ts"],
	["tests/c.test.ts", "lib/c.ts"],
	["lib/b.ts", "lib/c.ts"],
	["tests/unrelated.test.ts", "lib/unrelated.ts"],
]);
