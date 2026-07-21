import { join, resolve } from "node:path";
import type { MemoryScopeName } from "./types.ts";

const AGENT_MEMORY_RESOURCE_DIR = "memory/agent";
const NOTE_RESOURCE_DIR = `${AGENT_MEMORY_RESOURCE_DIR}/notes`;
const PLAYBOOK_RESOURCE_DIR = `${AGENT_MEMORY_RESOURCE_DIR}/playbooks`;
const EPISODE_RESOURCE_DIR = `${AGENT_MEMORY_RESOURCE_DIR}/episodes`;
export const AGENT_MEMORY_INDEX_RESOURCE = `${AGENT_MEMORY_RESOURCE_DIR}/index.md`;
export const AGENT_MEMORY_PROFILE_RESOURCE = `${AGENT_MEMORY_RESOURCE_DIR}/profile.md`;
export const AGENT_MEMORY_PROFILE_PREVIOUS_RESOURCE = `${AGENT_MEMORY_PROFILE_RESOURCE}.prev`;

interface AgentMemoryStorePaths {
	readonly root: string;
	readonly agentDir: string;
	readonly notesDir: string;
	readonly playbooksDir: string;
	readonly episodesDir: string;
	readonly profilePath: string;
	readonly profilePreviousPath: string;
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
		playbooksDir: join(root, PLAYBOOK_RESOURCE_DIR),
		episodesDir: join(root, EPISODE_RESOURCE_DIR),
		profilePath: join(root, AGENT_MEMORY_PROFILE_RESOURCE),
		profilePreviousPath: join(root, AGENT_MEMORY_PROFILE_PREVIOUS_RESOURCE),
		indexPath: join(root, AGENT_MEMORY_INDEX_RESOURCE),
		scope: options.scope,
	};
}

export function noteResource(fileName: string): string {
	return `${NOTE_RESOURCE_DIR}/${fileName}`;
}

export function playbookResource(fileName: string): string {
	return `${PLAYBOOK_RESOURCE_DIR}/${fileName}`;
}

export function episodeResource(fileName: string): string {
	return `${EPISODE_RESOURCE_DIR}/${fileName}`;
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
