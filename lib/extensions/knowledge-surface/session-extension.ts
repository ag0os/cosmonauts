import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { createAgentMemoryExtension } from "../agent-memory/index.ts";
import { createArchitectureMemoryExtension } from "../architecture-memory/index.ts";
import { KNOWLEDGE_SURFACE_EXTENSION_NAME } from "./constants.ts";
import {
	createEmptyKnowledgeRecallHandler,
	type KnowledgeRecallHandler,
	registerKnowledgeRecallTool,
} from "./knowledge-tools.ts";

export { KNOWLEDGE_SURFACE_EXTENSION_NAME } from "./constants.ts";

export interface KnowledgeSurfaceSessionOptions {
	readonly agentId: string;
	readonly registerAgentMemoryTools: boolean;
	readonly authorizeAuthoredMemory: boolean;
	readonly registerArchitectureTool: boolean;
	readonly authorizeArchitecture: boolean;
	readonly recallOwner: "knowledge" | "agent-memory";
	readonly canPropose: boolean;
	readonly recallKnowledge?: KnowledgeRecallHandler;
}

/**
 * Compose the one gate-selected extension owned by Cosmonauts assembly.
 * Knowledge retrieval stays behind an injected seam until Stage 4 supplies
 * its MemoryStore implementation.
 */
export function createKnowledgeSurfaceSessionExtension(
	options: KnowledgeSurfaceSessionOptions,
): InlineExtension {
	const recallKnowledge =
		options.recallKnowledge ?? createEmptyKnowledgeRecallHandler();

	return {
		name: KNOWLEDGE_SURFACE_EXTENSION_NAME,
		factory: (pi) => {
			if (options.registerAgentMemoryTools) {
				createAgentMemoryExtension({
					authorizedAgentId: options.authorizeAuthoredMemory
						? options.agentId
						: null,
					knowledgeRecall: recallKnowledge,
				})(pi);
			} else {
				registerKnowledgeRecallTool(pi, recallKnowledge);
			}

			if (options.registerArchitectureTool) {
				createArchitectureMemoryExtension({
					authorizedAgentIds: options.authorizeArchitecture
						? new Set([options.agentId])
						: new Set(),
				})(pi);
			}
		},
	};
}
