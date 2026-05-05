import type { BunRuntime } from "./bun-runtime.ts";
import type { Backend } from "./types.ts";

interface ClaudeCliBackendDeps {
	binary?: string;
}

declare const Bun: BunRuntime;

export function createClaudeCliBackend(
	deps: ClaudeCliBackendDeps = {},
): Backend {
	const binary = deps.binary ?? "claude";

	return {
		name: "claude-cli",
		capabilities: { canCommit: true, isolatedFromHostSource: true },
		livenessCheck() {
			return { argv: [binary, "--version"], expectExitZero: true };
		},
		async run(invocation) {
			const start = Date.now();
			const child = Bun.spawn([binary, "-p"], {
				cwd: invocation.workdir,
				stdin: Bun.file(invocation.promptPath),
				stdout: "pipe",
				stderr: "pipe",
				signal: invocation.signal,
			});

			const stdoutPromise = new Response(child.stdout).text();
			const stderrPromise = new Response(child.stderr).text();
			const exitCode = await child.exited;
			const [stdout] = await Promise.all([stdoutPromise, stderrPromise]);

			return {
				exitCode,
				stdout,
				durationMs: Date.now() - start,
			};
		},
	};
}
