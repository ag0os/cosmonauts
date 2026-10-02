import { Command, Option } from "commander";
import {
	LEAN_BACKEND_KINDS,
	type LeanBackendKind,
	type RunBuildOptions,
	type RunRecord,
	type RunReviewOptions,
	runBuild,
	runReview,
	type SignalProvider,
	summarizeRun,
} from "../../lib/lean-run/index.ts";
import {
	type CheckPlanOptions,
	checkPlan,
	type PlanCheckReport,
} from "../../lib/lean-run/plan-check.ts";
import { createDefaultProviders } from "../../lib/lean-run/providers/default.ts";
import {
	type CreateLeanBackends,
	runtimeBackends,
} from "../../lib/lean-run/runtime-backends.ts";
import { type SignalSource, withInterruptSignal } from "../shared/interrupt.ts";
import { printJson, printLines } from "../shared/output.ts";

interface LeanProgramOptions {
	readonly cwd?: string;
	readonly signals?: SignalSource;
	readonly setExitCode?: (code: number) => void;
	readonly checkPlan?: (options: CheckPlanOptions) => Promise<PlanCheckReport>;
	readonly runBuild?: (options: RunBuildOptions) => Promise<RunRecord>;
	readonly runReview?: (options: RunReviewOptions) => Promise<RunRecord>;
	readonly createBackends?: CreateLeanBackends;
	/** The host's signal providers for a build; defaults to `createDefaultProviders()`. */
	readonly providers?: readonly SignalProvider[];
}

interface RunCommandOptions {
	readonly plan?: string;
	readonly spec?: string;
	readonly base?: string;
	readonly backend: LeanBackendKind;
	readonly clearStaleLock?: boolean;
	readonly json?: boolean;
}

/** `cosmonauts lean`: the lean host's plan check, build and review, for agents outside a lead session. */
export function createLeanProgram(options: LeanProgramOptions = {}): Command {
	const cwd = options.cwd ?? process.cwd();
	const setExitCode =
		options.setExitCode ??
		((code: number) => {
			process.exitCode = code;
		});
	const program = new Command()
		.name("cosmonauts lean")
		.description("Lean plan check, build and review from the shell")
		.configureOutput({
			outputError: (text, write) =>
				jsonFlagGiven(program) ? printError(text.trim()) : write(text),
		});

	program
		.command("check <plan>")
		.description(
			"Check a lean plan.md: empty sections, paths the repo map cannot show, behavior line shape",
		)
		.option("--json", "Print the report as JSON")
		.action(async (planPath: string, command: { json?: boolean }) => {
			const report = await (options.checkPlan ?? checkPlan)({
				projectRoot: cwd,
				planPath,
			}).catch((error: unknown) => {
				const text = `cannot read ${planPath}: ${message(error)}`;
				if (command.json) printError(text);
				else printLines([text], "stderr");
				return undefined;
			});
			setExitCode(report?.ok ? 0 : 1);
			if (!report) return;
			if (command.json) printJson(report);
			else printLines(renderCheckText(report));
		});

	const runCommand = (name: string, description: string) =>
		program
			.command(name)
			.description(description)
			.addOption(
				new Option("--backend <kind>", "Where the builder and reviewer run")
					.choices(LEAN_BACKEND_KINDS)
					.default("pi"),
			)
			.option(
				"--clear-stale-lock",
				"Start even though a previous run's cleanup is unconfirmed (its processes may still run); only that lock is cleared",
			)
			.option("--json", "Print the run as JSON");

	runCommand(
		"build",
		"Run a lean build for a plan, as the lean_build tool does",
	)
		.requiredOption("--plan <path>", "plan.md, relative to the project root")
		.option("--spec <path>", "spec.md, when the change has one")
		.action(async (command: RunCommandOptions) => {
			const record = await withRun(command, (backends, signal) =>
				(options.runBuild ?? runBuild)({
					projectRoot: cwd,
					planPath: command.plan ?? "",
					...(command.spec ? { specPath: command.spec } : {}),
					backend: backends.builder,
					reviewerBackend: backends.reviewer,
					providers: options.providers ?? createDefaultProviders(),
					...clearStaleLock(command),
					signal,
				}),
			);
			if (record) report(record, runDetails(record), command.json);
		});

	runCommand(
		"review",
		"Review the existing change, as the lean_review tool does",
	)
		.option("--base <ref>", "Git ref to review the working tree against")
		.option("--plan <path>", "plan.md the change answers, as context")
		.action(async (command: RunCommandOptions) => {
			const record = await withRun(command, (backends, signal) =>
				(options.runReview ?? runReview)({
					projectRoot: cwd,
					...(command.base ? { base: command.base } : {}),
					...(command.plan ? { planPath: command.plan } : {}),
					reviewerBackend: backends.reviewer,
					...clearStaleLock(command),
					signal,
				}),
			);
			if (!record) return;
			const { runDir, ...details } = runDetails(record);
			const findings = record.envelopes.reviewer?.findings ?? [];
			report(record, { ...details, findings, runDir }, command.json);
		});

	async function withRun(
		command: RunCommandOptions,
		run: (
			backends: Awaited<ReturnType<CreateLeanBackends>>,
			signal: AbortSignal,
		) => Promise<RunRecord>,
	): Promise<RunRecord | undefined> {
		try {
			const createBackends = options.createBackends ?? runtimeBackends();
			const backends = await createBackends(command.backend, cwd);
			return await withInterruptSignal(options.signals ?? process, (signal) =>
				run(backends, signal),
			);
		} catch (error) {
			if (!command.json) throw error;
			printError(message(error));
			setExitCode(1);
			return undefined;
		}
	}

	function report(record: RunRecord, details: object, json?: boolean): void {
		setExitCode(record.manifest.status === "done" ? 0 : 1);
		if (json) printJson(details);
		else printLines([summarizeRun(record), `Run directory: ${record.dir}`]);
	}

	return program;
}

function clearStaleLock(command: RunCommandOptions) {
	return command.clearStaleLock ? { clearStaleLock: true } : {};
}

/**
 * Whether argv carries `--json` as a flag: before any `--`, and not as the
 * value of an option that takes one (`--plan --json`). The error hook needs
 * this because commander may fail before it has parsed `--json`. It reads
 * commander's untyped `rawArgs`, since `program.args` drops the `--`.
 */
function jsonFlagGiven(program: Command): boolean {
	const takesValue = new Set(
		program.commands.flatMap((command) =>
			command.options
				.filter((option) => option.required)
				.map((option) => option.long),
		),
	);
	const raw = "rawArgs" in program ? program.rawArgs : undefined;
	const args = Array.isArray(raw) ? raw.map(String) : program.args;
	for (let i = 0; i < args.length && args[i] !== "--"; i++) {
		if (args[i] === "--json") return true;
		if (takesValue.has(args[i])) i++;
	}
	return false;
}

/** A failure under `--json`: one line on stdout, so a JSON reader still gets JSON. */
function printError(error: string): void {
	process.stdout.write(`${JSON.stringify({ error })}\n`);
}

function runDetails(record: RunRecord) {
	return {
		runId: record.manifest.id,
		status: record.manifest.status,
		reason: record.manifest.reason ?? null,
		summary: summarizeRun(record),
		runDir: record.dir,
	};
}

export function renderCheckText(report: PlanCheckReport): string[] {
	return [
		`${report.plan}: ${report.ok ? "ok" : "not ok"}${report.title ? ` (${report.title})` : ""}`,
		...report.emptySections.map((name) => `empty section: ${name}`),
		...report.behaviorProblems.map((problem) => `behavior: ${problem}`),
		...report.pathWarnings.map((warning) => `warning: ${warning}`),
		...(report.graph === "available" ? [] : [`file graph ${report.graph}`]),
	];
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
