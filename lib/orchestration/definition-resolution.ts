/**
 * Agent definition resolution helpers.
 * Resolves tool sets and extension paths from agent definitions.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	createCodingTools,
	createReadOnlyTools,
} from "@mariozechner/pi-coding-agent";
import type { AgentToolSet } from "../agents/index.ts";
import type { DomainResolver } from "../domains/resolver.ts";

// ============================================================================
// Tool Resolution
// ============================================================================

/**
 * Resolve a tool set name to the appropriate Pi tools for a given cwd.
 * Uses factory functions so tools resolve paths relative to the agent's cwd.
 */
export function resolveTools(toolSet: AgentToolSet, cwd: string) {
	switch (toolSet) {
		case "coding":
			return createCodingTools(cwd);
		case "readonly":
			return createReadOnlyTools(cwd);
		case "none":
			return [];
	}
}

// ============================================================================
// Extension Resolution
// ============================================================================

/** Options for domain-aware extension resolution. */
export interface ResolveExtensionOptions {
	/** Domain the agent belongs to (e.g. "coding", "shared"). */
	readonly domain: string;
	/** Absolute path to the root domains directory. Required when no resolver is provided. */
	readonly domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	readonly resolver?: DomainResolver;
}

/**
 * Resolve extension names to absolute paths with domain-aware lookup.
 *
 * Resolution order per extension name:
 *  1. `domains/<domain>/extensions/<name>` (if domain is not "shared")
 *  2. `domains/shared/extensions/<name>` (fallback)
 *
 * Throws if an extension name cannot be found in either location.
 */
export function resolveExtensionPaths(
	extensions: readonly string[],
	options: ResolveExtensionOptions,
): string[] {
	const { domain, domainsDir, resolver } = options;
	return extensions.map((name) => {
		// Prefer resolver for multi-source resolution (agent domain → portable → shared)
		if (resolver) {
			const resolved = resolver.resolveExtensionPath(name, domain);
			if (resolved && isDirectory(resolved)) return resolved;
		}

		// Fallback: two-tier directory-based resolution (requires domainsDir)
		if (domainsDir) {
			// Try domain-specific path first (skip if already "shared")
			if (domain !== "shared") {
				const domainPath = join(domainsDir, domain, "extensions", name);
				if (isDirectory(domainPath)) return domainPath;
			}

			// Fall back to shared
			const sharedPath = join(domainsDir, "shared", "extensions", name);
			if (isDirectory(sharedPath)) return sharedPath;
		}

		// Not found anywhere — fail loud
		const searched =
			domain !== "shared"
				? `domains/${domain}/extensions/${name}, domains/shared/extensions/${name}`
				: `domains/shared/extensions/${name}`;
		throw new Error(
			`Unknown extension "${name}" in agent definition. Searched: ${searched}`,
		);
	});
}

/** Check if a path is an existing directory. */
export function isDirectory(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}
