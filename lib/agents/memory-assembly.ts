import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { createAgentMemoryExtension } from "../extensions/agent-memory/index.ts";
import { createArchitectureMemoryExtension } from "../extensions/architecture-memory/index.ts";
import { createKnowledgeSurfaceSessionExtension } from "../extensions/knowledge-surface/session-extension.ts";
import { resolveMemoryGrants } from "./declaration.ts";
import { qualifyAgentId } from "./runtime-identity.ts";
import type { AgentDefinition } from "./types.ts";

export function buildMemoryExtensions(
	def: AgentDefinition,
	enabled: boolean,
): {
	factories: InlineExtension[];
	recallEnabled: boolean;
} {
	const grants = resolveMemoryGrants(def.memory);
	const knowledge =
		grants.knowledge &&
		(typeof def.tools === "string" || def.tools.includes("recall"));
	const agentId = qualifyAgentId(def.id, def.domain);
	const factories: InlineExtension[] = [];
	if (enabled) {
		factories.push(
			createKnowledgeSurfaceSessionExtension({
				agentId,
				knowledge,
				episodes: grants.episodes,
				registerAgentMemoryTools: grants.authored,
				authorizeAuthoredMemory: grants.authored,
				registerArchitectureTool: grants.architecture,
				authorizeArchitecture: grants.architecture,
				recallOwner: grants.authored ? "agent-memory" : "knowledge",
				canPropose: grants.proposals,
			}),
		);
	} else {
		if (grants.authored) {
			factories.push(
				createAgentMemoryExtension({
					authorizedAgentId: agentId,
					episodes: grants.episodes,
				}),
			);
		}
		if (grants.architecture) {
			factories.push(
				createArchitectureMemoryExtension({
					authorizedAgentIds: new Set([agentId]),
				}),
			);
		}
	}
	return {
		factories,
		recallEnabled: knowledge || grants.authored,
	};
}
