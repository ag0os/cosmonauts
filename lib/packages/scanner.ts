/**
 * Package scanner — discovers DomainSource[] from all package sources.
 * Scans built-in domains, global store, local store, and optional plugin dirs
 * in precedence order: built-in (0) → global (1) → local (2) → plugin (3).
 */

import { dirname, join } from "node:path";
import { listInstalledPackages } from "./store.ts";
import type { DomainSource, InstalledPackage } from "./types.ts";

// ============================================================================
// Public API
// ============================================================================

export interface ScanDomainSourcesOptions {
	/** Absolute path to the framework's built-in domains directory. */
	builtinDomainsDir: string;
	/** Absolute path to the project root (used to locate the local package store). */
	projectRoot: string;
	/** Optional extra domain source directories (e.g. from --plugin-dir flag). */
	pluginDirs?: string[];
}

/**
 * Scan all package sources and return an ordered DomainSource[].
 *
 * Precedence order (lowest to highest):
 *   0 — framework built-in domains directory
 *   1 — global (user-scope) installed packages
 *   2 — local (project-scope) installed packages
 *   3 — plugin dirs (session-only, highest precedence)
 *
 * Packages with no declared domains are skipped.
 */
export async function scanDomainSources(
	options: ScanDomainSourcesOptions,
): Promise<DomainSource[]> {
	const { builtinDomainsDir, projectRoot, pluginDirs } = options;
	const sources: DomainSource[] = [];

	// Built-in: the framework's domains directory
	sources.push({
		domainsDir: builtinDomainsDir,
		origin: "builtin",
		precedence: 0,
	});

	// Global packages (user scope)
	const globalPackages = await listInstalledPackages("user");
	addPackageSources(sources, globalPackages, "global", 1);

	// Local packages (project scope)
	const localPackages = await listInstalledPackages("project", projectRoot);
	addPackageSources(sources, localPackages, "local", 2);

	// Plugin dirs: session-only sources, not stored in the package store
	if (pluginDirs) {
		for (const dir of pluginDirs) {
			sources.push({
				domainsDir: dir,
				origin: dir,
				precedence: 3,
			});
		}
	}

	return sources;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Add domain sources for each domain declared in each package.
 *
 * Uses `PackageDomain.path` to resolve the actual domain directory within
 * the package root, then exposes the *parent* of that directory as the
 * `domainsDir` (since `loadDomains()` scans immediate children).
 *
 * For the common case where `path` equals `name` (e.g. `{ name: "coding",
 * path: "coding" }`), the parent is `pkg.installPath` itself.
 */
function addPackageSources(
	sources: DomainSource[],
	packages: InstalledPackage[],
	scopeLabel: string,
	precedence: number,
): void {
	for (const pkg of packages) {
		if (pkg.manifest.domains.length === 0) continue;

		// Deduplicate parent dirs when multiple domains share the same parent
		const parentDirs = new Set<string>();
		for (const domain of pkg.manifest.domains) {
			const domainAbsPath = join(pkg.installPath, domain.path);
			parentDirs.add(dirname(domainAbsPath));
		}

		for (const parentDir of parentDirs) {
			sources.push({
				domainsDir: parentDir,
				origin: `${scopeLabel}:${pkg.manifest.name}`,
				precedence,
			});
		}
	}
}
