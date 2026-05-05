import { createClaudeCliBackend } from "./claude-cli.ts";
import { createCodexBackend } from "./codex.ts";
import type { Backend } from "./types.ts";

interface BackendRegistryDeps {
	codexBinary?: string;
	claudeBinary?: string;
}

export class DetachedBackendNotSupportedError extends Error {
	readonly backendName: string;

	constructor(backendName: string) {
		super(`Backend is not supported for detached mode: ${backendName}`);
		this.name = "DetachedBackendNotSupportedError";
		this.backendName = backendName;
	}
}

export class UnknownBackendError extends Error {
	readonly backendName: string;

	constructor(backendName: string) {
		super(`Unknown backend: ${backendName}`);
		this.name = "UnknownBackendError";
		this.backendName = backendName;
	}
}

export function resolveBackend(
	name: string,
	deps: BackendRegistryDeps = {},
): Backend {
	switch (name) {
		case "codex":
			return createCodexBackend({ binary: deps.codexBinary });
		case "claude-cli":
			return createClaudeCliBackend({ binary: deps.claudeBinary });
		case "cosmonauts-subagent":
			throw new DetachedBackendNotSupportedError(name);
		default:
			throw new UnknownBackendError(name);
	}
}
