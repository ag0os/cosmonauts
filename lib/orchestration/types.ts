/**
 * Type definitions for the chain runner orchestration system.
 */

// ============================================================================
// Agent Roles
// ============================================================================

/** Agent roles as defined in DESIGN.md */
export type AgentRole = "planner" | "task-manager" | "coordinator" | "worker";

/** Whether a role loops until done or runs once. */
export const ROLE_LIFECYCLE: Record<AgentRole, boolean> = {
	planner: false,
	"task-manager": false,
	coordinator: true,
	worker: false,
};

/**
 * Returns true if the given role is a loop stage (repeats until done).
 * Unknown roles default to one-shot.
 */
export function isLoopRole(role: string): boolean {
	return ROLE_LIFECYCLE[role as AgentRole] ?? false;
}

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
	/** Fallback model for unknown roles */
	default?: string;
}

/** Configuration for a chain execution */
export interface ChainConfig {
	/** Chain stages to execute (parsed from DSL or provided directly) */
	stages: ChainStage[];
	/** Project root directory (for task system, cwd) */
	projectRoot: string;
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
}

// ============================================================================
// Events
// ============================================================================

export type ChainEvent =
	| { type: "chain_start"; stages: ChainStage[] }
	| { type: "chain_end"; result: ChainResult }
	| { type: "stage_start"; stage: ChainStage; stageIndex: number }
	| { type: "stage_end"; stage: ChainStage; result: StageResult }
	| { type: "stage_iteration"; stage: ChainStage; iteration: number }
	| { type: "agent_spawned"; role: string; sessionId: string }
	| { type: "agent_completed"; role: string; sessionId: string }
	| { type: "error"; message: string; stage?: ChainStage };

// ============================================================================
// Agent Spawner
// ============================================================================

/** Configuration for spawning an agent */
export interface SpawnConfig {
	/** Agent role to spawn */
	role: string;
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
}

/** Interface for spawning and running agents */
export interface AgentSpawner {
	spawn(config: SpawnConfig): Promise<SpawnResult>;
	dispose(): void;
}
