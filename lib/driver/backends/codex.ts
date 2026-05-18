import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BunRuntime } from "./bun-runtime.ts";
import { isDisabledEnv, parseBackendArgsEnv } from "./env-args.ts";
import type { Backend } from "./types.ts";

interface CodexBackendDeps {
	binary?: string;
	globalArgs?: readonly string[];
	extraArgs?: readonly string[];
}

export const CODEX_ARGS_ENV = "COSMONAUTS_DRIVER_CODEX_ARGS";
export const CODEX_EXEC_ARGS_ENV = "COSMONAUTS_DRIVER_CODEX_EXEC_ARGS";
export const CODEX_YOLO_ENV = "COSMONAUTS_DRIVER_CODEX_YOLO";
const CODEX_YOLO_ARG = "--yolo";

declare const Bun: BunRuntime;

export function createCodexBackend(deps: CodexBackendDeps = {}): Backend {
	const binary = deps.binary ?? "codex";
	const globalArgs =
		deps.globalArgs === undefined ? [CODEX_YOLO_ARG] : [...deps.globalArgs];
	const extraArgs = [...(deps.extraArgs ?? [])];

	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		livenessCheck() {
			return { argv: [binary, "--version"], expectExitZero: true };
		},
		async run(invocation) {
			const start = Date.now();
			const summaryPath = join(
				invocation.workdir,
				`${invocation.taskId}-summary.txt`,
			);
			const child = Bun.spawn(
				[...codexExecArgv({ binary, globalArgs, extraArgs, summaryPath })],
				{
					cwd: invocation.projectRoot,
					stdin: Bun.file(invocation.promptPath),
					stdout: "pipe",
					stderr: "pipe",
					signal: invocation.signal,
				},
			);

			const stdoutPromise = new Response(child.stdout).text();
			const stderrPromise = new Response(child.stderr).text();
			const exitCode = await child.exited;
			const [stdout] = await Promise.all([stdoutPromise, stderrPromise]);
			const summary = await readSummary(summaryPath);

			return {
				exitCode,
				stdout: summary ?? stdout,
				durationMs: Date.now() - start,
			};
		},
	};
}

interface CodexExecArgvOptions {
	binary: string;
	globalArgs: readonly string[];
	extraArgs: readonly string[];
	summaryPath: string;
}

function codexExecArgv({
	binary,
	globalArgs,
	extraArgs,
	summaryPath,
}: CodexExecArgvOptions): readonly string[] {
	return [
		binary,
		...globalArgs,
		"exec",
		...fullAutoArgs(globalArgs, extraArgs),
		...extraArgs,
		"-o",
		summaryPath,
		"-",
	];
}

function fullAutoArgs(
	globalArgs: readonly string[],
	extraArgs: readonly string[],
): string[] {
	return hasYoloMode([...globalArgs, ...extraArgs]) ? [] : ["--full-auto"];
}

function hasYoloMode(args: readonly string[]): boolean {
	return args.some(
		(arg) =>
			arg === CODEX_YOLO_ARG ||
			arg === "--dangerously-bypass-approvals-and-sandbox",
	);
}

function withDefaultYolo(args: readonly string[]): string[] {
	return hasYoloMode(args) ? [...args] : [CODEX_YOLO_ARG, ...args];
}

export function readCodexArgsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
	const args = parseBackendArgsEnv(env[CODEX_ARGS_ENV], CODEX_ARGS_ENV) ?? [];
	if (isDisabledEnv(env[CODEX_YOLO_ENV])) {
		return args;
	}
	return withDefaultYolo(args);
}

export function readCodexExecArgsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
	return parseBackendArgsEnv(env[CODEX_EXEC_ARGS_ENV], CODEX_EXEC_ARGS_ENV);
}

export function parseCodexExecArgs(
	raw: string | undefined,
): string[] | undefined {
	return parseBackendArgsEnv(raw, CODEX_EXEC_ARGS_ENV);
}

async function readSummary(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
