/**
 * Package scanner — discovers DomainSource[] from all package sources.
 * Scans built-in domains, global store, local store, and optional plugin dirs
 * in precedence order: built-in (0) → global (1) → local (2) → plugin (3).
 */

import { listInstalledPackages } from "./store.ts";
import type { DomainSource } from "./types.ts";

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
	for (const pkg of globalPackages) {
		if (pkg.manifest.domains.length === 0) continue;
		sources.push({
			domainsDir: pkg.installPath,
			origin: `global:${pkg.manifest.name}`,
			precedence: 1,
		});
	}

	// Local packages (project scope)
	const localPackages = await listInstalledPackages("project", projectRoot);
	for (const pkg of localPackages) {
		if (pkg.manifest.domains.length === 0) continue;
		sources.push({
			domainsDir: pkg.installPath,
			origin: `local:${pkg.manifest.name}`,
			precedence: 2,
		});
	}

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
