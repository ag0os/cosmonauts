/**
 * Type definitions for declarative agent configuration.
 *
 * An AgentDefinition describes an agent's identity and capabilities:
 * model, system prompt layers, tools, extensions, skill access, and
 * sub-agent permissions. Every agent — including Cosmo — is defined
 * the same way.
 */

/**
 * Reasoning effort for an agent. A copy of Pi's `ThinkingLevel`, so modules
 * that never start a Pi session need not import Pi; `session-assembly.ts`
 * checks it stays assignable to Pi's type.
 */
export type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

/** Tool set available to an agent. */
export type AgentToolSet = "coding" | "readonly" | "verification" | "none";

/** Session persistence mode. */
export type AgentSessionMode = "ephemeral" | "persistent";

/** Consumer-supplied persona instructions. File paths must be absolute. */
export type AgentInstructions =
	| { readonly kind: "inline"; readonly content: string }
	| { readonly kind: "file"; readonly path: string };

/** Host permissions; knowledge defaults on, other groups default off. */
export interface AgentMemoryGrants {
	readonly knowledge?: boolean;
	readonly authored?: boolean;
	readonly proposals?: boolean;
	readonly architecture?: boolean;
	readonly episodes?: boolean;
}

/** Declarative configuration for an agent. */
export interface AgentDefinition {
	/** Unique agent identifier. */
	readonly id: string;
	/** Human-readable description. */
	readonly description: string;
	readonly instructions?: AgentInstructions;
	/** Resource lookup scope, independent of identity and internal visibility. */
	readonly resourceDomain?: string;
	readonly memory?: AgentMemoryGrants;
	/** Capability pack names resolved to prompt files during assembly (e.g. ["tasks", "coding-readwrite", "spawning"]). */
	readonly capabilities: readonly string[];
	/** Default model in "provider/model-id" format. */
	readonly model: string;
	/** Tool set: "coding" (full), "readonly" (exploration), "none". */
	readonly tools: AgentToolSet | readonly string[];
	/** Pi extension directory names to load (e.g. "tasks"). */
	readonly extensions: readonly string[];
	/** Skill access: `["*"]` = all, `[]` = none, `[...names]` = allowlist. */
	readonly skills: readonly string[];
	/** Agent IDs this agent can spawn as sub-agents. */
	readonly subagents?: readonly string[];
	/** Whether to load project context (AGENTS.md/CLAUDE.md). */
	readonly projectContext: boolean;
	/** Session persistence mode. */
	readonly session: AgentSessionMode;
	/** Whether this agent loops in chain stages (vs one-shot). */
	readonly loop: boolean;
	/** Optional thinking/reasoning level for this agent. */
	readonly thinkingLevel?: ThinkingLevel;
	/** Identity namespace supplied by a consumer or directory loader. Prefixes id verbatim; omit for a pre-qualified id. */
	domain?: string;
}
