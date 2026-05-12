import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { createClaudeCliInvocation } from "./claude-cli.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
	SystemPromptMode,
} from "./types.ts";

export interface RunClaudeBinaryOptions {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly readStdin?: () => Promise<string>;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnClaudeProcess;
	readonly materializeInvocation?: MaterializeClaudeInvocation;
}

export interface MaterializeClaudeInvocationOptions {
	readonly cwd: string;
	readonly stdin: string;
	readonly env: NodeJS.ProcessEnv;
	readonly allowApiBilling: boolean;
	readonly claudeBinary?: string;
	readonly promptMode?: SystemPromptMode;
}

export type MaterializeClaudeInvocation = (
	agentPackage: AgentPackage,
	options: MaterializeClaudeInvocationOptions,
) => Promise<MaterializedInvocation>;

export interface SpawnOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdio: ["pipe", "pipe", "pipe"];
}

export interface SpawnedClaudeProcess {
	readonly stdout: Readable;
	readonly stderr: Readable;
	readonly stdin: Writable;
	on(
		event: "close",
		listener: (code: number | null, signal: string | null) => void,
	): this;
	on(event: "error", listener: (error: Error) => void): this;
	on(event: string, listener: (...args: unknown[]) => void): this;
}

export type SpawnClaudeProcess = (
	command: string,
	args: readonly string[],
	options: SpawnOptions,
) => SpawnedClaudeProcess;

interface ParsedArgs {
	readonly allowApiBilling: boolean;
	readonly claudeBinary?: string;
	readonly promptMode?: SystemPromptMode;
	readonly promptArgs: readonly string[];
}

const USAGE =
	"Usage: <exported-agent> [--allow-api-billing] [--claude-binary <path>] [--prompt-mode append|replace] [prompt...]";

export async function runClaudeBinary(
	agentPackage: AgentPackage,
	options: RunClaudeBinaryOptions = {},
): Promise<void> {
	const stderr = options.stderr ?? process.stderr;
	const exit = options.exit ?? ((code: number) => process.exit(code));
	const parsed = parseArgs(options.argv ?? process.argv.slice(2));

	if (parsed instanceof Error) {
		stderr.write(`${parsed.message}\n${USAGE}\n`);
		exit(1);
		return;
	}

	const prompt = await resolvePrompt(parsed.promptArgs, options.readStdin);
	if (prompt.trim().length === 0) {
		stderr.write(`${USAGE}\n`);
		exit(1);
		return;
	}

	let materialized: MaterializedInvocation | undefined;
	try {
		materialized = await (
			options.materializeInvocation ?? createClaudeCliInvocation
		)(agentPackage, {
			allowApiBilling: parsed.allowApiBilling,
			cwd: (options.cwd ?? process.cwd)(),
			env: options.env ?? process.env,
			stdin: prompt,
			...(parsed.claudeBinary ? { claudeBinary: parsed.claudeBinary } : {}),
			...(parsed.promptMode ? { promptMode: parsed.promptMode } : {}),
		});

		for (const warning of materialized.spec.warnings) {
			stderr.write(`${warning.message}\n`);
		}

		const exitCode = await spawnClaude(materialized, {
			spawn: options.spawn ?? defaultSpawn,
			stdout: options.stdout ?? process.stdout,
			stderr,
		});
		exit(exitCode);
	} catch (error: unknown) {
		stderr.write(
			spawnDiagnostic(materialized?.spec.command ?? "claude", error),
		);
		exit(1);
	} finally {
		await materialized?.cleanup();
	}
}

function parseArgs(argv: readonly string[]): ParsedArgs | Error {
	let allowApiBilling = false;
	let claudeBinary: string | undefined;
	let promptMode: SystemPromptMode | undefined;
	const promptArgs: string[] = [];
	let parsingFlags = true;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) continue;
		if (!parsingFlags) {
			promptArgs.push(arg);
			continue;
		}
		if (arg === "--") {
			parsingFlags = false;
			continue;
		}
		if (arg === "--allow-api-billing") {
			allowApiBilling = true;
			continue;
		}
		if (arg === "--claude-binary") {
			const next = argv[index + 1];
			if (!next) return new Error("--claude-binary requires a path");
			claudeBinary = next;
			index += 1;
			continue;
		}
		if (arg === "--prompt-mode") {
			const next = argv[index + 1];
			if (next !== "append" && next !== "replace") {
				return new Error("--prompt-mode must be append or replace");
			}
			promptMode = next;
			index += 1;
			continue;
		}
		promptArgs.push(arg);
	}

	return {
		allowApiBilling,
		...(claudeBinary ? { claudeBinary } : {}),
		...(promptMode ? { promptMode } : {}),
		promptArgs,
	};
}

async function resolvePrompt(
	promptArgs: readonly string[],
	readStdin: (() => Promise<string>) | undefined,
): Promise<string> {
	if (promptArgs.length > 0) return promptArgs.join(" ");
	return (readStdin ?? readProcessStdin)();
}

async function readProcessStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
	}
	return Buffer.concat(chunks).toString("utf-8");
}

async function spawnClaude(
	materialized: MaterializedInvocation,
	options: {
		readonly spawn: SpawnClaudeProcess;
		readonly stdout: Writable;
		readonly stderr: Writable;
	},
): Promise<number> {
	const { spec } = materialized;
	const child = options.spawn(spec.command, spec.args, {
		cwd: spec.cwd,
		env: spec.env,
		stdio: ["pipe", "pipe", "pipe"],
	});

	child.stdout.pipe(options.stdout, { end: false });
	child.stderr.pipe(options.stderr, { end: false });
	child.stdin.end(spec.stdin);

	return waitForChild(child);
}

async function waitForChild(child: SpawnedClaudeProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});
}

function defaultSpawn(
	command: string,
	args: readonly string[],
	options: SpawnOptions,
): SpawnedClaudeProcess {
	return nodeSpawn(command, [...args], options);
}

function spawnDiagnostic(command: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `claude-cli runtime failed to spawn "${command}". likely fix: install Claude Code CLI or pass --claude-binary <path>. ${message}\n`;
}

export async function main(agentPackage: AgentPackage): Promise<void> {
	await runClaudeBinary(agentPackage);
}
