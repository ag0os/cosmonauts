/**
 * Type definitions for declarative agent configuration.
 *
 * An AgentDefinition describes an agent's identity and capabilities:
 * model, system prompt layers, tools, extensions, skill access, and
 * sub-agent permissions. Every agent — including Cosmo — is defined
 * the same way.
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

/** Tool set available to an agent. */
export type AgentToolSet = "coding" | "readonly" | "verification" | "none";

/** Session persistence mode. */
export type AgentSessionMode = "ephemeral" | "persistent";

/** Declarative configuration for an agent. */
export interface AgentDefinition {
	/** Unique agent identifier. */
	readonly id: string;
	/** Human-readable description. */
	readonly description: string;
	/** Capability pack names resolved to prompt files during assembly (e.g. ["tasks", "coding-readwrite", "spawning"]). */
	readonly capabilities: readonly string[];
	/** Default model in "provider/model-id" format. */
	readonly model: string;
	/** Tool set: "coding" (full), "readonly" (exploration), "none". */
	readonly tools: AgentToolSet;
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
	/** Domain this agent belongs to. Set at runtime by the domain loader, not in definition files. */
	domain?: string;
}
