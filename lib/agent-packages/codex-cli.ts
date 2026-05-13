import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolSet } from "../agents/types.ts";
import type { AgentPackage, MaterializedInvocation } from "./types.ts";

interface CreateCodexCliInvocationOptions {
	readonly cwd: string;
	readonly codexArgs?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly codexBinary?: string;
}

type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

interface SanitizedCodexArgs {
	readonly args: readonly string[];
	readonly requestedSandbox?: CodexSandboxMode;
}

const CONFIG_AFTER_SUBCOMMANDS = new Set([
	"e",
	"exec",
	"fork",
	"resume",
	"review",
]);

const MAX_SANDBOX_BY_TOOL_SET = {
	coding: "workspace-write",
	readonly: "read-only",
	verification: "read-only",
	none: "read-only",
} as const satisfies Record<AgentToolSet, CodexSandboxMode>;

const SANDBOX_RANK = {
	"read-only": 0,
	"workspace-write": 1,
	"danger-full-access": 2,
} as const satisfies Record<CodexSandboxMode, number>;

const PROTECTED_CONFIG_KEYS = new Set([
	"default_permissions",
	"model_instructions_file",
	"permission_profile",
	"sandbox_mode",
]);

export async function createCodexCliInvocation(
	agentPackage: AgentPackage,
	options: CreateCodexCliInvocationOptions,
): Promise<MaterializedInvocation> {
	const tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-codex-cli-"));
	const systemPromptPath = join(tempDir, "system.md");
	await writeFile(systemPromptPath, agentPackage.systemPrompt, "utf-8");

	return {
		tempDir,
		spec: {
			command: options.codexBinary ?? "codex",
			args: codexArgsWithPackagePolicy({
				systemPromptPath,
				codexArgs: options.codexArgs ?? [],
				tools: agentPackage.tools,
			}),
			env: { ...(options.env ?? process.env) },
			cwd: options.cwd,
			stdin: "",
			warnings: [],
		},
		async cleanup() {
			await rm(tempDir, { recursive: true, force: true });
		},
	};
}

function codexArgsWithPackagePolicy(options: {
	readonly systemPromptPath: string;
	readonly codexArgs: readonly string[];
	readonly tools: AgentToolSet;
}): readonly string[] {
	const [firstArg, ...restArgs] = options.codexArgs;
	const hasSubcommand = firstArg && CONFIG_AFTER_SUBCOMMANDS.has(firstArg);
	const argsToSanitize = hasSubcommand ? restArgs : options.codexArgs;
	const sanitized = sanitizeCodexArgs(argsToSanitize);
	const packageArgs = packagePolicyArgs({
		systemPromptPath: options.systemPromptPath,
		tools: options.tools,
		requestedSandbox: sanitized.requestedSandbox,
	});

	if (hasSubcommand) {
		return [firstArg, ...packageArgs, ...sanitized.args];
	}
	return [...packageArgs, ...sanitized.args];
}

function packagePolicyArgs(options: {
	readonly systemPromptPath: string;
	readonly tools: AgentToolSet;
	readonly requestedSandbox?: CodexSandboxMode;
}): readonly string[] {
	return [
		"-c",
		`model_instructions_file=${JSON.stringify(options.systemPromptPath)}`,
		"--sandbox",
		resolveSandboxMode(options.tools, options.requestedSandbox),
	];
}

function resolveSandboxMode(
	tools: AgentToolSet,
	requestedSandbox: CodexSandboxMode | undefined,
): CodexSandboxMode {
	const maxSandbox = MAX_SANDBOX_BY_TOOL_SET[tools];
	if (!requestedSandbox) return maxSandbox;
	return SANDBOX_RANK[requestedSandbox] < SANDBOX_RANK[maxSandbox]
		? requestedSandbox
		: maxSandbox;
}

function sanitizeCodexArgs(args: readonly string[]): SanitizedCodexArgs {
	const sanitized: string[] = [];
	let requestedSandbox: CodexSandboxMode | undefined;

	for (let index = 0; index < args.length; ) {
		const arg = args[index];
		if (arg === undefined) {
			index += 1;
			continue;
		}
		if (arg === "--") {
			sanitized.push(...args.slice(index));
			break;
		}

		const sandboxFlag = consumeSandboxFlag(arg, args[index + 1]);
		if (sandboxFlag) {
			requestedSandbox = sandboxFlag.value;
			index += sandboxFlag.consumed;
			continue;
		}

		const configFlag = consumeConfigFlag(arg, args[index + 1]);
		if (configFlag) {
			if (!isProtectedConfigOverride(configFlag.value)) {
				sanitized.push(...args.slice(index, index + configFlag.consumed));
			}
			index += configFlag.consumed;
			continue;
		}

		if (isSandboxBypassFlag(arg)) {
			requestedSandbox = "danger-full-access";
			index += 1;
			continue;
		}
		if (arg === "--full-auto") {
			requestedSandbox = "workspace-write";
			index += 1;
			continue;
		}

		sanitized.push(arg);
		index += 1;
	}

	return { args: sanitized, ...(requestedSandbox ? { requestedSandbox } : {}) };
}

function consumeSandboxFlag(
	arg: string,
	next: string | undefined,
): { readonly consumed: number; readonly value: CodexSandboxMode } | undefined {
	if (arg === "--sandbox" || arg === "-s") {
		return { consumed: 2, value: parseSandboxMode(next) };
	}
	if (arg.startsWith("--sandbox=")) {
		return { consumed: 1, value: parseSandboxMode(arg.slice(10)) };
	}
	if (arg.startsWith("-s=")) {
		return { consumed: 1, value: parseSandboxMode(arg.slice(3)) };
	}
	return undefined;
}

function consumeConfigFlag(
	arg: string,
	next: string | undefined,
): { readonly consumed: number; readonly value: string } | undefined {
	if (arg === "--config" || arg === "-c") {
		return { consumed: next === undefined ? 1 : 2, value: next ?? "" };
	}
	if (arg.startsWith("--config=")) {
		return { consumed: 1, value: arg.slice(9) };
	}
	if (arg.startsWith("-c=")) {
		return { consumed: 1, value: arg.slice(3) };
	}
	return undefined;
}

function parseSandboxMode(value: string | undefined): CodexSandboxMode {
	if (
		value === "read-only" ||
		value === "workspace-write" ||
		value === "danger-full-access"
	) {
		return value;
	}
	throw new Error(
		'Codex --sandbox must be "read-only", "workspace-write", or "danger-full-access"',
	);
}

function isSandboxBypassFlag(arg: string): boolean {
	return (
		arg === "--dangerously-bypass-approvals-and-sandbox" || arg === "--yolo"
	);
}

function isProtectedConfigOverride(value: string): boolean {
	const key = value.split("=", 1)[0];
	return PROTECTED_CONFIG_KEYS.has(key ?? "");
}
