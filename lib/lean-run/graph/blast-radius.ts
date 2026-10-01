import {
	dependentsOf,
	type FileGraph,
	type FileGraphNodeKind,
} from "../../architecture-map/index.ts";
import type { ChangedFunction } from "../../code-health/changed-functions.ts";
import { compareStrings, normalizeRepoPaths } from "./paths.ts";

export const DEFAULT_MAX_DEPENDENTS = 200;
export const DEFAULT_HUB_THRESHOLD = 25;

/** A runnable spec file; other files under the test roots are helpers. */
export const SPEC_FILE_PATTERN = /\.(test|spec)\.tsx?$/u;

export function isSpecFile(path: string): boolean {
	return SPEC_FILE_PATTERN.test(path);
}

export interface BlastRadiusOptions {
	readonly graph: FileGraph;
	readonly changedFiles: readonly string[];
	/** Their files join the changed set; a function resolver may see files a name-only diff missed. */
	readonly changedFunctions?: readonly Pick<ChangedFunction, "file">[];
	/** Cap on source dependents collected across the whole walk. */
	readonly maxDependents?: number;
	/** A file with more direct importers than this is a hub: only its direct tests are followed. */
	readonly hubThreshold?: number;
}

export interface BlastRadius {
	readonly changed: string[];
	/** Source files that transitively import a changed file. */
	readonly dependents: string[];
	/** Spec files reached by the walk, plus changed spec files. */
	readonly tests: string[];
	/** Files whose importers were not expanded transitively because there were too many. */
	readonly hubs: string[];
	/** True when a hub was found or the dependents cap was reached. */
	readonly truncated: boolean;
}

/** `full` follows every importer; `tests-only` follows test importers alone. */
type Reach = "full" | "tests-only";

interface QueueEntry {
	readonly path: string;
	readonly reach: Reach;
}

interface Walk {
	readonly graph: FileGraph;
	readonly kinds: ReadonlyMap<string, FileGraphNodeKind>;
	readonly changed: ReadonlySet<string>;
	readonly maxDependents: number;
	readonly hubThreshold: number;
	readonly reached: Map<string, Reach>;
	readonly queue: QueueEntry[];
	readonly dependents: Set<string>;
	readonly tests: Set<string>;
	readonly hubs: Set<string>;
	truncated: boolean;
}

/**
 * Reverse import closure from the changed files (ruling G-2): breadth-first
 * over importers, stopping at spec files and passing through test helpers.
 * A hub's direct test importers are always collected. A changed hub also
 * contributes its direct source dependents, up to the cap, and their direct
 * tests, but nothing is expanded transitively past a hub.
 */
export function blastRadius(options: BlastRadiusOptions): BlastRadius {
	const changed = normalizeRepoPaths([
		...options.changedFiles,
		...(options.changedFunctions ?? []).map((entry) => entry.file),
	]);
	const walk = startWalk(options, changed);
	for (let index = 0; index < walk.queue.length; index += 1) {
		expand(walk, walk.queue[index] as QueueEntry);
	}
	return {
		changed,
		dependents: sorted(walk.dependents),
		tests: sorted(walk.tests),
		hubs: sorted(walk.hubs),
		truncated: walk.truncated,
	};
}

function startWalk(options: BlastRadiusOptions, changed: string[]): Walk {
	const walk: Walk = {
		graph: options.graph,
		kinds: new Map(options.graph.nodes.map((node) => [node.path, node.kind])),
		changed: new Set(changed),
		maxDependents: options.maxDependents ?? DEFAULT_MAX_DEPENDENTS,
		hubThreshold: options.hubThreshold ?? DEFAULT_HUB_THRESHOLD,
		reached: new Map(),
		queue: [],
		dependents: new Set(),
		tests: new Set(),
		hubs: new Set(),
		truncated: false,
	};
	for (const path of changed) {
		if (isSpecFile(path)) walk.tests.add(path);
		else enqueue(walk, path, "full");
	}
	return walk;
}

function expand(walk: Walk, entry: QueueEntry): void {
	const importers = importersOf(walk.graph, entry.path);
	const sources = importers.filter((path) => !isTestFile(walk, path));
	for (const path of importers) {
		if (isTestFile(walk, path)) visitTest(walk, path);
	}
	if (entry.reach === "tests-only") return;
	if (!isHub(walk, entry.path, importers.length)) {
		for (const path of sources) visitSource(walk, path, "full");
		return;
	}
	walk.hubs.add(entry.path);
	walk.truncated = true;
	if (!walk.changed.has(entry.path)) return;
	for (const path of sources) visitSource(walk, path, "tests-only");
}

function isHub(walk: Walk, path: string, importerCount: number): boolean {
	return importerCount > walk.hubThreshold && !isTestFile(walk, path);
}

function visitTest(walk: Walk, path: string): void {
	if (isSpecFile(path)) walk.tests.add(path);
	else enqueue(walk, path, "full");
}

function visitSource(walk: Walk, path: string, reach: Reach): void {
	const previous = walk.reached.get(path);
	if (previous === "full" || previous === reach) return;
	if (previous === undefined) {
		if (walk.dependents.size >= walk.maxDependents) {
			walk.truncated = true;
			return;
		}
		walk.dependents.add(path);
	}
	enqueue(walk, path, reach);
}

function enqueue(walk: Walk, path: string, reach: Reach): void {
	const previous = walk.reached.get(path);
	if (previous === "full" || previous === reach) return;
	walk.reached.set(path, reach);
	walk.queue.push({ path, reach });
}

function importersOf(graph: FileGraph, path: string): string[] {
	return sorted(new Set(dependentsOf(graph, path).map((edge) => edge.from)));
}

/** A spec or a helper: graph test nodes, plus spec files the graph does not know yet. */
function isTestFile(walk: Walk, path: string): boolean {
	return walk.kinds.get(path) === "test" || isSpecFile(path);
}

function sorted(values: Iterable<string>): string[] {
	return [...values].sort(compareStrings);
}
