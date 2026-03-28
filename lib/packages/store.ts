/**
 * On-disk store management for installed packages.
 * Handles both global (~/.cosmonauts/packages/) and local (.cosmonauts/packages/) scopes.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadManifest, validateManifest } from "./manifest.ts";
import type { InstalledPackage, PackageScope } from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

const PACKAGES_DIR = ".cosmonauts/packages";

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Returns the absolute path to the packages store root for a given scope.
 * Global scope: ~/.cosmonauts/packages/
 * Local scope: <projectRoot>/.cosmonauts/packages/
 */
function resolveStoreRoot(scope: PackageScope, projectRoot?: string): string {
	if (scope === "user") {
		return join(homedir(), PACKAGES_DIR);
	}
	if (!projectRoot) {
		throw new Error("projectRoot is required for project scope");
	}
	return join(projectRoot, PACKAGES_DIR);
}

/**
 * Returns the absolute path to a specific package's installation directory.
 *
 * @param name - Package name
 * @param scope - "user" (global) or "project" (local)
 * @param projectRoot - Required when scope is "project"
 */
export function resolveStorePath(
	name: string,
	scope: PackageScope,
	projectRoot?: string,
): string {
	return join(resolveStoreRoot(scope, projectRoot), name);
}

// ============================================================================
// Store Queries
// ============================================================================

/**
 * Lists all installed packages in a scope by reading their manifests.
 * Returns an empty array if the store directory does not exist.
 *
 * @param scope - "user" (global) or "project" (local)
 * @param projectRoot - Required when scope is "project"
 */
export async function listInstalledPackages(
	scope: PackageScope,
	projectRoot?: string,
): Promise<InstalledPackage[]> {
	const storeRoot = resolveStoreRoot(scope, projectRoot);

	let entries: string[];
	try {
		entries = await readdir(storeRoot);
	} catch {
		// Missing store directory is not an error
		return [];
	}

	const packages: InstalledPackage[] = [];

	for (const entry of entries) {
		const installPath = join(storeRoot, entry);

		let dirStat: Awaited<ReturnType<typeof stat>>;
		try {
			dirStat = await stat(installPath);
		} catch {
			continue;
		}
		if (!dirStat.isDirectory()) continue;

		let raw: unknown;
		try {
			raw = await loadManifest(installPath);
		} catch {
			// Skip packages with missing or unreadable manifests
			continue;
		}

		const result = validateManifest(raw);
		if (!result.valid) continue;

		packages.push({
			manifest: result.manifest,
			installPath,
			scope,
			installedAt: dirStat.birthtime,
		});
	}

	return packages;
}

/**
 * Returns true if a package directory with a valid cosmonauts.json exists.
 *
 * @param name - Package name
 * @param scope - "user" (global) or "project" (local)
 * @param projectRoot - Required when scope is "project"
 */
export async function packageExists(
	name: string,
	scope: PackageScope,
	projectRoot?: string,
): Promise<boolean> {
	const installPath = resolveStorePath(name, scope, projectRoot);

	let raw: unknown;
	try {
		raw = await loadManifest(installPath);
	} catch {
		return false;
	}

	const result = validateManifest(raw);
	return result.valid;
}
