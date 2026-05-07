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
	/** Lead agent ID for this domain (e.g. "cody"). */
	readonly lead?: string;
	/** Default model in "provider/model-id" format for agents in this domain. */
	readonly defaultModel?: string;
	/** Whether this domain is portable (can be installed as a package). Defaults to false. */
	readonly portable?: boolean;
}

/** A fully discovered and indexed domain, produced by the domain loader. */
export interface LoadedDomain {
	/** The domain's manifest. */
	readonly manifest: DomainManifest;
	/** Whether this domain is portable. Defaults to false for domains without the field. */
	readonly portable: boolean;
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
	/**
	 * Absolute paths to the domain's root directories, ordered by descending precedence.
	 * Single-source domains have one entry. Merged domains have multiple entries,
	 * with the highest-precedence source first.
	 */
	readonly rootDirs: readonly string[];
}

// ============================================================================
// Multi-source loading types
// ============================================================================

/**
 * Describes a source of domains for multi-source loading.
 * Used with loadDomainsFromSources() to combine domains from multiple locations.
 */
export interface DomainSource {
	/** Absolute path to a directory containing domain subdirectories. */
	domainsDir: string;
	/** Human-readable label identifying this source (e.g., "built-in", "user-package"). */
	origin: string;
	/** Precedence level. Higher numbers win on resource conflicts during merging. */
	precedence: number;
}

/**
 * Describes a conflict when the same domain ID appears in multiple sources.
 * Passed to a MergeStrategy callback to decide how to resolve it.
 */
export interface DomainMergeConflict {
	/** The domain ID that appears in both sources. */
	domainId: string;
	/** The domain accumulated so far (from lower-precedence sources). */
	existing: LoadedDomain;
	/** The domain from the current higher-precedence source. */
	incoming: LoadedDomain;
	/** Resource names that exist in both domains. */
	overlapping: {
		agents: string[];
		capabilities: string[];
		skills: string[];
		extensions: string[];
		prompts: string[];
	};
}

/**
 * Callback invoked for each same-ID domain conflict during multi-source loading.
 * Returns how to resolve the conflict:
 * - "merge"   — union of resources; incoming (higher precedence) wins on key conflicts.
 * - "replace" — incoming domain completely replaces the existing one.
 * - "skip"    — incoming domain is discarded; existing domain is kept unchanged.
 */
export type MergeStrategy = (
	conflict: DomainMergeConflict,
) => "merge" | "replace" | "skip";
