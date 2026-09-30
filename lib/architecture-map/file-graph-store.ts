import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	collectFileGraphTestFiles,
	computeFileGraphHash,
} from "./file-graph.ts";
import { compareFreshnessHashes, createProjectSnapshot } from "./freshness.ts";
import {
	ARCHITECTURE_MAP_OUTPUT_DIR,
	type ArchitectureMapConfig,
	type ArchitectureMapFreshness,
	type ArchitectureMapScanObserver,
	FILE_GRAPH_PATH,
	FILE_GRAPH_SCHEMA_VERSION,
	type FileGraph,
	type FileGraphEdge,
	type SourceAnalyzer,
} from "./types.ts";

/** Canonical bytes: fixed key order, sorted arrays, tab indent, trailing newline. */
export function renderFileGraph(graph: FileGraph): string {
	const canonical: FileGraph = {
		schemaVersion: graph.schemaVersion,
		projectHash: graph.projectHash,
		graphHash: graph.graphHash,
		nodes: graph.nodes.map((node) => ({
			path: node.path,
			kind: node.kind,
			exports: node.exports.map((entry) => ({
				name: entry.name,
				kind: entry.kind,
				signature: entry.signature,
			})),
		})),
		edges: graph.edges.map((edge) => ({
			from: edge.from,
			to: edge.to,
			weight: edge.weight,
			typeOnly: edge.typeOnly,
		})),
	};
	return `${JSON.stringify(canonical, null, "\t")}\n`;
}

/** Reads memory/architecture/graph.json; undefined when it has not been generated. */
export async function loadFileGraph(options: {
	readonly projectRoot: string;
}): Promise<FileGraph | undefined> {
	const raw = await readFileGraphText(options);
	if (raw === undefined) return undefined;
	const parsed: unknown = JSON.parse(raw);
	if (!isFileGraph(parsed)) {
		throw new Error(
			`Unrecognized file graph format: ${fileGraphPath(options)}`,
		);
	}
	return parsed;
}

/** The raw bytes of graph.json; undefined when it has not been generated. */
export async function readFileGraphText(options: {
	readonly projectRoot: string;
}): Promise<string | undefined> {
	try {
		return await readFile(fileGraphPath(options), "utf-8");
	} catch (error: unknown) {
		if (isNotFoundError(error)) return undefined;
		throw error;
	}
}

function fileGraphPath(options: { readonly projectRoot: string }): string {
	return join(
		options.projectRoot,
		ARCHITECTURE_MAP_OUTPUT_DIR,
		FILE_GRAPH_PATH,
	);
}

/** Edges whose `from` is `path`: what the file imports. */
export function dependenciesOf(
	graph: FileGraph,
	path: string,
): readonly FileGraphEdge[] {
	return graph.edges.filter((edge) => edge.from === path);
}

/** Edges whose `to` is `path`: what imports the file, tests included. */
export function dependentsOf(
	graph: FileGraph,
	path: string,
): readonly FileGraphEdge[] {
	return graph.edges.filter((edge) => edge.to === path);
}

/** Stale when a source-root file, a test-root file, or the map config changed since graph.json was written. */
export async function checkFileGraphFreshness(options: {
	readonly projectRoot: string;
	readonly config: ArchitectureMapConfig;
	readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
	readonly testRoots?: readonly string[];
	readonly observer?: ArchitectureMapScanObserver;
}): Promise<ArchitectureMapFreshness> {
	const graph = await loadFileGraph(options);
	if (!graph) return { kind: "missing" };
	const [snapshot, testFiles] = await Promise.all([
		createProjectSnapshot(options),
		collectFileGraphTestFiles(options),
	]);
	return compareFreshnessHashes(
		graph.graphHash,
		computeFileGraphHash(snapshot.hash, testFiles),
	);
}

function isFileGraph(value: unknown): value is FileGraph {
	if (!isRecord(value)) return false;
	return (
		value.schemaVersion === FILE_GRAPH_SCHEMA_VERSION &&
		typeof value.projectHash === "string" &&
		typeof value.graphHash === "string" &&
		Array.isArray(value.nodes) &&
		value.nodes.every(isFileGraphNode) &&
		Array.isArray(value.edges) &&
		value.edges.every(isFileGraphEdge)
	);
}

function isFileGraphNode(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.path === "string" &&
		(value.kind === "source" || value.kind === "test") &&
		Array.isArray(value.exports)
	);
}

function isFileGraphEdge(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.from === "string" &&
		typeof value.to === "string" &&
		typeof value.weight === "number" &&
		typeof value.typeOnly === "boolean"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
