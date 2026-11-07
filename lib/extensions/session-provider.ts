import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { AgentMemoryGrants } from "../agents/types.ts";

/** Selected providers may bind to the host's declaration before Pi registers them. */
export interface SessionProviderContext {
	readonly agentId: string;
	readonly memory: Required<AgentMemoryGrants>;
}

export type SessionExtensionProvider = (
	context: SessionProviderContext,
) => InlineExtension | undefined;
