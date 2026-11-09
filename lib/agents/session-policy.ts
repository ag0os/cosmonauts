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
const POLICY_KEY = Symbol.for("cosmonauts:session-policies");
const hostGlobals = globalThis as Record<symbol, unknown>;
hostGlobals[POLICY_KEY] ??= new Map<string, SessionPolicy>();
const policies = hostGlobals[POLICY_KEY] as Map<string, SessionPolicy>;
const RUNTIME_KEY = Symbol.for("cosmonauts:session-runtimes");
hostGlobals[RUNTIME_KEY] ??= new Map<
	string,
	import("../runtime.ts").CosmonautsRuntime
>();
const runtimes = hostGlobals[RUNTIME_KEY] as Map<
	string,
	import("../runtime.ts").CosmonautsRuntime
>;
export function registerSessionPolicy(
	sessionId: string,
	policy: SessionPolicy,
	runtime?: import("../runtime.ts").CosmonautsRuntime,
): void {
	if (policies.has(sessionId))
		throw new Error(`Duplicate host session policy: ${sessionId}`);
	policies.set(sessionId, policy);
	if (runtime) runtimes.set(sessionId, runtime);
}
export function getSessionPolicy(sessionId: string): SessionPolicy | undefined {
	return policies.get(sessionId);
}
export function getSessionRuntime(
	sessionId: string,
): import("../runtime.ts").CosmonautsRuntime | undefined {
	return runtimes.get(sessionId);
}
export function removeSessionPolicy(sessionId: string): void {
	policies.delete(sessionId);
	runtimes.delete(sessionId);
}
