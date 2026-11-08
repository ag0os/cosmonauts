import type { ProjectConfig } from "../config/types.ts";
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
interface HostSessionEvidence {
	sessionId: string;
	model?: { provider: string; id: string };
	messages: readonly unknown[];
}

/** Host-only hooks, carried by runtime code; never accepted as model tool arguments. */
export interface SessionPolicy {
	validateDefinition?: (definition: AgentDefinition) => void;
	spawn?: SessionSpawnPolicy;
	toolPreset?: import("./types.ts").AgentToolSet;
	filterTools?: (tools: readonly string[]) => string[];
	loadConfig?: (cwd: string) => Promise<ProjectConfig>;
	prepareSkills?: (
		paths: string[] | undefined,
		domainsDir: string | undefined,
	) => Promise<string[] | undefined>;
	resourceOptions?: (
		params: SessionPolicyResources,
		domainsDir: string | undefined,
	) => Promise<SessionPolicyResourceOptions>;
	settingsManager?: () => unknown;
	transcriptPath?: () => Promise<string>;
	retainTranscript?: boolean;
	onCreated?: (session: HostSessionEvidence) => void;
	onDisposed?: (sessionId: string) => void;
	onCompletionWait?: (messages: readonly string[], timeoutMs: number) => void;
	observeToolResult?: (toolName: string, result: unknown) => unknown;
}

export interface SessionPolicyProvider {
	spawnPolicy?: (sessionId: string) => SessionSpawnPolicy;
	launchTarget?: (
		reference: import("../domains/bindings.ts").ResolvedAgentReference,
		options: {
			projectRoot: string;
			operatorNote: string;
			planSlug?: string;
			signal?: AbortSignal;
		},
	) => Promise<{ outcome: "success" | "failed"; summary: string }> | undefined;
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

export interface ChildSessionEvidence {
	session: HostSessionEvidence;
	spawnId: string;
	resolvedRole?: string;
	resolvedModel?: { provider: string; id: string };
}

/** A bound host policy, obtained before any checkout-owned runtime is loaded. */
export interface SessionSpawnPolicy {
	authorize: (request: SpawnPolicyRequest) => string | undefined;
	prepare?: (request: SpawnPolicyRequest) => {
		cwd: string;
		prompt: string;
		model?: string;
		sessionPolicy: SessionPolicy;
	};
	onRegistered?: (spawnId: string, resolvedRole: string) => void;
	onFailure?: (message: string) => void;
	onSettled?: (spawnId: string) => void;
	onCompleted?: (evidence: ChildSessionEvidence) => Promise<void>;
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
