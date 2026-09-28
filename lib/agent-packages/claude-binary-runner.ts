import type { Writable } from "node:stream";
import {
	type BinarySignalRuntime,
	resolveBinaryRuntime,
	runPackagedBinary,
	type SpawnBinaryProcess,
} from "./binary-runner.ts";
import { createClaudeCliInvocation } from "./claude-cli.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
	SystemPromptMode,
} from "./types.ts";

export type { SpawnOptions } from "./binary-runner.ts";
export type SpawnClaudeProcess = SpawnBinaryProcess;

interface RunClaudeBinaryOptions {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnClaudeProcess;
	readonly materializeInvocation?: MaterializeClaudeInvocation;
	readonly signals?: BinarySignalRuntime;
}

interface MaterializeClaudeInvocationOptions {
	readonly cwd: string;
	readonly claudeArgs: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly allowApiBilling: boolean;
	readonly claudeBinary?: string;
	readonly promptMode?: SystemPromptMode;
}

type MaterializeClaudeInvocation = (
	agentPackage: AgentPackage,
	options: MaterializeClaudeInvocationOptions,
) => Promise<MaterializedInvocation>;

interface ParsedArgs {
	readonly kind: "run";
	readonly allowApiBilling: boolean;
	readonly claudeBinary?: string;
	readonly promptMode?: SystemPromptMode;
	readonly promptArgs: readonly string[];
}

interface ArgsState {
	allowApiBilling: boolean;
	claudeBinary?: string;
	promptMode?: SystemPromptMode;
	claudeArgs: string[];
}

type FlagSpec =
	| {
			readonly kind: "boolean";
			readonly flag: string;
			readonly apply: (state: ArgsState) => void;
	  }
	| {
			readonly kind: "value";
			readonly flag: string;
			readonly apply: (state: ArgsState, next: string) => Error | undefined;
	  };

const FLAG_SPECS: readonly FlagSpec[] = [
	{
		kind: "boolean",
		flag: "--allow-api-billing",
		apply: (state) => {
			state.allowApiBilling = true;
		},
	},
	{ kind: "value", flag: "--claude-binary", apply: applyClaudeBinary },
	{ kind: "value", flag: "--prompt-mode", apply: applyPromptMode },
];
const FLAG_BY_NAME = new Map(FLAG_SPECS.map((flag) => [flag.flag, flag]));

export async function runClaudeBinary(
	agentPackage: AgentPackage,
	options: RunClaudeBinaryOptions = {},
): Promise<void> {
	return runPackagedBinary({
		agentPackage,
		...resolveBinaryRuntime(options),
		defaultCommand: "claude",
		parseArgs,
		materialize: (pkg, parsed, context) =>
			(options.materializeInvocation ?? createClaudeCliInvocation)(pkg, {
				...context,
				allowApiBilling: parsed.allowApiBilling,
				claudeArgs: parsed.promptArgs,
				...(parsed.claudeBinary ? { claudeBinary: parsed.claudeBinary } : {}),
				...(parsed.promptMode ? { promptMode: parsed.promptMode } : {}),
			}),
		spawnDiagnostic,
	});
}

function parseArgs(argv: readonly string[]): ParsedArgs | Error {
	const state: ArgsState = { allowApiBilling: false, claudeArgs: [] };
	for (let index = 0; index < argv.length; ) {
		const arg = argv[index];
		if (arg === undefined) {
			index += 1;
			continue;
		}
		const consumed = consumeFlagArg(arg, argv[index + 1], state);
		if (consumed instanceof Error) return consumed;
		if (consumed) {
			index += consumed;
			continue;
		}
		state.claudeArgs.push(arg);
		index += 1;
	}
	return {
		kind: "run",
		allowApiBilling: state.allowApiBilling,
		...(state.claudeBinary ? { claudeBinary: state.claudeBinary } : {}),
		...(state.promptMode ? { promptMode: state.promptMode } : {}),
		promptArgs: state.claudeArgs,
	};
}

function consumeFlagArg(
	arg: string,
	next: string | undefined,
	state: ArgsState,
): number | Error | undefined {
	const flag = FLAG_BY_NAME.get(arg);
	if (!flag) return undefined;
	if (flag.kind === "boolean") {
		flag.apply(state);
		return 1;
	}
	const error = flag.apply(state, next ?? "");
	return error ?? 2;
}

function applyClaudeBinary(state: ArgsState, next: string): Error | undefined {
	if (!next) return new Error("--claude-binary requires a path");
	state.claudeBinary = next;
	return undefined;
}

function applyPromptMode(state: ArgsState, next: string): Error | undefined {
	if (next !== "append" && next !== "replace") {
		return new Error("--prompt-mode must be append or replace");
	}
	state.promptMode = next;
	return undefined;
}

function spawnDiagnostic(command: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `claude-cli runtime failed to spawn "${command}". likely fix: install Claude Code CLI or pass --claude-binary <path>. ${message}\n`;
}
