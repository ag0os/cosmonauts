/**
 * Domain eject logic — copies an installed domain to .cosmonauts/domains/<domainId>/
 * so it can be customized locally.
 */

import { readFileSync } from "node:fs";
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
import type { PackageScope } from "./types.ts";

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
	/** Scope of the source package */
	sourceScope: PackageScope;
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

	// Match runtime merge semantics:
	// - Local (precedence 2) wins over global (precedence 1)
	// - Within the same precedence, later sources win
	const localPackages = await listInstalledPackages("project", projectRoot);
	const globalPackages = await listInstalledPackages("user");

	const foundLocal = findLastDomainProvider(localPackages, domainId);
	const foundGlobal = findLastDomainProvider(globalPackages, domainId);
	const found = foundLocal ?? foundGlobal;

	const foundPkg = found?.pkg;
	const foundDomainPath = found?.path;

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
		sourceScope: foundPkg.scope,
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
	const { exports: entries } = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { exports: Record<string, string> };
	const aliases: Record<string, string> = {
		"index.ts": "cosmonauts",
		"agents/types.ts": "cosmonauts/agents",
		"domains/types.ts": "cosmonauts/domains",
		"chains/types.ts": "cosmonauts/chains",
	};
	for (const [name, target] of Object.entries(entries)) {
		if (name !== "." && !name.startsWith("./lib/"))
			aliases[target.replace(/^\.\/lib\//, "")] = `cosmonauts/${name.slice(2)}`;
	}
	const pending = [];
	for (const file of await collectTsFiles(dir)) {
		const original = await readFile(file, "utf8");
		const rewritten = original.replace(
			/from\s+(["'])(?:\.\.\/)+lib\/([^"']+)\1/g,
			(_match, quote: string, target: string) => {
				const specifier = aliases[target];
				if (!specifier)
					throw new Error(
						`Cannot eject unexported framework import lib/${target} in ${file}`,
					);
				return `from ${quote}${specifier}${quote}`;
			},
		);
		if (rewritten !== original) pending.push({ file, rewritten });
	}
	for (const { file, rewritten } of pending)
		await writeFile(file, rewritten, "utf8");
}

function findLastDomainProvider(
	packages: Awaited<ReturnType<typeof listInstalledPackages>>,
	domainId: string,
): { pkg: (typeof packages)[number]; path: string } | undefined {
	let found: { pkg: (typeof packages)[number]; path: string } | undefined;

	for (const pkg of packages) {
		const domain = pkg.manifest.domains.find((d) => d.name === domainId);
		if (!domain) continue;
		found = { pkg, path: join(pkg.installPath, domain.path) };
	}

	return found;
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
