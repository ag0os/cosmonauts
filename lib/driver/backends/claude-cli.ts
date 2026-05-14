import type { BunRuntime } from "./bun-runtime.ts";
import { isEnabledEnv, parseBackendArgsEnv } from "./env-args.ts";
import type { Backend } from "./types.ts";

interface ClaudeCliBackendDeps {
	binary?: string;
	args?: readonly string[];
}

export const CLAUDE_ARGS_ENV = "COSMONAUTS_DRIVER_CLAUDE_ARGS";
export const CLAUDE_SKIP_PERMISSIONS_ENV =
	"COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS";

declare const Bun: BunRuntime;

export function createClaudeCliBackend(
	deps: ClaudeCliBackendDeps = {},
): Backend {
	const binary = deps.binary ?? "claude";
	const args = [...(deps.args ?? [])];

	return {
		name: "claude-cli",
		capabilities: { canCommit: true, isolatedFromHostSource: true },
		livenessCheck() {
			return { argv: [binary, "--version"], expectExitZero: true };
		},
		async run(invocation) {
			const start = Date.now();
			const child = Bun.spawn([binary, ...args, "-p"], {
				cwd: invocation.projectRoot,
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

export function readClaudeArgsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
	const args = parseBackendArgsEnv(env[CLAUDE_ARGS_ENV], CLAUDE_ARGS_ENV) ?? [];
	if (isEnabledEnv(env[CLAUDE_SKIP_PERMISSIONS_ENV])) {
		args.unshift("--dangerously-skip-permissions");
	}
	return args.length > 0 ? args : undefined;
}
