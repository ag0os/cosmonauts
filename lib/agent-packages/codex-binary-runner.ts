import type { Writable } from "node:stream";
import {
	type BinarySignalRuntime,
	resolveBinaryRuntime,
	runPackagedBinary,
	type SpawnBinaryProcess,
} from "./binary-runner.ts";
import { createCodexCliInvocation } from "./codex-cli.ts";
import type { AgentPackage, MaterializedInvocation } from "./types.ts";

export type { SpawnOptions } from "./binary-runner.ts";
export type SpawnCodexProcess = SpawnBinaryProcess;

interface RunCodexBinaryOptions {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnCodexProcess;
	readonly materializeInvocation?: MaterializeCodexInvocation;
	readonly signals?: BinarySignalRuntime;
}

interface MaterializeCodexInvocationOptions {
	readonly cwd: string;
	readonly codexArgs: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly codexBinary?: string;
}

type MaterializeCodexInvocation = (
	agentPackage: AgentPackage,
	options: MaterializeCodexInvocationOptions,
) => Promise<MaterializedInvocation>;

interface ParsedArgs {
	readonly kind: "run";
	readonly codexBinary?: string;
	readonly codexArgs: readonly string[];
}

interface ArgsState {
	codexBinary?: string;
	codexArgs: string[];
}

export async function runCodexBinary(
	agentPackage: AgentPackage,
	options: RunCodexBinaryOptions = {},
): Promise<void> {
	return runPackagedBinary({
		agentPackage,
		...resolveBinaryRuntime(options),
		defaultCommand: "codex",
		parseArgs,
		materialize: (pkg, parsed, context) =>
			(options.materializeInvocation ?? createCodexCliInvocation)(pkg, {
				...context,
				codexArgs: parsed.codexArgs,
				...(parsed.codexBinary ? { codexBinary: parsed.codexBinary } : {}),
			}),
		spawnDiagnostic,
	});
}

function parseArgs(argv: readonly string[]): ParsedArgs | Error {
	const state: ArgsState = { codexArgs: [] };
	for (let index = 0; index < argv.length; ) {
		const arg = argv[index];
		if (arg === undefined) {
			index += 1;
			continue;
		}
		if (arg === "--codex-binary") {
			const next = argv[index + 1];
			if (!next) return new Error("--codex-binary requires a path");
			state.codexBinary = next;
			index += 2;
			continue;
		}
		state.codexArgs.push(arg);
		index += 1;
	}
	return {
		kind: "run",
		...(state.codexBinary ? { codexBinary: state.codexBinary } : {}),
		codexArgs: state.codexArgs,
	};
}

function spawnDiagnostic(command: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `codex runtime failed to spawn "${command}". likely fix: install Codex CLI or pass --codex-binary <path>. ${message}\n`;
}
