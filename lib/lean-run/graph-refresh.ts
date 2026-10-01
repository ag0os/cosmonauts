import {
	checkFileGraphFreshness,
	type FileGraph,
	generateArchitectureMap,
	loadArchitectureMapConfig,
	loadFileGraph,
	typescriptSourceAnalyzer,
} from "../architecture-map/index.ts";

/** Why graph.json had to be regenerated. */
export type GraphRegenerationCause = "missing" | "stale" | "corrupt";

export type FileGraphRefresh =
	| { readonly outcome: "current"; readonly graph: FileGraph }
	| {
			readonly outcome: "regenerated";
			readonly cause: GraphRegenerationCause;
			/** The load or freshness error behind a `corrupt` cause. */
			readonly detail?: string;
			readonly graph: FileGraph;
	  }
	| { readonly outcome: "unavailable"; readonly reason: string };

/** Brings memory/architecture/graph.json up to date; never throws. */
export type RefreshFileGraph = (options: {
	readonly projectRoot: string;
}) => Promise<FileGraphRefresh>;

type GraphState =
	| { readonly kind: "current"; readonly graph: FileGraph }
	| { readonly kind: "missing" | "stale" }
	| { readonly kind: "corrupt"; readonly detail: string };

/**
 * Keeps graph.json current for the context pack and the providers (lean
 * brief 4.7B.3): a missing, stale, or unreadable graph is regenerated with
 * the same pass as `cosmonauts architecture generate --file-graph --no-narrative`.
 * A project the generator cannot map leaves the graph unavailable.
 */
export const refreshFileGraph: RefreshFileGraph = async ({ projectRoot }) => {
	try {
		const state = await graphState(projectRoot);
		if (state.kind === "current")
			return { outcome: "current", graph: state.graph };
		return await regenerate(projectRoot, state);
	} catch (error: unknown) {
		return { outcome: "unavailable", reason: errorMessage(error) };
	}
};

/** A graph.json that fails to load or check is `corrupt` (wp3g-2 F-5), never a thrown error. */
async function graphState(projectRoot: string): Promise<GraphState> {
	try {
		const freshness = await checkFileGraphFreshness({
			projectRoot,
			config: await loadArchitectureMapConfig(projectRoot),
			analyzer: typescriptSourceAnalyzer,
		});
		if (freshness.kind !== "current") return { kind: freshness.kind };
		const graph = await loadFileGraph({ projectRoot });
		return graph ? { kind: "current", graph } : { kind: "missing" };
	} catch (error: unknown) {
		return { kind: "corrupt", detail: errorMessage(error) };
	}
}

async function regenerate(
	projectRoot: string,
	state: Exclude<GraphState, { kind: "current" }>,
): Promise<FileGraphRefresh> {
	const result = await generateArchitectureMap({
		projectRoot,
		analyzer: typescriptSourceAnalyzer,
		fileGraph: true,
	});
	if (result.kind === "unsupported")
		return { outcome: "unavailable", reason: result.reason };
	if (result.kind === "failed")
		return { outcome: "unavailable", reason: result.error };
	const graph = await loadFileGraph({ projectRoot });
	if (!graph)
		return {
			outcome: "unavailable",
			reason: "the generator wrote no graph.json",
		};
	return {
		outcome: "regenerated",
		cause: state.kind,
		...(state.kind === "corrupt" ? { detail: state.detail } : {}),
		graph,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
