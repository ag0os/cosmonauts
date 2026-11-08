import type { CosmonautsRuntime } from "../runtime.ts";
import type { AgentMemoryGrants } from "./types.ts";

/** Host context is not part of model tool arguments. */
export interface SessionProviderContext {
	readonly agentId: string;
	readonly memory: Required<AgentMemoryGrants>;
	readonly runtime?: CosmonautsRuntime;
}
/** SDK factories are opaque here so discovery and external backends stay Pi-free. */
export type HostExtensionProvider = (
	context: SessionProviderContext,
) => unknown | Promise<unknown>;
