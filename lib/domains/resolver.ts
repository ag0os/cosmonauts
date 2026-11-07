/**
 * DomainResolver — three-tier path resolution for domain resources.
 *
 * Resolution order for any agent-scoped lookup:
 *   Tier 1: Agent's own domain
 *   Tier 2: Portable domains (in registry discovery order)
 *   Tier 3: Declared fallback domains (always last)
 *
 * Within a merged domain (multiple rootDirs), files are searched in
 * precedence order (rootDirs[0] = highest precedence) so that a
 * higher-precedence package's file wins over a lower-precedence one.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DomainRegistry } from "./registry.ts";
import type { LoadedDomain } from "./types.ts";

export class DomainResolver {
	private readonly _registry: DomainRegistry;

	constructor(registry: DomainRegistry) {
		this._registry = registry;
	}

	/** The underlying domain registry. */
	get registry(): DomainRegistry {
		return this._registry;
	}

	/**
	 * Static factory for backward-compatible single-directory use.
	 * Constructs a resolver from an array of already-loaded domains.
	 *
	 * @param _dir - The domains root directory (accepted for caller clarity, not used internally since domains carry their own rootDirs).
	 * @param domains - Pre-loaded domains from that directory.
	 */
	static fromSingleDir(_dir: string, domains: LoadedDomain[]): DomainResolver {
		return new DomainResolver(new DomainRegistry(domains));
	}

	/**
	 * Resolve a capability file path using three-tier order.
	 * Returns the path from the first domain that declares the capability,
	 * or undefined if no domain provides it.
	 */
	resolveCapabilityPath(
		name: string,
		agentDomain: string | undefined,
	): string | undefined {
		return this.resolveInTiers(
			agentDomain,
			(domain) => domain.capabilities.has(name),
			(domain) => findInRootDirs(domain.rootDirs, "capabilities", `${name}.md`),
		);
	}

	/**
	 * Resolve a persona prompt path using three-tier order.
	 * Returns the path from the first domain that declares the prompt,
	 * or undefined if no domain provides it.
	 */
	resolvePersonaPath(
		agentId: string,
		agentDomain: string | undefined,
	): string | undefined {
		return this.resolveInTiers(
			agentDomain,
			(domain) => domain.prompts.has(agentId),
			(domain) => findInRootDirs(domain.rootDirs, "prompts", `${agentId}.md`),
		);
	}

	/**
	 * Resolve an extension directory path using three-tier order.
	 * Returns the path from the first domain that declares the extension,
	 * or undefined if no domain provides it.
	 */
	resolveExtensionPath(
		name: string,
		agentDomain: string | undefined,
	): string | undefined {
		return this.resolveInTiers(
			agentDomain,
			(domain) => domain.extensions.has(name),
			(domain) => findInRootDirs(domain.rootDirs, "extensions", name),
		);
	}

	/**
	 * Returns all skill directories across all domains.
	 *
	 * Order: ordinary domains (registry order), then declared fallback domains.
	 * For merged domains with multiple rootDirs, includes the skills/
	 * directory from each rootDir (highest precedence first).
	 */
	allSkillDirs(): string[] {
		const domains = this._registry.listAll();
		return [
			...domains.filter((domain) => !domain.manifest.resourceFallback),
			...this._registry.listResourceFallbacks(),
		].flatMap((domain) =>
			domain.skills.size > 0
				? domain.rootDirs.map((root) => join(root, "skills"))
				: [],
		);
	}

	// ============================================================================
	// Private helpers
	// ============================================================================

	/**
	 * Walk domains in three-tier order and return the path from the first
	 * domain that satisfies the predicate.
	 */
	private resolveInTiers(
		agentDomain: string | undefined,
		hasResource: (domain: LoadedDomain) => boolean,
		buildPath: (domain: LoadedDomain) => string | undefined,
	): string | undefined {
		for (const domain of this._registry.resourceOrder(agentDomain)) {
			if (hasResource(domain)) {
				const path = buildPath(domain);
				if (path) return path;
			}
		}
		return undefined;
	}
}

// ============================================================================
// Module-level helpers
// ============================================================================

/**
 * Search through rootDirs in order (highest precedence first) and return the
 * first path where the file/directory exists. Falls back to rootDirs[0] if
 * the resource is not found in any rootDir (lets the caller produce a clear
 * ENOENT with the expected path).
 */
function findInRootDirs(
	rootDirs: readonly string[],
	...segments: string[]
): string | undefined {
	if (rootDirs.length === 0) return undefined;

	for (const rootDir of rootDirs) {
		const candidate = join(rootDir, ...segments);
		if (existsSync(candidate)) return candidate;
	}

	// Fallback: return the highest-precedence path so the caller gets a
	// meaningful ENOENT rather than undefined (the resource *is* declared).
	const firstDir = rootDirs[0];
	if (firstDir === undefined) return undefined;
	return join(firstDir, ...segments);
}
