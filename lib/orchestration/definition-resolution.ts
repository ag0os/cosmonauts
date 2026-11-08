/**
 * Agent definition resolution helpers.
 * Resolves tool sets and extension paths from agent definitions.
 */

import { existsSync, statSync } from "node:fs";
import type { ResourceLoader } from "@earendil-works/pi-coding-agent";
import type { AgentDefinition } from "../agents/types.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { directoryResourcePaths } from "../domains/resource-paths.ts";
import { KNOWLEDGE_SURFACE_EXTENSION_NAME } from "../extensions/knowledge-surface/constants.ts";

// ============================================================================
// Tool Resolution
// ============================================================================

/**
 * Resolve a tool set name to the Pi built-in tool-name allowlist.
 * Pi's createAgentSession binds these to the session cwd internally.
 */
export function resolveTools(
	toolSet: AgentDefinition["tools"],
	_cwd: string,
): string[] {
	if (typeof toolSet !== "string") return [...new Set(toolSet)];
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
	exact = false,
): string[] {
	if (exact) {
		const available = new Set([
			"read",
			"bash",
			"powershell",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
			...loader
				.getExtensions()
				.extensions.flatMap((ext) => [...ext.tools.keys()]),
		]);
		for (const name of builtIns) {
			if (!available.has(name))
				throw new Error(`Unknown tool in agent declaration: ${name}`);
		}
		return [...new Set(builtIns)];
	}
	const names = new Set<string>(builtIns);
	for (const ext of loader.getExtensions().extensions) {
		for (const name of ext.tools.keys()) names.add(name);
	}
	return [...names];
}

/** Fail closed if an enabled session does not own exactly one framework recall. */
export function assertEnabledRecallOwner(
	loader: ResourceLoader,
	required = true,
): void {
	const expectedOwner = `<inline:${KNOWLEDGE_SURFACE_EXTENSION_NAME}>`;
	const owners = loader
		.getExtensions()
		.extensions.filter((extension) => extension.tools.has("recall"))
		.map((extension) => extension.path);

	if (!required && owners.length === 0) return;
	if (required && owners.length === 1 && owners[0] === expectedOwner) return;

	const namedOwners = owners.length > 0 ? owners : ["<none>"];
	throw new Error(
		`Enabled knowledge surface requires exactly one framework recall owned by ${expectedOwner}; found ${namedOwners.length === 1 && namedOwners[0] === "<none>" ? "no registered recall" : `recall owners ${namedOwners.map((owner) => JSON.stringify(owner)).join(" and ")}`}. Remove or rename the conflicting extension tool.`,
	);
}

// ============================================================================
// Extension Resolution
// ============================================================================

/** Options for domain-aware extension resolution. */
export interface ResolveExtensionOptions {
	/** Resource identity, independent of the agent identity. */
	readonly domain?: string;
	readonly fallbackDomains?: readonly string[];
	/** Absolute path to the root domains directory. Required when no resolver is provided. */
	readonly domainsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	readonly resolver?: DomainResolver;
}

/** Resolve extensions through a resolver, then explicitly supplied directory providers. */
export class UnknownExtensionError extends Error {
	constructor(name: string, searched: string) {
		super(
			`Unknown extension "${name}" in agent definition. Searched: ${searched}`,
		);
	}
}

export function resolveExtensionPaths(
	extensions: readonly string[],
	options: ResolveExtensionOptions,
): string[] {
	const { domain, resolver } = options;
	return extensions.map((name) => {
		// Prefer resolver for multi-source resolution (own domain → portable → declared fallback)
		if (resolver) {
			const resolved = resolver.resolveExtensionPath(name, domain);
			if (resolved && isDirectory(resolved)) return resolved;
		}

		const paths = directoryResourcePaths({
			...options,
			kind: "extensions",
			filename: name,
		});
		const path = paths.find(isDirectory);
		if (path) return path;
		const searched = paths.length
			? paths.join(", ")
			: "declared resource providers (none available)";
		throw new UnknownExtensionError(name, searched);
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
