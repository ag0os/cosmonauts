import {
	type ArchitectureMapFreshness,
	checkFileGraphFreshness,
	type FileGraph,
	loadArchitectureMapConfig,
	loadFileGraph,
	typescriptSourceAnalyzer,
} from "../../architecture-map/index.ts";
import { type BlastRadius, blastRadius } from "../graph/blast-radius.ts";
import { unavailableData } from "../signal-availability.ts";
import type {
	Signal,
	SignalContext,
	SignalProvider,
	UnavailableSignalData,
} from "../types.ts";

export type GraphStatus = "current" | "stale" | "unknown";

export type BlastRadiusSignalData =
	| ({ readonly graph: "missing" | "unreadable" } & UnavailableSignalData)
	| { readonly graph: GraphStatus; readonly radius: BlastRadius };

const MISSING_GRAPH = "graph.json is missing";

export interface BlastRadiusProviderOptions {
	readonly loadGraph?: (projectRoot: string) => Promise<FileGraph | undefined>;
	readonly checkFreshness?: (
		projectRoot: string,
	) => Promise<ArchitectureMapFreshness>;
	readonly maxDependents?: number;
	readonly hubThreshold?: number;
}

/**
 * Informs the reviewer (ruling D-4: never re-enters). A missing or unreadable
 * graph.json is reported as `data.unavailable`, not thrown. A stale graph is still walked, and the
 * summary says the result may miss imports added since it was generated.
 */
export function createBlastRadiusProvider(
	options: BlastRadiusProviderOptions = {},
): SignalProvider {
	const loadGraph = options.loadGraph ?? loadGraphAt;
	const checkFreshness = options.checkFreshness ?? checkFreshnessAt;
	return {
		kind: "blast-radius",
		async run(ctx: SignalContext): Promise<Signal> {
			let graph: FileGraph | undefined;
			try {
				graph = await loadGraph(ctx.worktree);
			} catch (error: unknown) {
				const reason = errorMessage(error);
				return info(`graph.json is unreadable: ${reason}`, {
					graph: "unreadable",
					...unavailableData(`graph.json is unreadable: ${reason}`),
				});
			}
			if (graph === undefined) {
				return info(
					`${MISSING_GRAPH}; run \`cosmonauts architecture generate --file-graph\` to compute the blast radius.`,
					{ graph: "missing", ...unavailableData(MISSING_GRAPH) },
				);
			}
			const radius = blastRadius({
				graph,
				changedFiles: ctx.changedFiles,
				maxDependents: options.maxDependents,
				hubThreshold: options.hubThreshold,
			});
			const status = await graphStatus(checkFreshness, ctx.worktree);
			return info(summarize(status, radius), { graph: status, radius });
		},
	};
}

async function graphStatus(
	checkFreshness: (projectRoot: string) => Promise<ArchitectureMapFreshness>,
	projectRoot: string,
): Promise<GraphStatus> {
	try {
		const freshness = await checkFreshness(projectRoot);
		return freshness.kind === "current" ? "current" : "stale";
	} catch {
		return "unknown";
	}
}

function summarize(status: GraphStatus, radius: BlastRadius): string {
	const counts = `${radius.changed.length} changed, ${radius.dependents.length} dependents, ${radius.tests.length} tests`;
	const hubs =
		radius.hubs.length > 0
			? `; hubs not expanded transitively: ${radius.hubs.join(", ")}`
			: "";
	const truncated = radius.truncated ? " (truncated)" : "";
	const prefix = STATUS_PREFIX[status];
	return `${prefix}Blast radius: ${counts}${truncated}${hubs}.`;
}

const STATUS_PREFIX: Readonly<Record<GraphStatus, string>> = {
	current: "",
	stale:
		"graph.json is stale; imports added since it was generated are missing. ",
	unknown: "graph.json freshness could not be checked. ",
};

function info(summary: string, data: BlastRadiusSignalData): Signal {
	return {
		kind: "blast-radius",
		status: "info",
		summary,
		data,
		reenter: false,
	};
}

function loadGraphAt(projectRoot: string): Promise<FileGraph | undefined> {
	return loadFileGraph({ projectRoot });
}

async function checkFreshnessAt(
	projectRoot: string,
): Promise<ArchitectureMapFreshness> {
	return checkFileGraphFreshness({
		projectRoot,
		config: await loadArchitectureMapConfig(projectRoot),
		analyzer: typescriptSourceAnalyzer,
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
