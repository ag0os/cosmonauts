import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type ProviderProcessExecutor,
	type ProviderProcessOutcome,
	runProviderProcess,
} from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import { loadProjectConfig } from "../../config/index.ts";
import type { QualityReviewCommand } from "../../config/types.ts";
import type {
	Signal,
	SignalContext,
	SignalProvider,
	SignalStatus,
} from "../types.ts";

export interface VerifyCommand {
	readonly executable: string;
	readonly args: readonly string[];
	/**
	 * Capped by what is left of `ctx.budget.timeMs` counted from when
	 * verification starts; the run's own deadline aborts through `ctx.signal`.
	 */
	readonly timeoutMs?: number;
}

interface VerifyProviderOptions {
	/**
	 * Defaults to `.cosmonauts/config.json` `qualityReview.checks`, else
	 * `bun run <script>` for each of {@link PACKAGE_SCRIPTS} present.
	 */
	readonly commands?: readonly VerifyCommand[];
	readonly runProcess?: ProviderProcessExecutor;
}

type CommandOutcome = ProviderProcessOutcome["kind"] | "skipped";
type CommandVerdict = "passed" | "failed" | "not-run";

interface CommandResult {
	readonly command: string;
	/** Null when the command did not exit on its own. */
	readonly exitCode: number | null;
	readonly outcome: CommandOutcome;
	readonly verdict: CommandVerdict;
	readonly durationMs: number;
	readonly outputTail: string;
}

export interface VerifyData {
	readonly commands: readonly CommandResult[];
	/** Set when nothing failed but not every check ran, so nothing was proven. */
	readonly unverified?: true;
	readonly reason?: string;
}

interface RunCommandOptions {
	readonly command: VerifyCommand;
	readonly ctx: SignalContext;
	readonly deadline: number;
	readonly runProcess: ProviderProcessExecutor;
}

const PACKAGE_SCRIPTS = ["typecheck", "lint", "test"] as const;
const BASE_PLACEHOLDER = "{base}";
const OUTPUT_TAIL_CHARS = 4_000;

/**
 * Runs the project's verification commands in the run worktree, in order,
 * within `ctx.budget.timeMs` in total. A command that ran and did not exit 0
 * (including a timeout) makes the signal `fail` and re-enters the builder
 * (ruling D-4). When nothing failed but some command never ran (missing
 * executable, abort, exhausted budget, no commands at all), the signal is
 * `info` without re-entry and `data.unverified` is true with `data.reason`.
 * The lean runner treats any verify signal other than `pass` as not done.
 * Never throws.
 */
export function createVerifyProvider(
	options: VerifyProviderOptions = {},
): SignalProvider {
	const runProcess = options.runProcess ?? runProviderProcess;
	return {
		kind: "verify",
		async run(ctx: SignalContext): Promise<Signal> {
			let commands: readonly VerifyCommand[];
			try {
				commands = options.commands ?? (await defaultCommands(ctx));
			} catch (error) {
				return unverifiedSignal(
					`could not load verification commands: ${messageOf(error)}`,
					[],
				);
			}
			if (commands.length === 0) {
				return unverifiedSignal("no verification commands found", []);
			}
			const deadline = Date.now() + ctx.budget.timeMs;
			const results: CommandResult[] = [];
			for (const command of commands) {
				results.push(await runCommand({ command, ctx, deadline, runProcess }));
			}
			return toSignal(results);
		},
	};
}

async function defaultCommands(ctx: SignalContext): Promise<VerifyCommand[]> {
	const config = await loadProjectConfig(ctx.worktree);
	const checks = config.qualityReview?.checks;
	if (checks !== undefined && checks.length > 0) {
		return checks.map((check) => fromQualityCheck(check, ctx.baseSha));
	}
	return packageScriptCommands(ctx.worktree);
}

function fromQualityCheck(
	check: QualityReviewCommand,
	baseSha: string,
): VerifyCommand {
	return {
		executable: check.command,
		args: check.args.map((arg) => (arg === BASE_PLACEHOLDER ? baseSha : arg)),
		...(check.timeoutMs === undefined ? {} : { timeoutMs: check.timeoutMs }),
	};
}

async function packageScriptCommands(
	worktree: string,
): Promise<VerifyCommand[]> {
	const scripts = await readScripts(worktree);
	return PACKAGE_SCRIPTS.filter((name) => name in scripts).map((name) => ({
		executable: "bun",
		args: ["run", name],
	}));
}

async function readScripts(worktree: string): Promise<Record<string, unknown>> {
	try {
		const manifest: unknown = JSON.parse(
			await readFile(join(worktree, "package.json"), "utf8"),
		);
		const scripts = isRecord(manifest) ? manifest.scripts : undefined;
		return isRecord(scripts) ? scripts : {};
	} catch {
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runCommand(options: RunCommandOptions): Promise<CommandResult> {
	const { command, ctx } = options;
	const label = [command.executable, ...command.args].join(" ");
	const remainingMs = options.deadline - Date.now();
	if (ctx.signal?.aborted || remainingMs <= 0) {
		return skipped(label, ctx.signal?.aborted ? "aborted" : "budget exhausted");
	}
	const started = Date.now();
	const outcome = await options.runProcess(
		{
			executablePath: command.executable,
			args: command.args,
			cwd: ctx.worktree,
		},
		ctx.signal,
		{ timeoutMs: Math.min(remainingMs, command.timeoutMs ?? remainingMs) },
	);
	return {
		command: label,
		exitCode: outcome.kind === "code-exit" ? outcome.code : null,
		outcome: outcome.kind,
		verdict: verdictOf(outcome),
		durationMs: Date.now() - started,
		outputTail: outputTail(outcome),
	};
}

function verdictOf(outcome: ProviderProcessOutcome): CommandVerdict {
	switch (outcome.kind) {
		case "code-exit":
			return outcome.code === 0 ? "passed" : "failed";
		case "signal-exit":
		case "timeout":
			return "failed";
		case "termination-error":
			return outcome.initiated.kind === "timeout" ? "failed" : "not-run";
		case "spawn-error":
		case "aborted":
			return "not-run";
	}
}

function skipped(command: string, reason: string): CommandResult {
	return {
		command,
		exitCode: null,
		outcome: "skipped",
		verdict: "not-run",
		durationMs: 0,
		outputTail: `not run: ${reason}`,
	};
}

function outputTail(outcome: ProviderProcessOutcome): string {
	const output = [outcome.stdout, outcome.stderr]
		.filter((stream) => stream.length > 0)
		.join("\n");
	return output.slice(-OUTPUT_TAIL_CHARS);
}

function toSignal(results: readonly CommandResult[]): Signal {
	const failed = results.filter((result) => result.verdict === "failed");
	if (failed.length > 0) {
		const names = failed.map(describeResult).join(", ");
		return verifySignal("fail", {
			summary: `${failed.length} of ${results.length} failed: ${names}`,
			data: { commands: results },
		});
	}
	const unrun = results.filter((result) => result.verdict === "not-run");
	if (unrun.length > 0) {
		const names = unrun.map(describeResult).join(", ");
		return unverifiedSignal(`could not run: ${names}`, results);
	}
	return verifySignal("pass", {
		summary: `${results.length} passed`,
		data: { commands: results },
	});
}

function describeResult(result: CommandResult): string {
	const detail =
		result.exitCode === null ? result.outcome : `exit ${result.exitCode}`;
	return `${result.command} (${detail})`;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function unverifiedSignal(
	reason: string,
	commands: readonly CommandResult[],
): Signal {
	return verifySignal("info", {
		summary: `unverified: ${reason}`,
		data: { commands, unverified: true, reason },
	});
}

function verifySignal(
	status: SignalStatus,
	body: { readonly summary: string; readonly data: VerifyData },
): Signal {
	return {
		kind: "verify",
		status,
		summary: body.summary,
		data: body.data,
		reenter: status === "fail",
	};
}
