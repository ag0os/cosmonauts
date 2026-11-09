import type { AgentDefinition } from "./types.ts";

/** SDK values stay opaque here so consumer discovery and non-Pi backends remain Pi-free. */
interface SessionPolicyResources {
	projectContext: boolean;
	extensionPaths: readonly string[];
	extensionFactories: readonly unknown[];
}
/** The only resource-loader overrides a host policy may supply. */
export interface SessionPolicyResourceOptions {
	appendSystemPrompt?: readonly string[];
	agentsFilesOverride?: (base: {
		agentsFiles: Array<{ path: string; content: string }>;
	}) => { agentsFiles: Array<{ path: string; content: string }> };
	additionalExtensionPaths?: readonly string[];
	extensionFactories?: readonly unknown[];
}

/** Host-only hooks, carried by runtime code; never accepted as model tool arguments. */
export interface SessionPolicy {
	toolPreset?: import("./types.ts").AgentToolSet;
	filterTools?: (tools: readonly string[]) => string[];
	resourceOptions?: (
		params: SessionPolicyResources,
		domainsDir: string | undefined,
	) => Promise<SessionPolicyResourceOptions>;
	transcriptPath?: () => Promise<string>;
}

export interface SessionPolicyProvider {
	spawnPolicy?: (sessionId: string) => SessionSpawnPolicy;
	forAgent: (definition: AgentDefinition) => SessionPolicy | undefined;
	interactiveDenial?: (definition: AgentDefinition) => string | undefined;
}

export interface SpawnPolicyRequest {
	callerRole: string;
	resolvedTargetRole: string;
	prompt: string;
	model?: string;
	thinkingLevel?: import("./types.ts").ThinkingLevel;
}

/** A bound host policy, obtained before any checkout-owned runtime is loaded. */
export interface SessionSpawnPolicy {
	authorize: (request: SpawnPolicyRequest) => string | undefined;
}

// Pi may load the same extension through a separate module cache.
const RUNTIME_KEY = Symbol.for("cosmonauts:session-runtimes");
const hostGlobals = globalThis as Record<symbol, unknown>;
hostGlobals[RUNTIME_KEY] ??= new Map<
	string,
	import("../runtime.ts").CosmonautsRuntime
>();
const runtimes = hostGlobals[RUNTIME_KEY] as Map<
	string,
	import("../runtime.ts").CosmonautsRuntime
>;
/** Binds a host session to its runtime so nested spawns resolve the same project. */
export function registerSessionRuntime(
	sessionId: string,
	runtime: import("../runtime.ts").CosmonautsRuntime,
): void {
	if (runtimes.has(sessionId))
		throw new Error(`Duplicate host session binding: ${sessionId}`);
	runtimes.set(sessionId, runtime);
}
/**
 * Binds a session it has just created. A refused binding (a duplicate id)
 * leaves the existing session's binding alone and disposes only the new one.
 */
export function bindSessionRuntimeOrDispose(
	session: { readonly sessionId: string; dispose(): void },
	runtime: import("../runtime.ts").CosmonautsRuntime,
): void {
	try {
		registerSessionRuntime(session.sessionId, runtime);
	} catch (error) {
		session.dispose();
		throw error;
	}
}
export function getSessionRuntime(
	sessionId: string,
): import("../runtime.ts").CosmonautsRuntime | undefined {
	return runtimes.get(sessionId);
}
export function removeSessionRuntime(sessionId: string): void {
	runtimes.delete(sessionId);
}
