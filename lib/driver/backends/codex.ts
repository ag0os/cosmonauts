import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "./types.ts";

export interface CodexBackendDeps {
	binary?: string;
}

interface BunSubprocess {
	readonly exited: Promise<number>;
	readonly stdout: ConstructorParameters<typeof Response>[0];
	readonly stderr: ConstructorParameters<typeof Response>[0];
}

interface BunSpawnOptions {
	cwd: string;
	stdin: unknown;
	stdout: "pipe";
	stderr: "pipe";
	signal?: AbortSignal;
}

interface BunRuntime {
	file(path: string): unknown;
	spawn(argv: string[], options: BunSpawnOptions): BunSubprocess;
}

declare const Bun: BunRuntime;

export function createCodexBackend(deps: CodexBackendDeps = {}): Backend {
	const binary = deps.binary ?? "codex";

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
				[binary, "exec", "--full-auto", "-o", summaryPath, "-"],
				{
					cwd: invocation.workdir,
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
