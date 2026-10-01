import type { AgentRegistry } from "../../agents/resolver.ts";
import type { DomainResolver } from "../../domains/resolver.ts";
import { createPiSpawner } from "../../orchestration/agent-spawner.ts";
import { extractAssistantText } from "../../orchestration/assistant-text.ts";
import type { AgentSpawner } from "../../orchestration/types.ts";
import type { BuilderBackend } from "../types.ts";

/** The spawner re-resolves roles by name, so every lean spawn names its domain. */
export const LEAN_DOMAIN = "lean";

type PiSpawnerSource =
	| { spawner: AgentSpawner }
	| { registry: AgentRegistry; domainsDir: string; resolver?: DomainResolver };

export type PiBuilderBackendOptions = PiSpawnerSource & {
	projectSkills?: readonly string[];
	skillPaths?: readonly string[];
};

/**
 * Runs lean roles in-process through Pi. Spawns carry the driver parent role
 * so the destructive-git guard is installed, pointing at the builder snapshot.
 */
export function createPiBuilderBackend(
	options: PiBuilderBackendOptions,
): BuilderBackend {
	const spawner =
		"spawner" in options
			? options.spawner
			: createPiSpawner(options.registry, options.domainsDir, {
					resolver: options.resolver,
				});
	return {
		kind: "pi",
		async run(input) {
			const result = await spawner.spawn({
				role: input.role,
				domainContext: LEAN_DOMAIN,
				cwd: input.worktree,
				prompt: input.prompt,
				...(input.signal ? { signal: input.signal } : {}),
				runtimeContext: {
					mode: "sub-agent",
					parentRole: "driver",
					...(input.taskId ? { taskId: input.taskId } : {}),
				},
				...(options.projectSkills
					? { projectSkills: options.projectSkills }
					: {}),
				...(options.skillPaths ? { skillPaths: [...options.skillPaths] } : {}),
			});
			if (!result.success)
				throw new Error(
					`${input.role} spawn failed: ${result.error ?? "unknown error"}`,
				);
			return {
				text: extractAssistantText(result.messages, input.role),
				...(result.stats ? { stats: result.stats } : {}),
			};
		},
	};
}
