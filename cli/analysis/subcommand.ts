import { Command, Option } from "commander";
import {
	type ChangedFunction,
	type ChangedFunctionsReport,
	resolveChangedFunctions as defaultResolveChangedFunctions,
	type ResolveChangedFunctionsOptions,
} from "../../lib/code-health/changed-functions.ts";
import { printJson, printLines } from "../shared/output.ts";

const CHANGED_FUNCTIONS_FORMATS = ["text", "json"] as const;
type ChangedFunctionsFormat = (typeof CHANGED_FUNCTIONS_FORMATS)[number];
const INTERRUPT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/** Where interrupt signals come from; `process` outside tests. */
interface SignalSource {
	once(event: NodeJS.Signals, listener: () => void): unknown;
	off(event: NodeJS.Signals, listener: () => void): unknown;
}

interface AnalysisProgramOptions {
	readonly cwd?: string;
	readonly signals?: SignalSource;
	readonly resolveChangedFunctions?: (
		options: ResolveChangedFunctionsOptions,
	) => Promise<ChangedFunctionsReport>;
}

interface ChangedFunctionsCommandOptions {
	readonly base: string;
	readonly file?: string;
	readonly format: ChangedFunctionsFormat;
}

export function createAnalysisProgram(
	options: AnalysisProgramOptions = {},
): Command {
	const program = new Command();

	program
		.name("cosmonauts analysis")
		.description("Deterministic code analysis over the working tree");

	program
		.command("changed-functions")
		.description(
			"List functions touched since a base revision with complexity now and at the base",
		)
		.requiredOption(
			"--base <rev>",
			"Revision to compare the working tree against",
		)
		.option("--file <path>", "Only report functions in this file")
		.addOption(
			new Option("--format <format>", "Output format")
				.choices(CHANGED_FUNCTIONS_FORMATS)
				.default("text"),
		)
		.action(async (commandOptions: ChangedFunctionsCommandOptions) => {
			const resolve =
				options.resolveChangedFunctions ?? defaultResolveChangedFunctions;
			const report = await withInterruptSignal(
				options.signals ?? process,
				(signal) =>
					resolve({
						cwd: options.cwd ?? process.cwd(),
						base: commandOptions.base,
						...(commandOptions.file === undefined
							? {}
							: { file: commandOptions.file }),
						signal,
					}),
			);
			if (commandOptions.format === "json") {
				printJson(report);
				return;
			}
			printLines(renderChangedFunctionsText(report));
		});

	return program;
}

/**
 * Abort the run on SIGINT or SIGTERM so the resolver removes its base
 * worktree before the process exits. A second signal gets the default
 * behavior, because each listener fires once.
 */
async function withInterruptSignal<T>(
	source: SignalSource,
	run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	const listeners = INTERRUPT_SIGNALS.map((name) => {
		const listener = () =>
			controller.abort(new Error(`interrupted by ${name}`));
		source.once(name, listener);
		return { name, listener };
	});
	try {
		return await run(controller.signal);
	} finally {
		for (const { name, listener } of listeners) source.off(name, listener);
	}
}

/** One line per function: location, name, metrics with base values, marker. */
export function renderChangedFunctionsText(
	report: ChangedFunctionsReport,
): string[] {
	if (report.functions.length === 0) {
		return [`No changed functions since ${report.base}.`];
	}
	return report.functions.map(renderFunctionLine);
}

function renderFunctionLine(fn: ChangedFunction): string {
	const metrics = [
		metric("cyclomatic", fn.cyclomatic, fn.base?.cyclomatic),
		metric("cognitive", fn.cognitive, fn.base?.cognitive),
		metric("crap", fn.crap, fn.base?.crap),
	];
	return [
		`${fn.file}:${fn.startLine}-${fn.endLine}`,
		fn.name,
		...metrics,
		statusMarker(fn),
	]
		.filter((part) => part.length > 0)
		.join("  ");
}

function statusMarker(fn: ChangedFunction): string {
	if (fn.base === null) return "NEW";
	return fn.regressed ? "REGRESSED" : "";
}

function metric(
	label: string,
	current: number | null,
	base: number | null | undefined,
): string {
	const now = `${label} ${formatValue(current)}`;
	return base === undefined ? now : `${now} (base ${formatValue(base)})`;
}

function formatValue(value: number | null): string {
	return value === null ? "n/a" : String(value);
}
