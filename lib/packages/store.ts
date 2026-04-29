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

interface CandidatePackageDir {
	path: string;
	birthtime: Date;
}

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
	const entries = await readStoreEntries(storeRoot);
	const candidateDirs = await collectCandidatePackageDirs(storeRoot, entries);
	const packages: InstalledPackage[] = [];

	for (const { path: installPath, birthtime } of candidateDirs) {
		const installedPackage = await readInstalledPackage(
			installPath,
			birthtime,
			scope,
		);
		if (installedPackage) {
			packages.push(installedPackage);
		}
	}

	return packages;
}

async function readStoreEntries(storeRoot: string): Promise<string[]> {
	try {
		return await readdir(storeRoot);
	} catch {
		return [];
	}
}

async function collectCandidatePackageDirs(
	storeRoot: string,
	entries: readonly string[],
): Promise<CandidatePackageDir[]> {
	const candidateDirs: CandidatePackageDir[] = [];

	for (const entry of entries) {
		const entryPath = join(storeRoot, entry);

		let dirStat: Awaited<ReturnType<typeof stat>>;
		try {
			dirStat = await stat(entryPath);
		} catch {
			continue;
		}
		if (!dirStat.isDirectory()) continue;

		if (entry.startsWith("@")) {
			candidateDirs.push(...(await collectScopedPackageDirs(entryPath)));
			continue;
		}

		candidateDirs.push({ path: entryPath, birthtime: dirStat.birthtime });
	}

	return candidateDirs;
}

async function collectScopedPackageDirs(
	scopeDir: string,
): Promise<CandidatePackageDir[]> {
	let scopeEntries: string[];
	try {
		scopeEntries = await readdir(scopeDir);
	} catch {
		return [];
	}

	const candidateDirs: CandidatePackageDir[] = [];
	for (const scopeChild of scopeEntries) {
		const childPath = join(scopeDir, scopeChild);

		let childStat: Awaited<ReturnType<typeof stat>>;
		try {
			childStat = await stat(childPath);
		} catch {
			continue;
		}

		if (childStat.isDirectory()) {
			candidateDirs.push({
				path: childPath,
				birthtime: childStat.birthtime,
			});
		}
	}

	return candidateDirs;
}

async function readInstalledPackage(
	installPath: string,
	birthtime: Date,
	scope: PackageScope,
): Promise<InstalledPackage | undefined> {
	let raw: unknown;
	try {
		raw = await loadManifest(installPath);
	} catch {
		return undefined;
	}

	const result = validateManifest(raw);
	if (!result.valid) {
		return undefined;
	}

	return {
		manifest: result.manifest,
		installPath,
		scope,
		installedAt: birthtime,
	};
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
