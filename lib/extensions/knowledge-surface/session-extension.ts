import { homedir } from "node:os";
import { join } from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import {
	type ArchitectureMapMemoryStoreOptions,
	createArchitectureMapMemoryStore,
} from "../../architecture-map/index.ts";
import type { ProjectConfig } from "../../config/types.ts";
import {
	createKnowledgeMemoryStore,
	createMarkdownMemoryStore,
	type KnowledgeMemoryStoreOptions,
	type MemoryStore,
} from "../../memory/index.ts";
import {
	type AgentMemoryStoreFactoryOptions,
	createAgentMemoryExtension,
} from "../agent-memory/index.ts";
import { createArchitectureMemoryExtension } from "../architecture-memory/index.ts";
import { registerCombinedContextHandler } from "./combined-context.ts";
import { KNOWLEDGE_SURFACE_EXTENSION_NAME } from "./constants.ts";
import {
	createKnowledgeRecallHandler,
	type KnowledgeRecallHandler,
	registerKnowledgeProposalTool,
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
	readonly userCosmonautsRoot?: string;
	readonly now?: () => Date;
	readonly createKnowledgeStore?: (
		options: KnowledgeMemoryStoreOptions,
	) => MemoryStore;
	readonly createAuthoredStore?: (
		options: AgentMemoryStoreFactoryOptions,
	) => MemoryStore;
	readonly createArchitectureStore?: (
		options: ArchitectureMapMemoryStoreOptions,
	) => MemoryStore;
	readonly loadConfig?: (projectRoot: string) => Promise<ProjectConfig>;
}

/**
 * Compose the one gate-selected extension owned by Cosmonauts assembly.
 * All enabled durable reads flow through injected MemoryStore factories.
 */
export function createKnowledgeSurfaceSessionExtension(
	options: KnowledgeSurfaceSessionOptions,
): InlineExtension {
	const userCosmonautsRoot =
		options.userCosmonautsRoot ?? join(homedir(), ".cosmonauts");
	const now = options.now ?? (() => new Date());
	const createKnowledgeStore =
		options.createKnowledgeStore ?? createKnowledgeMemoryStore;
	const createAuthoredStore =
		options.createAuthoredStore ?? createMarkdownMemoryStore;
	const createArchitectureStore =
		options.createArchitectureStore ?? createArchitectureMapMemoryStore;
	const recallKnowledge =
		options.recallKnowledge ??
		createKnowledgeRecallHandler({
			createKnowledgeStore: (projectRoot) =>
				createKnowledgeStore({ projectRoot, userCosmonautsRoot }),
			...(options.authorizeAuthoredMemory
				? {
						createAuthoredStore: ({ projectRoot, episodeWarningThreshold }) =>
							createAuthoredStore({
								projectRoot,
								userCosmonautsRoot,
								now,
								...(episodeWarningThreshold === undefined
									? {}
									: { episodeWarningThreshold }),
							}),
					}
				: {}),
			...(options.loadConfig ? { loadConfig: options.loadConfig } : {}),
		});

	return {
		name: KNOWLEDGE_SURFACE_EXTENSION_NAME,
		factory: (pi) => {
			const authoredAuthorization = { authorized: false };
			const architectureAuthorization = { authorized: false };
			if (options.registerAgentMemoryTools) {
				createAgentMemoryExtension({
					authorizedAgentId: options.authorizeAuthoredMemory
						? options.agentId
						: null,
					knowledgeRecall: recallKnowledge,
					userCosmonautsRoot,
					now,
					storeFactory: createAuthoredStore,
					authorizationState: authoredAuthorization,
					registerContextHandler: false,
					...(options.loadConfig ? { loadConfig: options.loadConfig } : {}),
				})(pi);
			} else {
				registerKnowledgeRecallTool(pi, recallKnowledge);
			}
			if (options.canPropose && options.agentId === "coding/distiller") {
				registerKnowledgeProposalTool(pi, {
					now,
					createKnowledgeStore: (projectRoot) =>
						createKnowledgeStore({ projectRoot, userCosmonautsRoot }),
				});
			}

			if (options.registerArchitectureTool) {
				createArchitectureMemoryExtension({
					authorizedAgentIds: options.authorizeArchitecture
						? new Set([options.agentId])
						: new Set(),
					createStore: createArchitectureStore,
					authorizationState: architectureAuthorization,
					registerContextHandler: false,
				})(pi);
			}

			registerCombinedContextHandler(pi, {
				agentId: options.agentId,
				authorizeAuthoredMemory: options.authorizeAuthoredMemory,
				authorizeArchitecture: options.authorizeArchitecture,
				authoredAuthorization,
				architectureAuthorization,
				userCosmonautsRoot,
				createKnowledgeStore: (projectRoot) =>
					createKnowledgeStore({ projectRoot, userCosmonautsRoot }),
				createAuthoredStore: (projectRoot) =>
					createAuthoredStore({ projectRoot, userCosmonautsRoot, now }),
				createArchitectureStore: (projectRoot) =>
					createArchitectureStore({ projectRoot }),
			});
		},
	};
}
