import { runCliBackendProcess } from "./cli-process.ts";
import { isDisabledEnv, parseBackendArgsEnv } from "./env-args.ts";
import type { Backend } from "./types.ts";

interface ClaudeCliBackendDeps {
	binary?: string;
	args?: readonly string[];
}

export const CLAUDE_ARGS_ENV = "COSMONAUTS_DRIVER_CLAUDE_ARGS";
export const CLAUDE_SKIP_PERMISSIONS_ENV =
	"COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS";
const CLAUDE_SKIP_PERMISSIONS_ARG = "--dangerously-skip-permissions";

export function createClaudeCliBackend(
	deps: ClaudeCliBackendDeps = {},
): Backend {
	const binary = deps.binary ?? "claude";
	const args =
		deps.args === undefined ? [CLAUDE_SKIP_PERMISSIONS_ARG] : [...deps.args];

	return {
		name: "claude-cli",
		capabilities: { canCommit: true, isolatedFromHostSource: true },
		livenessCheck() {
			return { argv: [binary, "--version"], expectExitZero: true };
		},
		async run(invocation) {
			const start = Date.now();
			const { exitCode, stdout } = await runCliBackendProcess({
				argv: [binary, ...args, "-p"],
				invocation,
				backendName: "claude-cli",
			});

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
	if (isDisabledEnv(env[CLAUDE_SKIP_PERMISSIONS_ENV])) {
		return args;
	}
	return withDefaultSkipPermissions(args);
}

function withDefaultSkipPermissions(args: readonly string[]): string[] {
	return args.includes(CLAUDE_SKIP_PERMISSIONS_ARG)
		? [...args]
		: [CLAUDE_SKIP_PERMISSIONS_ARG, ...args];
}
