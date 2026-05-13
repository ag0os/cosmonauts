import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { createCodexCliInvocation } from "./codex-cli.ts";
import type { AgentPackage, MaterializedInvocation } from "./types.ts";

interface RunCodexBinaryOptions {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnCodexProcess;
	readonly materializeInvocation?: MaterializeCodexInvocation;
	readonly signals?: SignalRuntime;
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

export interface SpawnOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdio: "inherit";
}

interface SpawnedCodexProcess {
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

export type SpawnCodexProcess = (
	command: string,
	args: readonly string[],
	options: SpawnOptions,
) => SpawnedCodexProcess;

interface ParsedArgs {
	readonly kind: "run";
	readonly codexBinary?: string;
	readonly codexArgs: readonly string[];
}

interface ArgsState {
	codexBinary?: string;
	codexArgs: string[];
}

type RuntimeSignal = "SIGINT" | "SIGTERM";

type SignalHandler = (signal: RuntimeSignal) => void | Promise<void>;

interface SignalRuntime {
	on(signal: RuntimeSignal, handler: SignalHandler): void;
	off(signal: RuntimeSignal, handler: SignalHandler): void;
	reemit(signal: RuntimeSignal): void;
}

const HANDLED_SIGNALS: readonly RuntimeSignal[] = ["SIGINT", "SIGTERM"];

export async function runCodexBinary(
	agentPackage: AgentPackage,
	options: RunCodexBinaryOptions = {},
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
	let result: RunMaterializedCodexResult = { exitCode: 1 };

	try {
		result = await runMaterializedCodex(
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

interface RunMaterializedCodexResult {
	readonly exitCode: number;
	readonly materialized?: MaterializedInvocation;
}

type MaterializedCallback = (materialized: MaterializedInvocation) => void;

function resolveRuntime(options: RunCodexBinaryOptions): RuntimeIO {
	return {
		stdout: options.stdout ?? process.stdout,
		stderr: options.stderr ?? process.stderr,
		exit: options.exit ?? ((code: number) => process.exit(code)),
	};
}

async function resolveRunInput(
	options: RunCodexBinaryOptions,
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

async function runMaterializedCodex(
	agentPackage: AgentPackage,
	input: RunInput,
	options: RunCodexBinaryOptions,
	runtime: RuntimeIO,
	onMaterialized: MaterializedCallback,
): Promise<RunMaterializedCodexResult> {
	let materialized: MaterializedInvocation | undefined;

	try {
		materialized = await materializeCodexInvocation(
			agentPackage,
			input,
			options,
		);
		onMaterialized(materialized);
		writeWarnings(materialized, runtime.stderr);
		const exitCode = await spawnCodex(materialized, {
			spawn: options.spawn ?? defaultSpawn,
			stdout: runtime.stdout,
			stderr: runtime.stderr,
		});
		return { exitCode, materialized };
	} catch (error: unknown) {
		runtime.stderr.write(
			spawnDiagnostic(materialized?.spec.command ?? "codex", error),
		);
		return { exitCode: 1, ...(materialized ? { materialized } : {}) };
	}
}

async function materializeCodexInvocation(
	agentPackage: AgentPackage,
	input: RunInput,
	options: RunCodexBinaryOptions,
): Promise<MaterializedInvocation> {
	const parsed = input.parsed;
	return (options.materializeInvocation ?? createCodexCliInvocation)(
		agentPackage,
		{
			cwd: (options.cwd ?? process.cwd)(),
			env: options.env ?? process.env,
			codexArgs: parsed.codexArgs,
			...(parsed.codexBinary ? { codexBinary: parsed.codexBinary } : {}),
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

	return parsedArgsFromState(state);
}

function parsedArgsFromState(state: ArgsState): ParsedArgs {
	return {
		kind: "run",
		...(state.codexBinary ? { codexBinary: state.codexBinary } : {}),
		codexArgs: state.codexArgs,
	};
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

async function spawnCodex(
	materialized: MaterializedInvocation,
	options: {
		readonly spawn: SpawnCodexProcess;
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

async function waitForChild(child: SpawnedCodexProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});
}

function defaultSpawn(
	command: string,
	args: readonly string[],
	options: SpawnOptions,
): SpawnedCodexProcess {
	return nodeSpawn(command, [...args], options);
}

function spawnDiagnostic(command: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `codex runtime failed to spawn "${command}". likely fix: install Codex CLI or pass --codex-binary <path>. ${message}\n`;
}
