/**
 * Type definitions for the domain system.
 *
 * A DomainManifest declares a domain's identity and optional configuration.
 * A LoadedDomain represents a fully discovered domain with all its resources
 * indexed and ready for use by the agent system.
 */

import type { AgentDefinition } from "../agents/types.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";

/** Declarative configuration for a domain, exported from each domain's domain.ts. */
export interface DomainManifest {
	/** Unique domain identifier (e.g. "shared", "coding"). */
	readonly id: string;
	/** Human-readable description of the domain's purpose. */
	readonly description: string;
	/** Lead agent ID for this domain (e.g. "cosmo"). */
	readonly lead?: string;
	/** Default model in "provider/model-id" format for agents in this domain. */
	readonly defaultModel?: string;
}

/** A fully discovered and indexed domain, produced by the domain loader. */
export interface LoadedDomain {
	/** The domain's manifest. */
	readonly manifest: DomainManifest;
	/** Unqualified agent ID → definition. */
	readonly agents: Map<string, AgentDefinition>;
	/** Available capability names (from capabilities/*.md). */
	readonly capabilities: Set<string>;
	/** Available persona prompt names (from prompts/*.md). */
	readonly prompts: Set<string>;
	/** Available skill names (from skills/). */
	readonly skills: Set<string>;
	/** Available extension names (from extensions/). */
	readonly extensions: Set<string>;
	/** Workflow definitions from this domain. */
	readonly workflows: WorkflowDefinition[];
	/** Absolute path to the domain's root directory. */
	readonly rootDir: string;
}
