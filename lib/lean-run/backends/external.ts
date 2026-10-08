import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAgentPackage } from "../../agent-packages/build.ts";
import { createClaudeCliInvocation } from "../../agent-packages/claude-cli.ts";
import { createCodexCliInvocation } from "../../agent-packages/codex-cli.ts";
import { definitionFromAgent } from "../../agent-packages/definition.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
} from "../../agent-packages/types.ts";
import { AgentRegistry } from "../../agents/resolver.ts";
import type { AgentDefinition } from "../../agents/types.ts";
import type { DomainResolver } from "../../domains/resolver.ts";
import {
	type ChildRunOutcome,
	type ChildTree,
	readSpool,
	runChild,
} from "../../process/run-child.ts";
import { CLAUDE_DENIED_TOOLS } from "../git-verbs.ts";
import {
	type BackendPermissions,
	type BackendRunInput,
	type BuilderBackend,
	LEAN_DOMAIN,
	type LeanBackendKind,
	type LeanRole,
	type StageProcessExit,
} from "../types.ts";
import { harnessModel } from "./harness-model.ts";
import {
	CodexUsageTap,
	claudeResult,
	codexLastMessage,
	type HarnessResult,
} from "./harness-usage.ts";

export type ExternalBackendKind = Exclude<LeanBackendKind, "pi">;

export interface ProcessRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: string;
	signal?: AbortSignal;
	/** Where the child's stdout and stderr are spooled. */
	output: { stdout: string; stderr: string };
	/**
	 * Every stdout chunk as it arrives, before any output cap. A runner that
	 * calls it reports `stdoutBytes`; one that does not leaves usage to be
	 * read from the `stdout` it returns.
	 */
	onStdout?: (chunk: Buffer) => void;
}

export interface ProcessOutcome {
	/** Null when the child ended by a signal, was stopped, or never started. */
	exitCode: number | null;
	stdout: string;
	/** The default runner returns only the last `STDERR_TAIL_BYTES`, plus its notes. */
	stderr: string;
	/** How the child's process tree ended; absent from a runner that cannot tell. */
	process?: StageProcessExit;
	/** Every byte the child wrote to stdout, kept or not, from a runner that streams to `onStdout`. */
	stdoutBytes?: number;
}

export type ProcessRunner = (
	request: ProcessRequest,
) => Promise<ProcessOutcome>;

export interface ExternalBuilderBackendOptions {
	kind: ExternalBackendKind;
	/** The assembled persona for a role, e.g. from `buildAgentPackage`. */
	resolvePackage(role: LeanRole): Promise<AgentPackage>;
	binary?: string;
	/**
	 * Defaults: claude `--dangerously-skip-permissions` (tools stay limited by
	 * `--tools`) with `--disallowedTools` and `CLAUDE_DENIED_TOOLS`; codex none
	 * (sandbox comes from the package). Custom arguments replace the deny list too.
	 * Codex also gets the role's `openai-codex/` model and reasoning effort
	 * unless these arguments set them or pick the model through a profile or
	 * another provider (`harnessModel`).
	 */
	extraArgs?: readonly string[];
	env?: NodeJS.ProcessEnv;
	runProcess?: ProcessRunner;
}

const PACKAGE_TARGETS = {
	"claude-cli": "claude-cli",
	"codex-cli": "codex",
} as const satisfies Record<ExternalBackendKind, string>;

/**
 * Packages a lean role's own persona and skills, resolved in the lean domain.
 * Pi extensions (the builder's post-edit health hook, the role guard) and
 * subagents cannot run in an external harness, and the packager refuses an
 * agent that declares them, so the role is packaged without them; the run
 * manifest records that the health hook did not run (brief 4.7A).
 */
export function leanPackageResolver(options: {
	kind: ExternalBackendKind;
	registry: AgentRegistry;
	domainsDir?: string;
	resolver?: DomainResolver;
	projectSkills?: readonly string[];
	skillPaths: readonly string[];
}): (role: LeanRole) => Promise<AgentPackage> {
	const target = PACKAGE_TARGETS[options.kind];
	return (role) => {
		const agent = withoutPiOnlyParts(
			options.registry.resolve(role, LEAN_DOMAIN),
		);
		return buildAgentPackage({
			definition: definitionFromAgent(agent, target),
			target,
			agentRegistry: new AgentRegistry([agent]),
			domainContext: LEAN_DOMAIN,
			...(options.domainsDir ? { domainsDir: options.domainsDir } : {}),
			...(options.resolver ? { resolver: options.resolver } : {}),
			...(options.projectSkills
				? { projectSkills: options.projectSkills }
				: {}),
			skillPaths: options.skillPaths,
		});
	};
}

function withoutPiOnlyParts(agent: AgentDefinition): AgentDefinition {
	return { ...agent, extensions: [], subagents: [] };
}

/**
 * `claude -p` cannot approve an edit without `--dangerously-skip-permissions`,
 * so a builder keeps it: `--tools` still limits what it can call,
 * `--disallowedTools` denies git history and ref writers, and the run gives
 * it a private clone with no remote instead of the caller's checkout. The
 * deny list is variadic, so `-p` must follow it.
 */
const DEFAULT_EXTRA_ARGS = {
	"claude-cli": [
		"--dangerously-skip-permissions",
		"--disallowedTools",
		...CLAUDE_DENIED_TOOLS,
	],
	"codex-cli": [],
} as const satisfies Record<ExternalBackendKind, readonly string[]>;

/** The default arguments' deny list; custom `extraArgs` carry their own. */
function deniedTools(
	options: ExternalBuilderBackendOptions,
): readonly string[] | undefined {
	if (options.kind !== "claude-cli" || options.extraArgs !== undefined)
		return undefined;
	return CLAUDE_DENIED_TOOLS;
}

/** Claude's and Codex's flags that run every tool call unprompted. */
const SKIP_FLAGS: ReadonlySet<string> = new Set([
	"--dangerously-skip-permissions",
	"--permission-mode=bypassPermissions",
	"--dangerously-bypass-approvals-and-sandbox",
]);

function externalPermissions(
	options: ExternalBuilderBackendOptions,
): BackendPermissions {
	const args: readonly string[] =
		options.extraArgs ?? DEFAULT_EXTRA_ARGS[options.kind];
	if (skipsPermissions(args)) return "skipped";
	if (options.kind === "codex-cli" && options.extraArgs === undefined)
		return "sandbox";
	return "harness";
}

function skipsPermissions(args: readonly string[]): boolean {
	return args.some(
		(arg, index) =>
			SKIP_FLAGS.has(arg) ||
			(arg === "--permission-mode" && args[index + 1] === "bypassPermissions"),
	);
}

const CODEX_LAST_MESSAGE = "last-message.txt";
const STDERR_TAIL_BYTES = 2_000;

/**
 * Runs a lean role through Claude Code or Codex using the agent-package
 * invocation builders, sending the prompt on stdin. Each harness runs in its
 * JSON output mode (`claude --output-format json`, `codex exec --json`), so
 * the result carries the session's token usage as `stats` next to the final
 * text; output that does not parse is plain text with no stats.
 */
export function createExternalBuilderBackend(
	options: ExternalBuilderBackendOptions,
): BuilderBackend {
	const runProcess = options.runProcess ?? runChildProcess;
	const denied = deniedTools(options);
	return {
		kind: options.kind,
		permissions: externalPermissions(options),
		...(denied ? { deniedTools: denied } : {}),
		async requestedModel(role) {
			const agentPackage = await options.resolvePackage(role);
			return harnessModel(modelOptions(options, agentPackage)).requested;
		},
		async run(input) {
			const resolved = await options.resolvePackage(input.role);
			const agentPackage = input.readonly ? readOnly(resolved) : resolved;
			const invocation = await materialize(options, agentPackage, input);
			try {
				const args = [
					...invocation.spec.args,
					...outputArgs(options.kind, invocation),
				];
				const started = Date.now();
				const tap =
					options.kind === "codex-cli" ? new CodexUsageTap() : undefined;
				const outcome = await runProcess({
					command: invocation.spec.command,
					args,
					cwd: invocation.spec.cwd,
					env: invocation.spec.env,
					stdin: input.prompt,
					...(input.signal ? { signal: input.signal } : {}),
					output: spoolPaths(input, invocation),
					...(tap ? { onStdout: (chunk: Buffer) => tap.push(chunk) } : {}),
				});
				if (outcome.process) input.processLog?.report(outcome.process);
				if (outcome.exitCode !== 0)
					throw new Error(
						`${options.kind} exited ${outcome.exitCode}: ${outcome.stderr.slice(-STDERR_TAIL_BYTES)}`,
					);
				return await finalResult({
					invocation,
					outcome,
					durationMs: Date.now() - started,
					...(tap ? { tap } : {}),
				});
			} finally {
				await invocation.cleanup();
			}
		},
	};
}

/**
 * The readonly tool set, with any package-level `allowedTools` dropped: the
 * Claude invocation prefers that list over the tool set, so keeping it could
 * re-enable editing in an envelope repair turn.
 */
function readOnly(agentPackage: AgentPackage): AgentPackage {
	const { allowedTools: _dropped, ...targetOptions } =
		agentPackage.targetOptions;
	return { ...agentPackage, tools: "readonly", targetOptions };
}

function materialize(
	options: ExternalBuilderBackendOptions,
	agentPackage: AgentPackage,
	input: BackendRunInput,
): Promise<MaterializedInvocation> {
	const extraArgs = options.extraArgs ?? DEFAULT_EXTRA_ARGS[options.kind];
	const shared = {
		cwd: input.worktree,
		...(options.env ? { env: options.env } : {}),
	};
	if (options.kind === "claude-cli")
		return createClaudeCliInvocation(agentPackage, {
			...shared,
			claudeArgs: [...extraArgs, "-p"],
			...(options.binary ? { claudeBinary: options.binary } : {}),
		});
	const model = harnessModel(modelOptions(options, agentPackage));
	// The caller's arguments come after ours: codex `-c` is last-wins, so a
	// caller effort the detector misses still overrides the one we add.
	return createCodexCliInvocation(agentPackage, {
		...shared,
		codexArgs: ["exec", ...model.args, ...extraArgs],
		...(options.binary ? { codexBinary: options.binary } : {}),
	});
}

function modelOptions(
	options: ExternalBuilderBackendOptions,
	agentPackage: AgentPackage,
): Parameters<typeof harnessModel>[0] {
	return {
		kind: options.kind,
		agentPackage,
		extraArgs: options.extraArgs ?? DEFAULT_EXTRA_ARGS[options.kind],
	};
}

/** JSON output, so the session's usage can be read; Codex also writes its final message to a file. */
function outputArgs(
	kind: ExternalBackendKind,
	invocation: MaterializedInvocation,
): string[] {
	if (kind === "claude-cli") return ["--output-format", "json"];
	return [
		"--json",
		"--output-last-message",
		join(invocation.tempDir, CODEX_LAST_MESSAGE),
		"-",
	];
}

/**
 * Claude's result object, or Codex's last-message file with the usage its
 * tap counted from the JSONL events. When the file is missing, Codex's text
 * is its last `agent_message` event, then stdout.
 */
async function finalResult(options: {
	invocation: MaterializedInvocation;
	outcome: ProcessOutcome;
	durationMs: number;
	/** Codex only. */
	tap?: CodexUsageTap;
}): Promise<HarnessResult> {
	const { outcome, tap } = options;
	const { stdout } = outcome;
	if (tap === undefined) return claudeResult(stdout, spoolCut(outcome));
	const lastMessage = join(options.invocation.tempDir, CODEX_LAST_MESSAGE);
	const text = await readFile(lastMessage, "utf-8").catch(
		() => codexLastMessage(stdout) ?? stdout,
	);
	const stats = tap.finish({
		durationMs: options.durationMs,
		...optionalCut(tapCut(tap, outcome)),
	});
	return stats ? { text, stats } : { text };
}

/**
 * Why the tap did not see all of stdout. A runner that never streamed to it
 * hands over the text it kept instead, which is whole unless it passed the
 * output cap.
 */
function tapCut(
	tap: CodexUsageTap,
	outcome: ProcessOutcome,
): string | undefined {
	if (tap.observedBytes === 0 && outcome.stdoutBytes === undefined) {
		tap.push(Buffer.from(outcome.stdout));
		return spoolCut(outcome);
	}
	const written = outcome.stdoutBytes;
	if (written === undefined || written <= tap.observedBytes) return undefined;
	return `${written - tap.observedBytes} of ${written} stdout bytes were not observed`;
}

function spoolCut(outcome: ProcessOutcome): string | undefined {
	return outcome.process?.truncated?.includes("stdout")
		? "stdout passed the output cap before its usage was read"
		: undefined;
}

function optionalCut(cut: string | undefined): { cut?: string } {
	return cut === undefined ? {} : { cut };
}

/** The run's log files when the host gave them, else files in the invocation's temp dir. */
function spoolPaths(
	input: BackendRunInput,
	invocation: MaterializedInvocation,
): ProcessRequest["output"] {
	if (input.processLog)
		return {
			stdout: input.processLog.stdout,
			stderr: input.processLog.stderr,
		};
	return {
		stdout: join(invocation.tempDir, "stdout.log"),
		stderr: join(invocation.tempDir, "stderr.log"),
	};
}

/**
 * The harness runs through the shared child runner: its own process group,
 * output spooled under a byte cap, and on an abort or the time budget the
 * process tree it can find is ended before this resolves; the
 * `StageProcessExit` it reports says how that went.
 */
const runChildProcess: ProcessRunner = async (request) => {
	const outcome = await runChild({
		command: request.command,
		args: request.args,
		cwd: request.cwd,
		env: request.env,
		stdin: request.stdin,
		output: request.output,
		...(request.signal ? { signal: request.signal } : {}),
		...(request.onStdout ? { onStdout: request.onStdout } : {}),
	});
	const [stdout, stderr] = await Promise.all([
		readSpool(outcome.stdout),
		readSpool(outcome.stderr, STDERR_TAIL_BYTES),
	]);
	return {
		exitCode: exitCodeOf(outcome),
		stdout,
		stderr: [stderr, ...outcome.notes, spawnFailure(outcome)]
			.filter((part) => part !== "")
			.join("\n"),
		process: processExit(outcome),
		stdoutBytes: outcome.stdout.bytes,
	};
};

function exitCodeOf(outcome: ChildRunOutcome): number | null {
	if (outcome.stopped !== undefined) return null;
	return outcome.exit.kind === "code" ? outcome.exit.code : null;
}

function spawnFailure(outcome: ChildRunOutcome): string {
	return outcome.exit.kind === "spawn-error"
		? `could not start: ${outcome.exit.error.message}`
		: "";
}

function processExit(outcome: ChildRunOutcome): StageProcessExit {
	const truncated = (["stdout", "stderr"] as const).filter(
		(stream) => outcome[stream].truncated,
	);
	return {
		...treeState(outcome.tree),
		...(truncated.length > 0 ? { truncated } : {}),
	};
}

function treeState(tree: ChildTree): Pick<StageProcessExit, "tree" | "detail"> {
	if (tree.kind === "gone") return { tree: "gone" };
	return { tree: tree.kind, detail: tree.reason };
}
