import { readClaudeArgsFromEnv } from "./backends/claude-cli.ts";
import {
	readCodexArgsFromEnv,
	readCodexExecArgsFromEnv,
} from "./backends/codex.ts";
import { resolveBackend } from "./backends/registry.ts";
import type { Backend } from "./backends/types.ts";

export function resolveConfiguredBackend(backendName: string): Backend {
	if (backendName === "codex") {
		return resolveBackend(backendName, {
			codexBinary: process.env.COSMONAUTS_DRIVER_CODEX_BINARY,
			codexArgs: readCodexArgsFromEnv(),
			codexExtraArgs: readCodexExecArgsFromEnv(),
		});
	}

	if (backendName === "claude-cli") {
		return resolveBackend(backendName, {
			claudeBinary: process.env.COSMONAUTS_DRIVER_CLAUDE_BINARY,
			claudeArgs: readClaudeArgsFromEnv(),
		});
	}

	return resolveBackend(backendName);
}

export function resolveConfiguredExternalBackend(backendName: string): Backend {
	return resolveConfiguredBackend(backendName);
}
