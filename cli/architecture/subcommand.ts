import { Command } from "commander";
import {
	generateArchitectureMap as defaultGenerateArchitectureMap,
	type GenerateArchitectureMapOptions,
	type GenerateArchitectureMapResult,
	type NarrativeProvider,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import {
	type CliOutputMode,
	getOutputMode,
	printJson,
	printLines,
} from "../shared/output.ts";
import { createPiArchitectureNarrativeProvider } from "./narrative-provider.ts";

type GenerateArchitectureMapFn = (
	options: GenerateArchitectureMapOptions,
) => Promise<GenerateArchitectureMapResult>;

type CreateNarrativeProviderFn = (options: {
	readonly projectRoot: string;
}) => NarrativeProvider;

interface ArchitectureProgramOptions {
	readonly projectRoot?: string;
	readonly generateArchitectureMap?: GenerateArchitectureMapFn;
	readonly createNarrativeProvider?: CreateNarrativeProviderFn;
}

interface ArchitectureGenerateOptions {
	readonly noNarrative?: boolean;
	readonly narrative?: boolean;
	readonly json?: boolean;
	readonly plain?: boolean;
}

interface ExecuteArchitectureGenerateOptions
	extends ArchitectureProgramOptions {
	readonly projectRoot: string;
	readonly noNarrative: boolean;
	readonly outputMode: CliOutputMode;
	readonly progress?: (message: string) => void;
}

interface ArchitectureGenerateCommandResult {
	readonly result: GenerateArchitectureMapResult;
	readonly rendered:
		| { readonly kind: "json"; readonly value: GenerateArchitectureMapResult }
		| { readonly kind: "lines"; readonly lines: readonly string[] };
	readonly exitCode: number;
}

export function createArchitectureProgram(
	options: ArchitectureProgramOptions = {},
): Command {
	const program = new Command();

	program
		.name("cosmonauts architecture")
		.alias("arch")
		.description("Generate and inspect architecture map artifacts")
		.version("1.0.0");

	program
		.command("generate")
		.description(
			"Generate memory/architecture from TypeScript source structure",
		)
		.option(
			"--no-narrative",
			"Skip model-backed prose and write pending narrative entries",
		)
		.option("--json", "Output the generator result as JSON")
		.option("--plain", "Output in plain text format")
		.action(async (commandOptions: ArchitectureGenerateOptions) => {
			await runArchitectureGenerateCommand({
				...options,
				projectRoot: options.projectRoot ?? process.cwd(),
				noNarrative:
					commandOptions.noNarrative === true ||
					commandOptions.narrative === false,
				outputMode: getOutputMode(commandOptions),
			});
		});

	return program;
}

async function runArchitectureGenerateCommand(
	options: ExecuteArchitectureGenerateOptions,
): Promise<void> {
	const progress =
		options.outputMode === "json"
			? undefined
			: (message: string) => printLines([message], "stderr");
	const commandResult = await executeArchitectureGenerate({
		...options,
		...(progress ? { progress } : {}),
	});
	emitArchitectureGenerateResult(commandResult.rendered);
	if (commandResult.exitCode !== 0) {
		process.exitCode = commandResult.exitCode;
	}
}

export async function executeArchitectureGenerate(
	options: ExecuteArchitectureGenerateOptions,
): Promise<ArchitectureGenerateCommandResult> {
	const generateArchitectureMap =
		options.generateArchitectureMap ?? defaultGenerateArchitectureMap;
	const createNarrativeProvider =
		options.createNarrativeProvider ?? createPiArchitectureNarrativeProvider;
	const narrativeProvider = options.noNarrative
		? undefined
		: createNarrativeProvider({ projectRoot: options.projectRoot });
	const progressNarrativeProvider = narrativeProvider
		? withNarrativeProgress(narrativeProvider, options.progress)
		: undefined;

	options.progress?.("Generating architecture map...");
	const result = await generateArchitectureMap({
		projectRoot: options.projectRoot,
		analyzer: typescriptSourceAnalyzer,
		...(progressNarrativeProvider
			? { narrativeProvider: progressNarrativeProvider }
			: {}),
	});

	return {
		result,
		...renderArchitectureGenerateResult(result, options.outputMode),
	};
}

function withNarrativeProgress(
	provider: NarrativeProvider,
	progress: ((message: string) => void) | undefined,
): NarrativeProvider {
	if (!progress) return provider;

	let reported = false;
	return {
		async generate(input, signal) {
			if (!reported) {
				reported = true;
				progress("Generating architecture narratives...");
			}
			return provider.generate(input, signal);
		},
	};
}

export function renderArchitectureGenerateResult(
	result: GenerateArchitectureMapResult,
	mode: CliOutputMode,
): Pick<ArchitectureGenerateCommandResult, "rendered" | "exitCode"> {
	if (mode === "json") {
		return {
			exitCode: architectureGenerateExitCode(result),
			rendered: { kind: "json", value: result },
		};
	}

	return {
		exitCode: architectureGenerateExitCode(result),
		rendered: {
			kind: "lines",
			lines:
				mode === "plain"
					? renderPlainArchitectureGenerateResult(result)
					: renderHumanArchitectureGenerateResult(result),
		},
	};
}

function architectureGenerateExitCode(
	result: GenerateArchitectureMapResult,
): number {
	switch (result.kind) {
		case "written":
		case "unchanged":
			return 0;
		case "unsupported":
		case "failed":
			return 1;
	}
}

function renderHumanArchitectureGenerateResult(
	result: GenerateArchitectureMapResult,
): readonly string[] {
	switch (result.kind) {
		case "written":
			return [
				"Architecture map written.",
				...(result.changedFiles.length > 0
					? ["Changed files:", ...indent(result.changedFiles)]
					: []),
				...(result.pendingModules.length > 0
					? ["Pending narratives:", ...indent(result.pendingModules)]
					: []),
			];
		case "unchanged":
			return ["Architecture map unchanged."];
		case "unsupported":
			return [`Architecture map unsupported-project: ${result.reason}`];
		case "failed":
			return [
				`Architecture map failed: ${result.error}`,
				`Previous map intact: ${result.previousMapIntact ? "yes" : "no"}`,
			];
	}
}

function renderPlainArchitectureGenerateResult(
	result: GenerateArchitectureMapResult,
): readonly string[] {
	switch (result.kind) {
		case "written":
			return [
				"kind=written",
				`changedFiles=${result.changedFiles.join(",")}`,
				`pendingModules=${result.pendingModules.join(",")}`,
			];
		case "unchanged":
			return ["kind=unchanged"];
		case "unsupported":
			return ["kind=unsupported", `reason=${result.reason}`];
		case "failed":
			return [
				"kind=failed",
				`error=${result.error}`,
				`previousMapIntact=${String(result.previousMapIntact)}`,
			];
	}
}

function indent(lines: readonly string[]): readonly string[] {
	return lines.map((line) => `  ${line}`);
}

function emitArchitectureGenerateResult(
	rendered: ArchitectureGenerateCommandResult["rendered"],
): void {
	if (rendered.kind === "json") {
		printJson(rendered.value);
		return;
	}
	printLines(rendered.lines);
}
