import type { CosmonautsRuntime } from "../runtime.ts";
import type { AgentMemoryGrants } from "./types.ts";

/** Host context is not part of model tool arguments. */
export interface SessionProviderContext {
	readonly agentId: string;
	readonly memory: Required<AgentMemoryGrants>;
	/** Execution scope for the session's tools (may be narrower than discovery). */
	readonly runtime?: CosmonautsRuntime;
	/** The runtime that resolved the active agent; `runtime` unless the host narrows execution. */
	readonly discoveryRuntime?: CosmonautsRuntime;
}
/** SDK factories are opaque here so discovery and external backends stay Pi-free. */
export type HostExtensionProvider = (
	context: SessionProviderContext,
) => unknown | Promise<unknown>;
