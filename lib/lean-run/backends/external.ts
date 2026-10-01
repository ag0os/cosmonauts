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
import type {
	BackendPermissions,
	BackendRunInput,
	BuilderBackend,
	LeanBackendKind,
	LeanRole,
	StageProcessExit,
} from "../types.ts";
import {
	claudeResult,
	codexStats,
	type HarnessResult,
} from "./harness-usage.ts";
import { LEAN_DOMAIN } from "./pi.ts";

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
}

export interface ProcessOutcome {
	/** Null when the child ended by a signal, was stopped, or never started. */
	exitCode: number | null;
	stdout: string;
	/** The default runner returns only the last `STDERR_TAIL_BYTES`, plus its notes. */
	stderr: string;
	/** How the child's process tree ended; absent from a runner that cannot tell. */
	process?: StageProcessExit;
}

export type ProcessRunner = (
	request: ProcessRequest,
) => Promise<ProcessOutcome>;

export interface ExternalBuilderBackendOptions {
	kind: ExternalBackendKind;
	/** The assembled persona for a role, e.g. from `buildAgentPackage`. */
	resolvePackage(role: LeanRole): Promise<AgentPackage>;
	binary?: string;
	/** Defaults: claude `--dangerously-skip-permissions` (tools stay limited by `--tools`); codex none (sandbox comes from the package). */
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
 * so a builder keeps it: `--tools` still limits what it can call, and the run
 * gives it a worktree of its own instead of the caller's.
 */
const DEFAULT_EXTRA_ARGS = {
	"claude-cli": ["--dangerously-skip-permissions"],
	"codex-cli": [],
} as const satisfies Record<ExternalBackendKind, readonly string[]>;

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
	return {
		kind: options.kind,
		permissions: externalPermissions(options),
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
				const outcome = await runProcess({
					command: invocation.spec.command,
					args,
					cwd: invocation.spec.cwd,
					env: invocation.spec.env,
					stdin: input.prompt,
					...(input.signal ? { signal: input.signal } : {}),
					output: spoolPaths(input, invocation),
				});
				if (outcome.process) input.processLog?.report(outcome.process);
				if (outcome.exitCode !== 0)
					throw new Error(
						`${options.kind} exited ${outcome.exitCode}: ${outcome.stderr.slice(-STDERR_TAIL_BYTES)}`,
					);
				return await finalResult({
					kind: options.kind,
					invocation,
					outcome,
					durationMs: Date.now() - started,
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
	return createCodexCliInvocation(agentPackage, {
		...shared,
		codexArgs: ["exec", ...extraArgs],
		...(options.binary ? { codexBinary: options.binary } : {}),
	});
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

/** Claude's result object, or Codex's last-message file (stdout when it is missing) with the JSONL events' usage. */
async function finalResult(options: {
	kind: ExternalBackendKind;
	invocation: MaterializedInvocation;
	outcome: ProcessOutcome;
	durationMs: number;
}): Promise<HarnessResult> {
	const { stdout } = options.outcome;
	if (options.kind === "claude-cli") return claudeResult(stdout);
	const lastMessage = join(options.invocation.tempDir, CODEX_LAST_MESSAGE);
	const text = await readFile(lastMessage, "utf-8").catch(() => stdout);
	const stats = codexStats(stdout, options.durationMs);
	return stats ? { text, stats } : { text };
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
 * whole tree is ended before this resolves.
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
