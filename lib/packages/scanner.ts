/**
 * Package scanner — discovers DomainSource[] from all package sources.
 * Scans built-in domains, global store, local store, and optional plugin dirs
 * in precedence order: built-in (0) → bundled (0.5) → global (1) → user-domains (1.5) → local (2) → project-domains (2.5) → plugin (3).
 */

import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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
	/**
	 * Optional bundled package directories for framework dev-mode auto-include.
	 * Lower precedence than global packages — global overrides bundled, local
	 * overrides global.
	 */
	bundledDirs?: string[];
	/** Optional extra domain source directories (e.g. from --plugin-dir flag). */
	pluginDirs?: string[];
}

/**
 * Scan all package sources and return an ordered DomainSource[].
 *
 * Precedence order (lowest to highest):
 *   0   — framework built-in domains directory
 *   0.5 — bundled packages (framework dev-mode only)
 *   1   — global (user-scope) installed packages
 *   1.5 — user-domains directory (~/.cosmonauts/domains/)
 *   2   — local (project-scope) installed packages
 *   2.5 — project-domains directory (.cosmonauts/domains/)
 *   3   — plugin dirs (session-only, highest precedence)
 *
 * Packages with no declared domains are skipped.
 */
export async function scanDomainSources(
	options: ScanDomainSourcesOptions,
): Promise<DomainSource[]> {
	const { builtinDomainsDir, projectRoot, bundledDirs, pluginDirs } = options;
	const sources: DomainSource[] = [];

	// Built-in: the framework's domains directory
	sources.push({
		domainsDir: builtinDomainsDir,
		origin: "builtin",
		precedence: 0,
	});

	// Bundled packages: framework dev-mode auto-include (lower than global)
	if (bundledDirs) {
		for (const dir of bundledDirs) {
			sources.push({
				domainsDir: dir,
				origin: `bundled:${basename(dir)}`,
				precedence: 0.5,
			});
		}
	}

	// Global packages (user scope)
	const globalPackages = await listInstalledPackages("user");
	addPackageSources(sources, globalPackages, "global", 1);

	// User-domains: ~/.cosmonauts/domains/
	const userDomainsDir = join(homedir(), ".cosmonauts", "domains");
	try {
		const userDomainsStat = await stat(userDomainsDir);
		if (userDomainsStat.isDirectory()) {
			sources.push({
				domainsDir: userDomainsDir,
				origin: "user-domains",
				precedence: 1.5,
			});
		}
	} catch {
		// Directory does not exist — skip silently
	}

	// Local packages (project scope)
	const localPackages = await listInstalledPackages("project", projectRoot);
	addPackageSources(sources, localPackages, "local", 2);

	// Project-domains: .cosmonauts/domains/ relative to projectRoot
	const projectDomainsDir = join(projectRoot, ".cosmonauts", "domains");
	try {
		const projectDomainsStat = await stat(projectDomainsDir);
		if (projectDomainsStat.isDirectory()) {
			sources.push({
				domainsDir: projectDomainsDir,
				origin: "project-domains",
				precedence: 2.5,
			});
		}
	} catch {
		// Directory does not exist — skip silently
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
