import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { createClaudeCliInvocation } from "./claude-cli.ts";
import type {
	AgentPackage,
	MaterializedInvocation,
	SystemPromptMode,
} from "./types.ts";

interface RunClaudeBinaryOptions {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnClaudeProcess;
	readonly materializeInvocation?: MaterializeClaudeInvocation;
	readonly signals?: SignalRuntime;
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

export interface SpawnOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdio: "inherit";
}

interface SpawnedClaudeProcess {
	readonly stdout?: Readable | null;
	readonly stderr?: Readable | null;
	readonly stdin?: Writable | null;
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
	{
		kind: "value",
		flag: "--claude-binary",
		apply: applyClaudeBinary,
	},
	{
		kind: "value",
		flag: "--prompt-mode",
		apply: applyPromptMode,
	},
];
const FLAG_BY_NAME = new Map(FLAG_SPECS.map((flag) => [flag.flag, flag]));

type RuntimeSignal = "SIGINT" | "SIGTERM";

type SignalHandler = (signal: RuntimeSignal) => void | Promise<void>;

interface SignalRuntime {
	on(signal: RuntimeSignal, handler: SignalHandler): void;
	off(signal: RuntimeSignal, handler: SignalHandler): void;
	reemit(signal: RuntimeSignal): void;
}

const HANDLED_SIGNALS: readonly RuntimeSignal[] = ["SIGINT", "SIGTERM"];

export async function runClaudeBinary(
	agentPackage: AgentPackage,
	options: RunClaudeBinaryOptions = {},
): Promise<void> {
	const runtime = resolveRuntime(options);
	const input = await resolveRunInput(options, runtime);
	if (!input) return;

	let materialized: MaterializedInvocation | undefined;
	let cleanupPromise: Promise<void> | undefined;
	const cleanup = async () => {
		if (!materialized) return;
		cleanupPromise ??= materialized.cleanup();
		await cleanupPromise;
	};
	const uninstallSignals = installCleanupSignalHandlers(
		cleanup,
		options.signals ?? defaultSignalRuntime,
	);
	let result: RunMaterializedClaudeResult = { exitCode: 1 };

	try {
		result = await runMaterializedClaude(
			agentPackage,
			input,
			options,
			runtime,
			(invocation) => {
				materialized = invocation;
			},
		);
		materialized = result.materialized;
	} finally {
		uninstallSignals();
		await cleanup();
	}

	runtime.exit(result.exitCode);
}

interface RuntimeIO {
	readonly stdout: Writable;
	readonly stderr: Writable;
	readonly exit: (code: number) => void;
}

interface RunInput {
	readonly parsed: ParsedArgs;
}

interface RunMaterializedClaudeResult {
	readonly exitCode: number;
	readonly materialized?: MaterializedInvocation;
}

type MaterializedCallback = (materialized: MaterializedInvocation) => void;

function resolveRuntime(options: RunClaudeBinaryOptions): RuntimeIO {
	return {
		stdout: options.stdout ?? process.stdout,
		stderr: options.stderr ?? process.stderr,
		exit: options.exit ?? ((code: number) => process.exit(code)),
	};
}

async function resolveRunInput(
	options: RunClaudeBinaryOptions,
	runtime: RuntimeIO,
): Promise<RunInput | undefined> {
	const parsed = parseArgs(options.argv ?? process.argv.slice(2));

	if (parsed instanceof Error) {
		runtime.stderr.write(`${parsed.message}\n`);
		runtime.exit(1);
		return undefined;
	}

	return { parsed };
}

async function runMaterializedClaude(
	agentPackage: AgentPackage,
	input: RunInput,
	options: RunClaudeBinaryOptions,
	runtime: RuntimeIO,
	onMaterialized: MaterializedCallback,
): Promise<RunMaterializedClaudeResult> {
	let materialized: MaterializedInvocation | undefined;

	try {
		materialized = await materializeClaudeInvocation(
			agentPackage,
			input,
			options,
		);
		onMaterialized(materialized);
		writeWarnings(materialized, runtime.stderr);
		const exitCode = await spawnClaude(materialized, {
			spawn: options.spawn ?? defaultSpawn,
			stdout: runtime.stdout,
			stderr: runtime.stderr,
		});
		return { exitCode, materialized };
	} catch (error: unknown) {
		runtime.stderr.write(
			spawnDiagnostic(materialized?.spec.command ?? "claude", error),
		);
		return { exitCode: 1, ...(materialized ? { materialized } : {}) };
	}
}

async function materializeClaudeInvocation(
	agentPackage: AgentPackage,
	input: RunInput,
	options: RunClaudeBinaryOptions,
): Promise<MaterializedInvocation> {
	const parsed = input.parsed;
	return (options.materializeInvocation ?? createClaudeCliInvocation)(
		agentPackage,
		{
			allowApiBilling: parsed.allowApiBilling,
			cwd: (options.cwd ?? process.cwd)(),
			env: options.env ?? process.env,
			claudeArgs: parsed.promptArgs,
			...(parsed.claudeBinary ? { claudeBinary: parsed.claudeBinary } : {}),
			...(parsed.promptMode ? { promptMode: parsed.promptMode } : {}),
		},
	);
}

function writeWarnings(
	materialized: MaterializedInvocation,
	stderr: Writable,
): void {
	for (const warning of materialized.spec.warnings) {
		stderr.write(`${warning.message}\n`);
	}
}

function parseArgs(argv: readonly string[]): ParsedArgs | Error {
	const state: ArgsState = {
		allowApiBilling: false,
		claudeArgs: [],
	};

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

	return parsedArgsFromState(state);
}

function consumeFlagArg(
	arg: string,
	next: string | undefined,
	state: ArgsState,
): number | Error | undefined {
	const flag = FLAG_BY_NAME.get(arg);
	if (!flag) return undefined;

	const error = applyFlag(flag, state, next ?? "");
	if (error) return error;
	return flag.kind === "value" ? 2 : 1;
}

function applyFlag(
	flag: FlagSpec,
	state: ArgsState,
	next: string,
): Error | undefined {
	if (flag.kind === "boolean") {
		flag.apply(state);
		return undefined;
	}
	const result = flag.apply(state, next);
	return result instanceof Error ? result : undefined;
}

function parsedArgsFromState(state: ArgsState): ParsedArgs {
	return {
		kind: "run",
		allowApiBilling: state.allowApiBilling,
		...(state.claudeBinary ? { claudeBinary: state.claudeBinary } : {}),
		...(state.promptMode ? { promptMode: state.promptMode } : {}),
		promptArgs: state.claudeArgs,
	};
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

function installCleanupSignalHandlers(
	cleanup: () => Promise<void>,
	signals: SignalRuntime,
): () => void {
	const handlers = new Map<RuntimeSignal, SignalHandler>();

	for (const signal of HANDLED_SIGNALS) {
		const handler: SignalHandler = async () => {
			try {
				await cleanup();
			} finally {
				uninstall();
				signals.reemit(signal);
			}
		};
		handlers.set(signal, handler);
		signals.on(signal, handler);
	}

	function uninstall() {
		for (const [signal, handler] of handlers) {
			signals.off(signal, handler);
		}
		handlers.clear();
	}

	return uninstall;
}

const defaultSignalRuntime: SignalRuntime = {
	on(signal, handler) {
		process.on(signal, handler as NodeJS.SignalsListener);
	},
	off(signal, handler) {
		process.off(signal, handler as NodeJS.SignalsListener);
	},
	reemit(signal) {
		process.kill(process.pid, signal);
	},
};

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
		stdio: "inherit",
	});

	child.stdout?.pipe(options.stdout, { end: false });
	child.stderr?.pipe(options.stderr, { end: false });
	child.stdin?.end(spec.stdin);

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
