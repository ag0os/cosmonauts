/**
 * Domain eject logic — copies an installed domain to .cosmonauts/domains/<domainId>/
 * so it can be customized locally.
 */

import {
	cp,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { listInstalledPackages } from "./store.ts";

// ============================================================================
// Types
// ============================================================================

export interface EjectOptions {
	/** Domain identifier, e.g. "coding" */
	domainId: string;
	/** Absolute path to the project root */
	projectRoot: string;
	/** Overwrite if target already exists */
	force?: boolean;
}

export interface EjectResult {
	/** Absolute path to the ejected domain directory */
	ejectedTo: string;
	/** Name of the source package */
	sourcePackage: string;
	/** Absolute path of the source domain directory */
	sourcePath: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Eject an installed domain into .cosmonauts/domains/<domainId>/ so it can
 * be customized locally. Local-scope packages take precedence over global ones.
 */
export async function ejectDomain(options: EjectOptions): Promise<EjectResult> {
	const { domainId, projectRoot, force = false } = options;

	// Local scope (precedence 2) first, then global (precedence 1)
	const localPackages = await listInstalledPackages("project", projectRoot);
	const globalPackages = await listInstalledPackages("user");
	const allPackages = [...localPackages, ...globalPackages];

	// Find the first package providing this domain
	let foundPkg: (typeof allPackages)[number] | undefined;
	let foundDomainPath: string | undefined;

	for (const pkg of allPackages) {
		const domain = pkg.manifest.domains.find((d) => d.name === domainId);
		if (domain) {
			foundPkg = pkg;
			foundDomainPath = join(pkg.installPath, domain.path);
			break;
		}
	}

	if (!foundPkg || !foundDomainPath) {
		throw new Error(
			`Domain "${domainId}" not found in any installed package. Install it first: cosmonauts install ${domainId}`,
		);
	}

	// Validate source exists
	try {
		await stat(foundDomainPath);
	} catch {
		throw new Error(
			`Domain "${domainId}" source path does not exist: ${foundDomainPath}`,
		);
	}

	const target = join(projectRoot, ".cosmonauts", "domains", domainId);

	let targetExists = false;
	try {
		await stat(target);
		targetExists = true;
	} catch {
		// target does not exist — that's fine
	}

	if (targetExists && !force) {
		throw new Error(
			`Domain "${domainId}" is already ejected at "${target}". Use --force to overwrite.`,
		);
	}

	if (targetExists && force) {
		await rm(target, { recursive: true, force: true });
	}

	await mkdir(join(projectRoot, ".cosmonauts", "domains"), { recursive: true });
	await cp(foundDomainPath, target, { recursive: true });

	await rewriteImports(target);

	return {
		ejectedTo: target,
		sourcePackage: foundPkg.manifest.name,
		sourcePath: foundDomainPath,
	};
}

// ============================================================================
// Import rewrite
// ============================================================================

/**
 * Walk all .ts files in dir and replace relative framework import paths
 * (e.g. from "../../lib/) with package paths (from "cosmonauts/lib/).
 */
async function rewriteImports(dir: string): Promise<void> {
	const pattern = /from\s+"(\.\.\/)+lib\//g;
	const replacement = 'from "cosmonauts/lib/';

	for (const file of await collectTsFiles(dir)) {
		const original = await readFile(file, "utf-8");
		const rewritten = original.replace(pattern, replacement);
		if (rewritten !== original) {
			await writeFile(file, rewritten, "utf-8");
		}
	}
}

async function collectTsFiles(dir: string): Promise<string[]> {
	const results: string[] = [];

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		let s: Awaited<ReturnType<typeof stat>>;
		try {
			s = await stat(fullPath);
		} catch {
			continue;
		}
		if (s.isDirectory()) {
			results.push(...(await collectTsFiles(fullPath)));
		} else if (entry.endsWith(".ts")) {
			results.push(fullPath);
		}
	}

	return results;
}
