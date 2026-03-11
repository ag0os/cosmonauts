/**
 * Type definitions for the chain runner orchestration system.
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { AgentRegistry } from "../agents/resolver.ts";

// ============================================================================
// Agent Roles
// ============================================================================

/** Agent roles as defined in AGENTS.md */
export type AgentRole =
	| "planner"
	| "task-manager"
	| "coordinator"
	| "worker"
	| "quality-manager"
	| "reviewer"
	| "fixer";

// ============================================================================
// Chain DSL Types
// ============================================================================

/** A single stage in a chain pipeline */
export interface ChainStage {
	/** Agent role name (matches AgentRole or custom skill name) */
	name: string;
	/** Whether this stage loops until its completion check passes */
	loop: boolean;
	/** Optional completion check — loop exits when it returns true */
	completionCheck?: (projectRoot: string) => Promise<boolean>;
	/** Optional prompt override — replaces the default stage prompt */
	prompt?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Model assignment per agent role */
export interface ModelConfig {
	/** Model for planner agents (default: opus) */
	planner?: string;
	/** Model for task-manager agents (default: sonnet) */
	taskManager?: string;
	/** Model for coordinator agents (default: sonnet) */
	coordinator?: string;
	/** Model for worker agents (default: sonnet) */
	worker?: string;
	/** Model for quality-manager agents */
	qualityManager?: string;
	/** Model for reviewer agents */
	reviewer?: string;
	/** Model for fixer agents */
	fixer?: string;
	/** Fallback model for unknown roles */
	default?: string;
}

/** Thinking level assignment per agent role */
export interface ThinkingConfig {
	/** Thinking level for planner agents */
	planner?: ThinkingLevel;
	/** Thinking level for task-manager agents */
	taskManager?: ThinkingLevel;
	/** Thinking level for coordinator agents */
	coordinator?: ThinkingLevel;
	/** Thinking level for worker agents */
	worker?: ThinkingLevel;
	/** Thinking level for quality-manager agents */
	qualityManager?: ThinkingLevel;
	/** Thinking level for reviewer agents */
	reviewer?: ThinkingLevel;
	/** Thinking level for fixer agents */
	fixer?: ThinkingLevel;
	/** Fallback thinking level for unknown roles */
	default?: ThinkingLevel;
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
	/** Chain stages to execute (parsed from DSL or provided directly) */
	stages: ChainStage[];
	/** Project root directory (for task system, cwd) */
	projectRoot: string;
	/** Default domain context for resolving unqualified stage names. */
	domainContext?: string;
	/** Model overrides per role */
	models?: ModelConfig;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Callback for progress events */
	onEvent?: (event: ChainEvent) => void;
	/** Global safety cap: max total iterations across all loop stages (default: 50) */
	maxTotalIterations?: number;
	/** Global safety cap: timeout in milliseconds (default: 30 minutes) */
	timeoutMs?: number;
	/** Project-level skill filter list (from .cosmonauts/config.json) */
	projectSkills?: readonly string[];
	/** Optional task label scope for default completion checks (e.g. plan:<slug>). */
	completionLabel?: string;
	/** Thinking level overrides per role */
	thinking?: ThinkingConfig;
	/** Compaction settings for spawned agent sessions */
	compaction?: CompactionConfig;
	/** Agent registry for resolving agent definitions. */
	registry: AgentRegistry;
	/** Absolute path to the root domains directory. Computed from package root if not provided. */
	domainsDir?: string;
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

/** Result of executing a single stage */
export interface StageResult {
	/** Stage that was executed */
	stage: ChainStage;
	/** Whether the stage completed successfully */
	success: boolean;
	/** Number of iterations actually executed (for loop stages) */
	iterations: number;
	/** Duration in milliseconds */
	durationMs: number;
	/** Error message if failed */
	error?: string;
	/** Aggregated stats across all iterations in this stage */
	stats?: SpawnStats;
}

/** Result of executing a full chain */
export interface ChainResult {
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

export type SpawnEvent =
	| (SpawnEventBase & { type: "turn_start" })
	| (SpawnEventBase & { type: "turn_end" })
	| (SpawnEventBase & {
			type: "tool_execution_start";
			toolName: string;
			toolCallId: string;
	  })
	| (SpawnEventBase & {
			type: "tool_execution_end";
			toolName: string;
			toolCallId: string;
			isError: boolean;
	  })
	| (SpawnEventBase & {
			type: "auto_compaction_start";
			reason: "threshold" | "overflow";
	  })
	| (SpawnEventBase & { type: "auto_compaction_end"; aborted: boolean });

export type ChainEvent =
	| { type: "chain_start"; stages: ChainStage[] }
	| { type: "chain_end"; result: ChainResult }
	| { type: "stage_start"; stage: ChainStage; stageIndex: number }
	| { type: "stage_end"; stage: ChainStage; result: StageResult }
	| { type: "stage_stats"; stage: ChainStage; stats: SpawnStats }
	| { type: "stage_iteration"; stage: ChainStage; iteration: number }
	| { type: "agent_spawned"; role: string; sessionId: string }
	| { type: "agent_completed"; role: string; sessionId: string }
	| { type: "agent_turn"; role: string; sessionId: string; event: SpawnEvent }
	| {
			type: "agent_tool_use";
			role: string;
			sessionId: string;
			event: SpawnEvent;
	  }
	| { type: "error"; message: string; stage?: ChainStage };

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

/** Configuration for spawning an agent */
export interface SpawnConfig {
	/** Agent role to spawn */
	role: string;
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
