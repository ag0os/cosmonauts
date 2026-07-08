import { join, resolve } from "node:path";
import type { MemoryScopeName } from "./types.ts";

const AGENT_MEMORY_RESOURCE_DIR = "memory/agent";
const NOTE_RESOURCE_DIR = `${AGENT_MEMORY_RESOURCE_DIR}/notes`;
export const AGENT_MEMORY_INDEX_RESOURCE = `${AGENT_MEMORY_RESOURCE_DIR}/index.md`;

interface AgentMemoryStorePaths {
	readonly root: string;
	readonly agentDir: string;
	readonly notesDir: string;
	readonly indexPath: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
}

export function resolveAgentMemoryStorePaths(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
}): AgentMemoryStorePaths {
	const root =
		options.scope === "project"
			? resolve(options.projectRoot)
			: resolve(options.userCosmonautsRoot);
	const agentDir = join(root, AGENT_MEMORY_RESOURCE_DIR);
	return {
		root,
		agentDir,
		notesDir: join(root, NOTE_RESOURCE_DIR),
		indexPath: join(root, AGENT_MEMORY_INDEX_RESOURCE),
		scope: options.scope,
	};
}

export function noteResource(fileName: string): string {
	return `${NOTE_RESOURCE_DIR}/${fileName}`;
}

export function assertBoundProjectRoot(options: {
	readonly boundProjectRoot: string;
	readonly requestedProjectRoot: string;
}): void {
	if (
		resolve(options.boundProjectRoot) !== resolve(options.requestedProjectRoot)
	) {
		throw new Error(
			`Markdown memory store is bound to a different projectRoot: ${options.boundProjectRoot}`,
		);
	}
}
