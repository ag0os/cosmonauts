/**
 * Agent definition resolution helpers.
 * Resolves tool sets and extension paths from agent definitions.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResourceLoader } from "@mariozechner/pi-coding-agent";
import type { AgentToolSet } from "../agents/index.ts";
import type { DomainResolver } from "../domains/resolver.ts";

// ============================================================================
// Tool Resolution
// ============================================================================

/**
 * Resolve a tool set name to the Pi built-in tool-name allowlist.
 * Pi's createAgentSession binds these to the session cwd internally.
 */
export function resolveTools(toolSet: AgentToolSet, _cwd: string): string[] {
	switch (toolSet) {
		case "coding":
			return ["read", "bash", "edit", "write"];
		case "readonly":
			return ["read", "grep", "find", "ls"];
		case "verification":
			return ["read", "bash", "grep", "find", "ls"];
		case "none":
			return [];
	}
}

/**
 * Build the final tool allowlist passed to createAgentSession / createAgentSessionFromServices.
 *
 * In Pi 0.68+ the `tools` option is a global allowlist: any tool name not
 * listed — including extension tools like `spawn_agent`, `plan_*`, `task_*`,
 * `todo_*` — is disabled. resolveTools() returns only built-in names, so we
 * union the names registered by the loader's extensions to keep them callable.
 *
 * Returns an empty array only when the built-in allowlist is empty AND no
 * extensions registered tools, so agents with `tools: "none"` still gate
 * everything off when they load no extension tools.
 */
export function buildToolAllowlist(
	builtIns: readonly string[],
	loader: ResourceLoader,
): string[] {
	const names = new Set<string>(builtIns);
	for (const ext of loader.getExtensions().extensions) {
		for (const name of ext.tools.keys()) names.add(name);
	}
	return [...names];
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
