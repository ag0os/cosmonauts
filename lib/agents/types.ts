/**
 * Type definitions for declarative agent configuration.
 *
 * An AgentDefinition describes an agent's identity and capabilities:
 * model, system prompt layers, tools, extensions, skill access, and
 * sub-agent permissions. Every agent — including Cosmo — is defined
 * the same way.
 */

/** Tool set available to an agent. */
export type AgentToolSet = "coding" | "readonly" | "none";

/** Session persistence mode. */
export type AgentSessionMode = "ephemeral" | "persistent";

/** Declarative configuration for an agent. */
export interface AgentDefinition {
	/** Unique agent identifier. */
	readonly id: string;
	/** Prompt namespace for migration compatibility (e.g. "coding"). Optional for external definitions. */
	readonly namespace?: string;
	/** Human-readable description. */
	readonly description: string;
	/** System prompt layer paths, composed in order: base, capabilities, persona. */
	readonly prompts: readonly string[];
	/** Default model in "provider/model-id" format. */
	readonly model: string;
	/** Tool set: "coding" (full), "readonly" (exploration), "none". */
	readonly tools: AgentToolSet;
	/** Pi extension directory names to load (e.g. "tasks"). */
	readonly extensions: readonly string[];
	/** Skill access: undefined = all, [] = none, [...] = allowlist. */
	readonly skills?: readonly string[];
	/** Agent IDs this agent can spawn as sub-agents. */
	readonly subagents?: readonly string[];
	/** Whether to load project context (AGENTS.md/CLAUDE.md). */
	readonly projectContext: boolean;
	/** Session persistence mode. */
	readonly session: AgentSessionMode;
	/** Whether this agent loops in chain stages (vs one-shot). */
	readonly loop: boolean;
}
