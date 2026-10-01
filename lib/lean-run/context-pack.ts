import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type FileGraph,
	loadSliceSources,
	repoMapSlice,
} from "../architecture-map/index.ts";
import { isGlob, normalizeRepoPaths } from "./graph/paths.ts";

/** The package.json scripts rendered as verification commands, in order. */
const VERIFICATION_SCRIPTS = ["test", "lint", "typecheck"] as const;

export interface BuildContextPackOptions {
	/** The plan section (or direct-fix request), passed through verbatim. */
	readonly planSection: string;
	readonly touches: readonly string[];
	readonly reuses: readonly string[];
	readonly graph: FileGraph;
	/** Token budget for the repo-map slice. */
	readonly budget: number;
	readonly projectRoot: string;
	/** Overrides the commands read from package.json scripts. */
	readonly verificationCommands?: readonly string[];
	/** One line each at the top of the pack, before the plan (see `planPathWarnings`). */
	readonly warnings?: readonly string[];
}

/**
 * A `Touches` or `Reuses` path the slice cannot show: missing from both the
 * project and the file graph (a typo, or a file still to be written), or on
 * disk but not in the graph (a file the map does not analyze). Globs are not
 * checked; a directory is in the graph when a file under it is.
 */
export function planPathWarnings(options: {
	readonly touches: readonly string[];
	readonly reuses: readonly string[];
	readonly graph: FileGraph;
	readonly projectRoot: string;
}): string[] {
	const paths = normalizeRepoPaths([...options.touches, ...options.reuses]);
	return paths.flatMap((path) => {
		if (isGlob(path) || inGraph(options.graph, path)) return [];
		return existsSync(join(options.projectRoot, path))
			? [`plan path is not in the file graph: ${path}`]
			: [`plan path not found (new file?): ${path}`];
	});
}

function inGraph(graph: FileGraph, path: string): boolean {
	return graph.nodes.some(
		(node) => node.path === path || node.path.startsWith(`${path}/`),
	);
}

/**
 * The text every builder receives (lean brief 4.6): the plan section, a
 * repo-map slice around `touches` and `reuses` (files to change render as
 * `[touch]`, helpers to use as `[reuse]`), the project's AGENTS.md, and the
 * verification commands, after any warnings. Empty parts are left out.
 */
export async function buildContextPack(
	options: BuildContextPackOptions,
): Promise<string> {
	const sources = await loadSliceSources({
		projectRoot: options.projectRoot,
		graph: options.graph,
		touchSet: options.touches,
	});
	const slice = repoMapSlice({
		graph: options.graph,
		touchSet: options.touches,
		reuseSet: options.reuses,
		budgetTokens: options.budget,
		sources,
	});
	const conventions = await readOptionalText(
		join(options.projectRoot, "AGENTS.md"),
	);
	const commands =
		options.verificationCommands ??
		(await readVerificationCommands(options.projectRoot));
	const warnings = (options.warnings ?? []).map(
		(warning) => `Warning: ${warning}`,
	);
	return [
		warnings.length > 0 ? warnings.join("\n") : undefined,
		section("Plan", options.planSection),
		section("Repo map", slice.text),
		section("Repository conventions (AGENTS.md)", conventions ?? ""),
		section("Verification commands", commands.join("\n")),
	]
		.filter((part) => part !== undefined)
		.join("\n\n")
		.concat("\n");
}

/** `bun run <name>` for each of the test, lint, and typecheck scripts package.json defines. */
export async function readVerificationCommands(
	projectRoot: string,
): Promise<readonly string[]> {
	const raw = await readOptionalText(join(projectRoot, "package.json"));
	if (raw === undefined) return [];
	const scripts = packageScripts(raw);
	return VERIFICATION_SCRIPTS.filter(
		(name) => typeof scripts[name] === "string",
	).map((name) => `bun run ${name}`);
}

function packageScripts(raw: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed) || !isRecord(parsed.scripts)) return {};
	return parsed.scripts;
}

function section(title: string, body: string): string | undefined {
	const trimmed = body.trim();
	return trimmed === "" ? undefined : `# ${title}\n\n${trimmed}`;
}

async function readOptionalText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if (isNotFoundError(error)) return undefined;
		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
	return isRecord(error) && "code" in error && error.code === "ENOENT";
}
