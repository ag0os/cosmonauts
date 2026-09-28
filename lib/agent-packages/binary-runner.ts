import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { AgentPackage, MaterializedInvocation } from "./types.ts";

export interface SpawnOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdio: "inherit";
}

interface SpawnedBinaryProcess {
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

export type SpawnBinaryProcess = (
	command: string,
	args: readonly string[],
	options: SpawnOptions,
) => SpawnedBinaryProcess;

type RuntimeSignal = "SIGINT" | "SIGTERM";
type SignalHandler = (signal: RuntimeSignal) => void | Promise<void>;

export interface BinarySignalRuntime {
	on(signal: RuntimeSignal, handler: SignalHandler): void;
	off(signal: RuntimeSignal, handler: SignalHandler): void;
	reemit(signal: RuntimeSignal): void;
}

interface BinaryRuntimeOverrides {
	readonly argv?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly cwd?: () => string;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly exit?: (code: number) => void;
	readonly spawn?: SpawnBinaryProcess;
	readonly signals?: BinarySignalRuntime;
}

export function resolveBinaryRuntime(options: BinaryRuntimeOverrides) {
	return {
		argv: options.argv ?? process.argv.slice(2),
		env: options.env ?? process.env,
		cwd: options.cwd ?? process.cwd,
		stdout: options.stdout ?? process.stdout,
		stderr: options.stderr ?? process.stderr,
		exit: options.exit ?? ((code: number) => process.exit(code)),
		spawn: options.spawn,
		signals: options.signals,
	};
}

interface BinaryRunOptions<Parsed> {
	readonly agentPackage: AgentPackage;
	readonly argv: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly cwd: () => string;
	readonly stdout: Writable;
	readonly stderr: Writable;
	readonly exit: (code: number) => void;
	readonly spawn?: SpawnBinaryProcess;
	readonly signals?: BinarySignalRuntime;
	readonly defaultCommand: string;
	readonly parseArgs: (argv: readonly string[]) => Parsed | Error;
	readonly materialize: (
		agentPackage: AgentPackage,
		parsed: Parsed,
		context: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
	) => Promise<MaterializedInvocation>;
	readonly spawnDiagnostic: (command: string, error: unknown) => string;
}

const HANDLED_SIGNALS: readonly RuntimeSignal[] = ["SIGINT", "SIGTERM"];

export async function runPackagedBinary<Parsed>(
	options: BinaryRunOptions<Parsed>,
): Promise<void> {
	const parsed = options.parseArgs(options.argv);
	if (parsed instanceof Error) {
		options.stderr.write(`${parsed.message}\n`);
		options.exit(1);
		return;
	}

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
	let exitCode = 1;

	try {
		try {
			materialized = await options.materialize(options.agentPackage, parsed, {
				cwd: options.cwd(),
				env: options.env,
			});
			writeWarnings(materialized, options.stderr);
			exitCode = await spawnMaterialized(materialized, {
				spawn: options.spawn ?? defaultSpawn,
				stdout: options.stdout,
				stderr: options.stderr,
			});
		} catch (error: unknown) {
			options.stderr.write(
				options.spawnDiagnostic(
					materialized?.spec.command ?? options.defaultCommand,
					error,
				),
			);
		}
	} finally {
		uninstallSignals();
		await cleanup();
	}

	options.exit(exitCode);
}

function installCleanupSignalHandlers(
	cleanup: () => Promise<void>,
	signals: BinarySignalRuntime,
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
		for (const [signal, handler] of handlers) signals.off(signal, handler);
		handlers.clear();
	}
	return uninstall;
}

const defaultSignalRuntime: BinarySignalRuntime = {
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

function writeWarnings(
	materialized: MaterializedInvocation,
	stderr: Writable,
): void {
	for (const warning of materialized.spec.warnings) {
		stderr.write(`${warning.message}\n`);
	}
}

async function spawnMaterialized(
	materialized: MaterializedInvocation,
	options: {
		readonly spawn: SpawnBinaryProcess;
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
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});
}

function defaultSpawn(
	command: string,
	args: readonly string[],
	options: SpawnOptions,
): SpawnedBinaryProcess {
	return nodeSpawn(command, [...args], options);
}
