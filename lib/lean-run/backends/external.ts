import { spawn } from "node:child_process";
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
import type { AgentRegistry } from "../../agents/resolver.ts";
import type { DomainResolver } from "../../domains/resolver.ts";
import type {
	BackendRunInput,
	BuilderBackend,
	LeanBackendKind,
	LeanRole,
} from "../types.ts";
import { LEAN_DOMAIN } from "./pi.ts";

export type ExternalBackendKind = Exclude<LeanBackendKind, "pi">;

export interface ProcessRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: string;
	signal?: AbortSignal;
}

export interface ProcessOutcome {
	exitCode: number | null;
	stdout: string;
	stderr: string;
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

/** Packages a lean role's own persona and skills, resolved in the lean domain. */
export function leanPackageResolver(options: {
	kind: ExternalBackendKind;
	registry: AgentRegistry;
	domainsDir?: string;
	resolver?: DomainResolver;
	projectSkills?: readonly string[];
	skillPaths: readonly string[];
}): (role: LeanRole) => Promise<AgentPackage> {
	const target = PACKAGE_TARGETS[options.kind];
	return (role) =>
		buildAgentPackage({
			definition: definitionFromAgent(
				options.registry.resolve(role, LEAN_DOMAIN),
				target,
			),
			target,
			agentRegistry: options.registry,
			domainContext: LEAN_DOMAIN,
			...(options.domainsDir ? { domainsDir: options.domainsDir } : {}),
			...(options.resolver ? { resolver: options.resolver } : {}),
			...(options.projectSkills
				? { projectSkills: options.projectSkills }
				: {}),
			skillPaths: options.skillPaths,
		});
}

const DEFAULT_EXTRA_ARGS = {
	"claude-cli": ["--dangerously-skip-permissions"],
	"codex-cli": [],
} as const satisfies Record<ExternalBackendKind, readonly string[]>;

const CODEX_LAST_MESSAGE = "last-message.txt";

/**
 * Runs a lean role through Claude Code or Codex using the agent-package
 * invocation builders, sending the prompt on stdin and returning the final
 * text. These harnesses report no token stats.
 */
export function createExternalBuilderBackend(
	options: ExternalBuilderBackendOptions,
): BuilderBackend {
	const runProcess = options.runProcess ?? runChildProcess;
	return {
		kind: options.kind,
		async run(input) {
			const agentPackage = await options.resolvePackage(input.role);
			const invocation = await materialize(options, agentPackage, input);
			try {
				const args =
					options.kind === "codex-cli"
						? [...invocation.spec.args, ...codexOutputArgs(invocation)]
						: invocation.spec.args;
				const outcome = await runProcess({
					command: invocation.spec.command,
					args,
					cwd: invocation.spec.cwd,
					env: invocation.spec.env,
					stdin: input.prompt,
					...(input.signal ? { signal: input.signal } : {}),
				});
				if (outcome.exitCode !== 0)
					throw new Error(
						`${options.kind} exited ${outcome.exitCode}: ${outcome.stderr.slice(-2000)}`,
					);
				return { text: await finalText(options.kind, invocation, outcome) };
			} finally {
				await invocation.cleanup();
			}
		},
	};
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

function codexOutputArgs(invocation: MaterializedInvocation): string[] {
	return [
		"--output-last-message",
		join(invocation.tempDir, CODEX_LAST_MESSAGE),
		"-",
	];
}

async function finalText(
	kind: ExternalBackendKind,
	invocation: MaterializedInvocation,
	outcome: ProcessOutcome,
): Promise<string> {
	if (kind === "claude-cli") return outcome.stdout;
	return readFile(join(invocation.tempDir, CODEX_LAST_MESSAGE), "utf-8").catch(
		() => outcome.stdout,
	);
}

const runChildProcess: ProcessRunner = (request) =>
	new Promise((resolve, reject) => {
		const child = spawn(request.command, [...request.args], {
			cwd: request.cwd,
			env: request.env,
			stdio: ["pipe", "pipe", "pipe"],
			...(request.signal ? { signal: request.signal } : {}),
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.stdin.on("error", reject);
		child.on("close", (exitCode) =>
			resolve({
				exitCode,
				stdout: Buffer.concat(stdout).toString("utf-8"),
				stderr: Buffer.concat(stderr).toString("utf-8"),
			}),
		);
		child.stdin.end(request.stdin);
	});
