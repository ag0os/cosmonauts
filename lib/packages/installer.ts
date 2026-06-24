/**
 * Package installer
 * Handles local copy, symlink, and git clone installation into the package store.
 */

import { spawn } from "node:child_process";
import {
	cp,
	mkdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	loadManifest,
	normalizePackageDomainPath,
	validateManifest,
} from "./manifest.ts";
import { listInstalledPackages, resolveStorePath } from "./store.ts";
import type {
	ManifestValidationError,
	PackageManifest,
	PackageScope,
} from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export interface InstallOptions {
	/** Local filesystem path or URL (https://, github:owner/repo, or file://) */
	source: string;
	/** Installation scope */
	scope: PackageScope;
	/** Required when scope is "project" */
	projectRoot?: string;
	/** Create a symlink instead of copying (local paths only, ignored for git sources) */
	link?: boolean;
	/** Git branch or tag to checkout (git sources only) */
	branch?: string;
	/** When installing from a catalog, the catalog entry short name (e.g., "coding") */
	catalogName?: string;
}

/** A domain ID conflict detected during installation */
export interface DomainMergeResult {
	/** The domain ID provided by both the new and an existing package */
	domainId: string;
	/** The already-installed package that also provides this domain */
	existingPackage: string;
}

/** Result of a successful installation */
export interface InstallResult {
	manifest: PackageManifest;
	installedTo: string;
	domainMergeResults: DomainMergeResult[];
}

// ============================================================================
// Install metadata
// ============================================================================

export type InstallMeta =
	| { source: "catalog"; catalogName: string; installedAt: string }
	| { source: "git"; url: string; branch: string | null; installedAt: string }
	| { source: "local"; originalPath: string; installedAt: string }
	| { source: "link"; targetPath: string; installedAt: string };

export async function loadInstallMeta(
	installDir: string,
): Promise<InstallMeta | null> {
	try {
		const raw = await readFile(
			join(installDir, ".cosmonauts-meta.json"),
			"utf-8",
		);
		return JSON.parse(raw) as InstallMeta;
	} catch {
		return null;
	}
}

async function writeInstallMeta(
	installDir: string,
	meta: InstallMeta,
): Promise<void> {
	await writeFile(
		join(installDir, ".cosmonauts-meta.json"),
		JSON.stringify(meta, null, 2),
		"utf-8",
	);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Install a package from a local path or git URL.
 *
 * Source formats:
 * - Local path: /abs/path or ./rel/path
 * - HTTPS URL:  https://github.com/owner/repo
 * - GitHub shorthand: github:owner/repo
 *
 * Validates the manifest and all declared domain directories before writing
 * anything to the store.
 */
export async function installPackage(
	options: InstallOptions,
): Promise<InstallResult> {
	const {
		source,
		scope,
		projectRoot,
		link = false,
		branch,
		catalogName,
	} = options;

	const isGitSource =
		source.startsWith("https://") ||
		source.startsWith("github:") ||
		source.startsWith("file://");

	let sourceDir: string;
	let tempDir: string | undefined;

	if (isGitSource) {
		tempDir = await makeTempDir();
		sourceDir = join(tempDir, "clone");
		const url = resolveGitUrl(source);
		await shallowClone(url, sourceDir, branch);
	} else {
		sourceDir = source;
	}

	try {
		// Validate manifest — fails fast with a clear error
		const manifest = await readAndValidateManifest(sourceDir);

		// Validate package-root domain semantics before any store writes
		await assertRootDomainPackageSemantics(sourceDir, manifest);

		// Validate every declared domain directory exists
		await assertDomainDirectoriesExist(sourceDir, manifest);

		const installPath = resolveStorePath(manifest.name, scope, projectRoot);

		// Check for domain conflicts against already-installed packages
		const domainMergeResults = await detectDomainConflicts(
			manifest,
			scope,
			projectRoot,
		);

		// Ensure store parent directory exists
		await mkdir(dirname(installPath), { recursive: true });

		const installedAt = new Date().toISOString();

		if (link && !isGitSource) {
			const targetPath = resolve(sourceDir);
			await symlink(targetPath, installPath);
			await writeInstallMeta(installPath, {
				source: "link",
				targetPath,
				installedAt,
			});
		} else {
			await cp(sourceDir, installPath, { recursive: true });
			if (isGitSource) {
				await writeInstallMeta(installPath, {
					source: "git",
					url: resolveGitUrl(source),
					branch: branch ?? null,
					installedAt,
				});
			} else if (catalogName !== undefined) {
				await writeInstallMeta(installPath, {
					source: "catalog",
					catalogName,
					installedAt,
				});
			} else {
				await writeInstallMeta(installPath, {
					source: "local",
					originalPath: resolve(sourceDir),
					installedAt,
				});
			}
		}

		return { manifest, installedTo: installPath, domainMergeResults };
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	}
}

/**
 * Remove a package from the store.
 * Returns true if the package was found and removed, false if it did not exist.
 */
export async function uninstallPackage(
	name: string,
	scope: PackageScope,
	projectRoot?: string,
): Promise<boolean> {
	const installPath = resolveStorePath(name, scope, projectRoot);

	try {
		await stat(installPath);
	} catch {
		return false;
	}

	await rm(installPath, { recursive: true, force: true });
	return true;
}

// ============================================================================
// Validation helpers
// ============================================================================

async function readAndValidateManifest(
	dirPath: string,
): Promise<PackageManifest> {
	let raw: unknown;
	try {
		raw = await loadManifest(dirPath);
	} catch (err) {
		throw new Error(
			`Missing or unreadable cosmonauts.json in "${dirPath}": ${String(err)}`,
		);
	}

	const result = validateManifest(raw);
	if (!result.valid) {
		const summary = result.errors.map(formatManifestError).join(", ");
		throw new Error(`Invalid cosmonauts.json in "${dirPath}": ${summary}`);
	}

	return result.manifest;
}

function formatManifestError(error: ManifestValidationError): string {
	if (error.field === "domains" && error.reason === "root-not-exclusive") {
		const offender = error.domain ? ` (domain "${error.domain}")` : "";
		return `${error.field}: ${error.reason}${offender}; a domain with path "." exposes the package root as the domain. Move each domain into its own subdirectory or keep path "." as the only domain entry.`;
	}

	if (error.field !== "domains" || error.reason !== "invalid-path") {
		return `${error.field}: ${error.reason}`;
	}

	const offender =
		error.domain && error.path !== undefined
			? ` (domain "${error.domain}" declares path "${error.path}")`
			: "";
	return `${error.field}: ${error.reason}${offender}; domain paths must be "." or a relative path inside the package such as "domains/coding"; absolute paths and "../" traversal are not allowed`;
}

async function assertRootDomainPackageSemantics(
	sourceDir: string,
	manifest: PackageManifest,
): Promise<void> {
	const rootDomain = manifest.domains.find((domain) => domain.path === ".");
	if (!rootDomain) return;

	if (manifest.domains.length > 1) {
		throw new Error(
			`Domain "${rootDomain.name}" declares path "."; root-domain packages cannot declare additional domains. Move each domain into its own subdirectory or keep path "." as the only domain entry.`,
		);
	}

	const domainManifestPath = join(sourceDir, "domain.ts");
	try {
		const s = await stat(domainManifestPath);
		if (s.isFile()) return;
	} catch {
		// handled below
	}

	throw new Error(
		`Domain "${rootDomain.name}" declares path "." but root domain.ts is missing. Add domain.ts at the package root or change cosmonauts.json to point at the domain directory.`,
	);
}

async function assertDomainDirectoriesExist(
	sourceDir: string,
	manifest: PackageManifest,
): Promise<void> {
	for (const domain of manifest.domains) {
		const normalizedPath = normalizePackageDomainPath(domain.path);
		if (!normalizedPath) {
			throw new Error(
				`Domain "${domain.name}" declares path "${domain.path}" which must be a relative path inside the package`,
			);
		}
		const domainPath = join(sourceDir, normalizedPath);
		let s: Awaited<ReturnType<typeof stat>>;
		try {
			s = await stat(domainPath);
		} catch {
			throw new Error(
				`Domain "${domain.name}" declares path "${domain.path}" which does not exist in the package`,
			);
		}
		if (!s.isDirectory()) {
			throw new Error(
				`Domain "${domain.name}" path "${domain.path}" is not a directory`,
			);
		}
	}
}

// ============================================================================
// Conflict detection
// ============================================================================

async function detectDomainConflicts(
	manifest: PackageManifest,
	scope: PackageScope,
	projectRoot?: string,
): Promise<DomainMergeResult[]> {
	const installed = await listInstalledPackages(scope, projectRoot);
	const incoming = new Set(manifest.domains.map((d) => d.name));

	const results: DomainMergeResult[] = [];
	for (const pkg of installed) {
		// Skip same-name package (reinstall scenario)
		if (pkg.manifest.name === manifest.name) continue;
		for (const domain of pkg.manifest.domains) {
			if (incoming.has(domain.name)) {
				results.push({
					domainId: domain.name,
					existingPackage: pkg.manifest.name,
				});
			}
		}
	}
	return results;
}

// ============================================================================
// Git helpers
// ============================================================================

/**
 * Convert a github: shorthand to a full HTTPS URL.
 * github:owner/repo → https://github.com/owner/repo
 */
function resolveGitUrl(source: string): string {
	if (source.startsWith("github:")) {
		return `https://github.com/${source.slice("github:".length)}`;
	}
	return source;
}

/** Shallow-clone a git repository into destDir, optionally checking out a specific branch. */
function shallowClone(
	url: string,
	destDir: string,
	branch?: string,
): Promise<void> {
	const args = ["clone", "--depth", "1"];
	if (branch) args.push("--branch", branch);
	args.push(url, destDir);

	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			stdio: "pipe",
		});
		const stderr: Buffer[] = [];
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const msg = Buffer.concat(stderr).toString().trim();
				reject(new Error(`git clone failed (exit ${code}): ${msg}`));
			}
		});
		child.on("error", reject);
	});
}

// ============================================================================
// Temp directory
// ============================================================================

async function makeTempDir(): Promise<string> {
	const dir = join(
		tmpdir(),
		`cosmo-install-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(dir, { recursive: true });
	return dir;
}
