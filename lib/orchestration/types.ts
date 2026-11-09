/**
 * Type definitions for the chain runner orchestration system.
 */

import type { AgentRegistry } from "../agents/resolver.ts";
import type { ThinkingLevel } from "../agents/types.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import type { EpisodeWarningReporter } from "../memory/episode.ts";
import type { PlanReviewTarget, ReviewRoundBlock } from "./review-revision.ts";

/** A single stage in a chain pipeline */
export interface ChainStage {
	stageId?: string;
	declarationId?: string;
	purpose?: StagePromptPurpose;
	reviewTarget?: {
		source: "active-plan-review";
		producerStageIds: readonly string[];
	};
	requiresPlanReviewTarget?: boolean;
	expectedPlanSlug?: string;
	completionPolicy?: ChainCompletionPolicy;
	terminalGate?: string;
	instruction?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	/** Agent role name (resolved against the consumer declarations) */
	name: string;
	/** Binding-aware requested/resolved reference for execution, when different from the visible stage name. */
	agentReference?: ResolvedAgentReference;
	/** Whether this stage loops until its completion check passes */
	loop?: boolean;
	/** Optional completion check — loop exits when it returns true */
	completionCheck?: (projectRoot: string) => Promise<boolean>;
	/** Optional prompt override — replaces the default stage prompt */
	prompt?: string;
}

/** Syntax descriptor for a parallel group step */
type ParallelGroupSyntax =
	| { kind: "group" }
	| { kind: "fanout"; role: string; count: number };

/** A parallel group step that runs multiple stages concurrently */
export interface ParallelGroupStep {
	kind: "parallel";
	/** One or more stages to run concurrently */
	stages: [ChainStage, ...ChainStage[]];
	/** Discriminated syntax — describes how this group was expressed in the DSL */
	syntax: ParallelGroupSyntax;
}

/** A single step in a chain — either a sequential stage or a parallel group */
export type ChainStep = ChainStage | ParallelGroupStep;

// ============================================================================
// Configuration
// ============================================================================

/** Open declaration-id model and thinking overrides. */
export interface ModelConfig {
	[agentId: string]: string | undefined;
}
export interface ThinkingConfig {
	[agentId: string]: ThinkingLevel | undefined;
}

export type StagePromptPurpose =
	| { kind: "default" }
	| { kind: "plan-review"; targetStageIds: readonly string[] }
	| { kind: "plan-revision"; targetStageIds: readonly string[] };

export type ChainCompletionState =
	| { status: "pending" }
	| { status: "complete" }
	| { status: "terminal"; reason: string };
export type ChainCompletionPolicy =
	| { kind: "once" }
	| {
			kind: "state";
			evaluate: (projectRoot: string) => Promise<ChainCompletionState>;
	  };

export interface NormalizedChainStage extends ChainStage {
	stageId: string;
	declarationId: string;
	loop: boolean;
	purpose: StagePromptPurpose;
	requiresPlanReviewTarget: boolean;
	completionPolicy: ChainCompletionPolicy;
	instruction: string;
	model: string;
}

export interface ChainStageContext {
	stage: ChainStage;
	steps: readonly ChainStep[];
	topologyIndex: number;
	definition: import("../agents/types.ts").AgentDefinition;
	registry: AgentRegistry;
	completionLabel?: string;
	models?: ModelConfig;
	thinking?: ThinkingConfig;
}
export interface ChainNormalizationError {
	code:
		| "binding"
		| "declaration"
		| "stage-id"
		| "completion"
		| "parallel-loop"
		| "terminal"
		| "target"
		| "model";
	stageId?: string;
	stageName?: string;
	message: string;
}
export interface TerminalGateContext {
	completionLabel?: string;
	configuredPlanSlug?: string;
	hostContext?: unknown;
	stage: ChainStage;
	prompt?: string;
	projectRoot: string;
	signal?: AbortSignal;
	planSlug?: string;
	refusalReason?: string;
}
export interface ChainAdapter {
	/** Capture default explicitly selected by this consumer for dynamically assembled chains. */
	defaultEpisodes?: boolean;
	classifyStage?: (
		context: ChainStageContext,
	) => Partial<ChainStage> & { errors?: readonly ChainNormalizationError[] };
	buildStagePrompt?: (context: ChainStageContext) => string;
	terminalGates?: Readonly<
		Record<
			string,
			(context: TerminalGateContext) => Promise<Omit<StageResult, "stage">>
		>
	>;
	refuse?: (
		config: ChainConfig,
		errors: readonly ChainNormalizationError[],
	) => Promise<ChainResult | undefined>;
	defaultModel?: string;
	defaultThinkingLevel?: ThinkingLevel;
}

/** Compaction settings for spawned agent sessions */
export interface CompactionConfig {
	/** Whether compaction is enabled */
	enabled: boolean;
	/** Number of recent tokens to keep when compacting (optional) */
	keepRecentTokens?: number;
}

/** Configuration for a chain execution */
export interface ChainConfig {
	runtime: import("../runtime.ts").CosmonautsRuntime;
	sessionPolicies?: import("../agents/session-policy.ts").SessionPolicyProvider;
	chainAdapter?: ChainAdapter;
	defaultModel?: string;
	episodes?: boolean;
	requesterDomain?: string;
	/** Chain steps to execute (parsed from DSL or provided directly) */
	steps: ChainStep[];
	/** Project root directory (for task system, cwd) */
	projectRoot: string;
	/** Opaque host input interpreted only by the consumer terminal executor. */
	terminalGateContext?: unknown;
	/** Default domain context for resolving unqualified stage names. */
	domainContext?: string;
	/** Model overrides per role */
	models?: ModelConfig;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Callback for progress events */
	onEvent?: (event: ChainEvent) => void;
	/** Optional awaitable transport for non-fatal episode capture warnings. */
	reportEpisodeWarning?: EpisodeWarningReporter;
	/** Global safety cap: max total iterations across all loop stages (default: 50) */
	maxTotalIterations?: number;
	/** Global safety cap: timeout in milliseconds (default: 30 minutes) */
	timeoutMs?: number;
	/** Per-spawn child completion wait timeout in milliseconds (default: 5 minutes) */
	spawnTimeoutMs?: number;
	/** Project-level skill filter list (from .cosmonauts/config.json) */
	projectSkills?: readonly string[];
	/** Explicit skill directories (domain dirs + config skillPaths). */
	skillPaths?: readonly string[];
	/** Optional task label scope for default completion checks (e.g. plan:<slug>). */
	completionLabel?: string;
	/** Optional plan slug derived from completionLabel (e.g. "session-lineage"). */
	planSlug?: string;
	/** Thinking level overrides per role */
	thinking?: ThinkingConfig;
	/** Compaction settings for spawned agent sessions */
	compaction?: CompactionConfig;
	/** Agent registry for resolving agent definitions. */
	registry: AgentRegistry;
	/** Absolute path to the root domains directory. Computed from package root if not provided. */
	domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	resolver?: import("../domains/resolver.ts").DomainResolver;
}

// ============================================================================
// Cost / Stats Tracking
// ============================================================================

/** Token usage breakdown */
export interface TokenStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
}

/** Stats captured from a single agent spawn (mirrors Pi SessionStats + durationMs) */
export interface SpawnStats {
	/** Token usage breakdown */
	tokens: TokenStats;
	/** Estimated cost in USD */
	cost: number;
	/** Wall-clock duration in milliseconds */
	durationMs: number;
	/** Number of user↔assistant turns */
	turns: number;
	/** Number of tool calls made */
	toolCalls: number;
}

/** Per-stage stats within a chain run */
export interface StageStats {
	/** Stage name (agent role) */
	stageName: string;
	/** Number of iterations (1 for non-loop stages) */
	iterations: number;
	/** Aggregated spawn stats across all iterations in this stage */
	stats: SpawnStats;
}

/** Aggregate stats for a full chain execution */
export interface ChainStats {
	/** Per-stage breakdown */
	stages: StageStats[];
	/** Sum of cost across all stages */
	totalCost: number;
	/** Sum of total tokens across all stages */
	totalTokens: number;
	/** Sum of durationMs across all stages */
	totalDurationMs: number;
}

// ============================================================================
// Execution Results
// ============================================================================

/** Run-local plan-review evidence; addressed index and round are recorded atomically. */
export type InlinePlanReviewState =
	| {
			target: PlanReviewTarget;
			addressedAtTopologyIndex?: undefined;
			addressedStageId?: undefined;
			addressedReviewRound?: undefined;
	  }
	| {
			target: PlanReviewTarget;
			addressedAtTopologyIndex: number;
			addressedStageId?: string;
			addressedReviewRound: number;
	  };

/** Result of executing a single stage */
export interface StageResult {
	/** Stage that was executed */
	stage: ChainStage;
	/** Whether the stage completed successfully */
	success: boolean;
	/** Preserve terminal executor scheduler semantics. */
	outcome?: import("../durable-runtime/types.ts").StepResult["outcome"];
	nextAction?: import("../durable-runtime/types.ts").StepResult["nextAction"];
	/** Number of iterations actually executed (for loop stages) */
	iterations: number;
	/** Duration in milliseconds */
	durationMs: number;
	/** Error message if failed */
	error?: string;
	/** Aggregated stats across all iterations in this stage */
	stats?: SpawnStats;
	/** Condensed text from the stage agent's final message (last iteration for loops) */
	summary?: string;
	artifacts?: import("../durable-runtime/types.ts").ArtifactRef[];
	/** Typed plan-review gate failure, including a pre-spawn task-decomposition block. */
	reviewRoundBlock?: ReviewRoundBlock;
}

/** Result of executing a full chain */
export interface ChainResult {
	/** Durable run identity for graph-backed chains; undefined for inline legacy chains. */
	run?: {
		runId: string;
		scope: "chain";
	};
	/** Whether all stages completed successfully */
	success: boolean;
	/** Results for each stage executed */
	stageResults: StageResult[];
	/** Total duration in milliseconds */
	totalDurationMs: number;
	/** Errors from failed stages */
	errors: string[];
	/** Aggregate cost/token stats across all stages */
	stats?: ChainStats;
}

// ============================================================================
// Events
// ============================================================================

/** Events forwarded from Pi session subscriptions during agent spawns. */
interface SpawnEventBase {
	sessionId: string;
}

export type CompactionReason = "manual" | "threshold" | "overflow";

export type SpawnEvent =
	| (SpawnEventBase & {
			type: "agent_resolved";
			requestedRole: string;
			resolvedAgentId: string;
	  })
	| (SpawnEventBase & { type: "turn_start" })
	| (SpawnEventBase & { type: "turn_end" })
	| (SpawnEventBase & {
			type: "tool_execution_start";
			toolName: string;
			toolCallId: string;
			args?: unknown;
	  })
	| (SpawnEventBase & {
			type: "tool_execution_end";
			toolName: string;
			toolCallId: string;
			isError: boolean;
	  })
	| (SpawnEventBase & {
			type: "compaction_start";
			reason: CompactionReason;
	  })
	| (SpawnEventBase & {
			type: "compaction_end";
			reason: CompactionReason;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  });

export type ChainEvent =
	| { type: "chain_start"; steps: ChainStep[] }
	| { type: "chain_end"; result: ChainResult }
	| { type: "stage_start"; stage: ChainStage; stageIndex: number }
	| { type: "stage_end"; stage: ChainStage; result: StageResult }
	| { type: "stage_stats"; stage: ChainStage; stats: SpawnStats }
	| { type: "stage_iteration"; stage: ChainStage; iteration: number }
	| { type: "parallel_start"; step: ParallelGroupStep; stepIndex: number }
	| {
			type: "parallel_end";
			step: ParallelGroupStep;
			stepIndex: number;
			results: StageResult[];
			success: boolean;
			error?: string;
	  }
	| { type: "agent_spawned"; role: string; sessionId: string }
	| { type: "agent_completed"; role: string; sessionId: string }
	| { type: "agent_turn"; role: string; sessionId: string; event: SpawnEvent }
	| {
			type: "agent_tool_use";
			role: string;
			sessionId: string;
			event: SpawnEvent;
	  }
	| { type: "error"; message: string; stage?: ChainStage }
	| {
			/** Emitted for reviewer, revision, and task-decomposition gate failures. */
			type: "unaddressed_review_round";
			stage: ChainStage;
			block: ReviewRoundBlock;
	  }
	| {
			type: "spawn_completion";
			spawnId: string;
			role: string;
			outcome: "success" | "failure";
			summary: string;
	  };

// ============================================================================
// Agent Spawner
// ============================================================================

/** Runtime context metadata for spawned agents */
export interface SpawnRuntimeContext {
	/** Execution mode — "sub-agent" enables runtime prompt injection */
	readonly mode: "top-level" | "sub-agent";
	/** Parent agent role (populated when mode is "sub-agent") */
	readonly parentRole?: string;
	/** High-level objective for this spawn */
	readonly objective?: string;
	/** Task ID being worked on, if applicable */
	readonly taskId?: string;
}

/** Handle representing an in-flight or completed parallel spawn */
export interface SpawnHandle {
	/** Unique identifier for this spawn */
	spawnId: string;
	/** Agent role that was spawned */
	role: string;
	/** Current lifecycle status of the spawn */
	status: "accepted" | "running" | "completed" | "failed";
}

/** Configuration for spawning an agent */
export interface SpawnConfig {
	runtime: import("../runtime.ts").CosmonautsRuntime;
	/** Host-bound session hooks; never copied from model tool arguments. */
	sessionPolicy?: import("../agents/session-policy.ts").SessionPolicy;
	/** Agent role to spawn */
	role: string;
	/** Binding-aware requested/resolved reference. Execution uses `resolved`; user-facing records keep `role`. */
	agentReference?: ResolvedAgentReference;
	/** Default domain context for resolving unqualified role names. */
	domainContext?: string;
	/** Working directory */
	cwd: string;
	/** Model to use (overrides default for role) */
	model?: string;
	/** Initial prompt to send to the agent */
	prompt: string;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Skill paths to load (overrides role defaults) */
	skillPaths?: string[];
	/** Runtime context for prompt layer injection (Layer 3) */
	runtimeContext?: SpawnRuntimeContext;
	/** Project-level skill filter list (from .cosmonauts/config.json) */
	projectSkills?: readonly string[];
	/** Thinking/reasoning level override */
	thinkingLevel?: ThinkingLevel;
	/** Compaction settings for the spawned session */
	compaction?: CompactionConfig;
	/** Callback for receiving Pi session events during the spawn */
	onEvent?: (event: SpawnEvent) => void;
	/** Nesting depth of this spawn (0 = top-level, increments for each layer) */
	spawnDepth?: number;
	/** Session ID of the parent agent that initiated this spawn */
	parentSessionId?: string;
	/** Plan slug for session lineage tracking */
	planSlug?: string;
}

/** Result of an agent execution */
export interface SpawnResult {
	/** Whether the agent completed successfully */
	success: boolean;
	/** Session ID */
	sessionId: string;
	/** Agent messages (conversation history) */
	messages: unknown[];
	/** Error if failed */
	error?: string;
	/** Session stats (tokens, cost, duration) — populated on success */
	stats?: SpawnStats;
}

/** Interface for spawning and running agents */
export interface AgentSpawner {
	spawn(config: SpawnConfig): Promise<SpawnResult>;
	dispose(): void;
}
