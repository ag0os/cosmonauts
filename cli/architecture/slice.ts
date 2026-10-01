import type { Command } from "commander";
import {
	ARCHITECTURE_MAP_OUTPUT_DIR,
	checkFileGraphFreshness,
	DEFAULT_SLICE_BUDGET_TOKENS,
	FILE_GRAPH_PATH,
	loadFileGraph,
	loadSliceSources,
	type RepoMapSlice,
	repoMapSlice,
	resolveArchitectureMapConfig,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import { printJson, printLines } from "../shared/output.ts";

const SLICE_FORMATS = ["text", "json"] as const;
type SliceFormat = (typeof SLICE_FORMATS)[number];

const GENERATE_COMMAND = "cosmonauts architecture generate --file-graph";
const GRAPH_PATH = `${ARCHITECTURE_MAP_OUTPUT_DIR}/${FILE_GRAPH_PATH}`;

interface SliceCommandOptions {
	readonly touch: readonly string[];
	readonly budget: string;
	readonly format: string;
}

interface ExecuteArchitectureSliceOptions {
	readonly projectRoot: string;
	readonly touch: readonly string[];
	readonly budget: string;
	readonly format: string;
}

interface ArchitectureSliceCommandResult {
	readonly exitCode: number;
	readonly stdout?:
		| { readonly kind: "text"; readonly text: string }
		| { readonly kind: "json"; readonly value: RepoMapSlice };
	readonly stderr: readonly string[];
}

export function registerArchitectureSliceCommand(
	program: Command,
	options: { readonly projectRoot?: string },
): void {
	program
		.command("slice")
		.description(
			"Print the files around a touch set, ranked and cut to a token budget",
		)
		.option(
			"--touch <paths>",
			"Comma-separated repo-relative files or directories (repeatable)",
			collectPaths,
			[],
		)
		.option(
			"--budget <tokens>",
			"Token budget (chars/4)",
			String(DEFAULT_SLICE_BUDGET_TOKENS),
		)
		.option("--format <format>", "Output format: text or json", "text")
		.action(async (commandOptions: SliceCommandOptions) => {
			const result = await executeArchitectureSlice({
				...commandOptions,
				projectRoot: options.projectRoot ?? process.cwd(),
			});
			emitArchitectureSliceResult(result);
		});
}

export async function executeArchitectureSlice(
	options: ExecuteArchitectureSliceOptions,
): Promise<ArchitectureSliceCommandResult> {
	const input = parseSliceInput(options);
	if (typeof input === "string") return failure([input]);
	const graphError = await fileGraphError(options.projectRoot);
	if (graphError) return failure(graphError);
	const graph = await loadFileGraph({ projectRoot: options.projectRoot });
	if (!graph) return failure(missingGraphMessage());
	const sources = await loadSliceSources({
		projectRoot: options.projectRoot,
		graph,
		touchSet: options.touch,
	});
	const slice = repoMapSlice({
		graph,
		touchSet: options.touch,
		budgetTokens: input.budget,
		sources,
	});
	return renderSlice(slice, input.format);
}

function parseSliceInput(
	options: ExecuteArchitectureSliceOptions,
): { readonly budget: number; readonly format: SliceFormat } | string {
	if (options.touch.length === 0) {
		return "Pass at least one path with --touch <path>[,<path>...].";
	}
	const budget = Number(options.budget);
	if (!Number.isInteger(budget) || budget <= 0) {
		return `--budget must be a positive integer, got "${options.budget}".`;
	}
	if (!isSliceFormat(options.format)) {
		return `--format must be text or json, got "${options.format}".`;
	}
	return { budget, format: options.format };
}

async function fileGraphError(
	projectRoot: string,
): Promise<readonly string[] | undefined> {
	const config = await resolveArchitectureMapConfig({ projectRoot });
	const freshness = await checkFileGraphFreshness({
		projectRoot,
		config,
		analyzer: typescriptSourceAnalyzer,
	});
	if (freshness.kind === "missing") return missingGraphMessage();
	if (freshness.kind === "stale") {
		return [
			`${GRAPH_PATH} is stale: source, test, or map config files changed since it was generated.`,
			`Run \`${GENERATE_COMMAND}\` to refresh it.`,
		];
	}
	return undefined;
}

function missingGraphMessage(): readonly string[] {
	return [
		`No file graph at ${GRAPH_PATH}.`,
		`Run \`${GENERATE_COMMAND}\` first.`,
	];
}

function renderSlice(
	slice: RepoMapSlice,
	format: SliceFormat,
): ArchitectureSliceCommandResult {
	const warnings = slice.unknown.map(
		(path) => `Not in the file graph: ${path}`,
	);
	if (slice.included.length === 0 && slice.unknown.length > 0) {
		return failure(warnings);
	}
	return {
		exitCode: 0,
		stdout:
			format === "json"
				? { kind: "json", value: slice }
				: { kind: "text", text: slice.text },
		stderr: warnings,
	};
}

function failure(lines: readonly string[]): ArchitectureSliceCommandResult {
	return { exitCode: 1, stderr: lines };
}

function emitArchitectureSliceResult(
	result: ArchitectureSliceCommandResult,
): void {
	printLines(result.stderr, "stderr");
	if (result.stdout?.kind === "json") printJson(result.stdout.value);
	if (result.stdout?.kind === "text") printLines([result.stdout.text]);
	if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function collectPaths(value: string, previous: readonly string[]): string[] {
	const paths = value
		.split(",")
		.map((path) => path.trim())
		.filter((path) => path !== "");
	return [...previous, ...paths];
}

function isSliceFormat(value: string): value is SliceFormat {
	return (SLICE_FORMATS as readonly string[]).includes(value);
}
