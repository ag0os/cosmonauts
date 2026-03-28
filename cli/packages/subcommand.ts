/**
 * CLI subcommands: `cosmonauts install`, `cosmonauts uninstall`, `cosmonauts packages`
 *
 * install  <source>  Install a package from catalog name, git URL, or local path.
 * uninstall <name>   Remove an installed package.
 * packages [list]    List all installed packages.
 */

import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { resolveCatalogEntry } from "../../lib/packages/catalog.ts";
import type { DomainMergeResult } from "../../lib/packages/installer.ts";
import {
	installPackage,
	uninstallPackage,
} from "../../lib/packages/installer.ts";
import { listInstalledPackages } from "../../lib/packages/store.ts";
import type {
	InstalledPackage,
	PackageScope,
} from "../../lib/packages/types.ts";

// ============================================================================
// Types
// ============================================================================

export interface InstallCliOptions {
	link?: boolean;
	local?: boolean;
	branch?: string;
	yes?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

export interface UninstallCliOptions {
	local?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

export interface PackagesListCliOptions {
	/** Override project root for testing */
	projectRoot?: string;
}

type ConflictChoice = "merge" | "replace" | "skip" | "cancel";

// ============================================================================
// Source resolution
// ============================================================================

/**
 * Resolve a framework-relative catalog source path to an absolute path.
 * e.g. "./bundled/coding" → "/usr/local/lib/cosmonauts/bundled/coding"
 */
function resolveCatalogSource(catalogSource: string): string {
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
	);
	return join(frameworkRoot, catalogSource);
}

/**
 * Resolve the install source: try catalog short name first, then pass through.
 * Returns the absolute/URL source string to pass to installPackage.
 */
export function resolveSource(arg: string): string {
	const entry = resolveCatalogEntry(arg);
	if (entry) {
		return resolveCatalogSource(entry.source);
	}
	return arg;
}

// ============================================================================
// Conflict prompt
// ============================================================================

async function promptConflictChoice(
	conflicts: DomainMergeResult[],
): Promise<ConflictChoice> {
	const lines = conflicts.map(
		(c) =>
			`  Domain "${c.domainId}" is already provided by "${c.existingPackage}"`,
	);
	process.stdout.write("\nDomain conflicts detected:\n");
	for (const line of lines) process.stdout.write(`${line}\n`);
	process.stdout.write(
		"\n  [m]erge   - install anyway (both packages provide this domain)\n",
	);
	process.stdout.write("  [r]eplace - remove conflicting packages, keep new\n");
	process.stdout.write("  [s]kip    - skip this installation\n");
	process.stdout.write("  [c]ancel  - abort and exit with error\n\n");

	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const ask = () => {
			rl.question("Choice [m/r/s/c]: ", (raw) => {
				const answer = raw.trim().toLowerCase();
				if (answer === "m" || answer === "merge") {
					rl.close();
					resolve("merge");
				} else if (answer === "r" || answer === "replace") {
					rl.close();
					resolve("replace");
				} else if (answer === "s" || answer === "skip") {
					rl.close();
					resolve("skip");
				} else if (answer === "c" || answer === "cancel") {
					rl.close();
					resolve("cancel");
				} else {
					ask();
				}
			});
		};
		ask();
	});
}

// ============================================================================
// Action: install
// ============================================================================

export async function installAction(
	arg: string,
	options: InstallCliOptions,
): Promise<void> {
	const cwd = options.projectRoot ?? process.cwd();
	const scope: PackageScope = options.local ? "project" : "user";
	const source = resolveSource(arg);

	let result: Awaited<ReturnType<typeof installPackage>>;
	try {
		result = await installPackage({
			source,
			scope,
			projectRoot: cwd,
			link: options.link,
			branch: options.branch,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`cosmonauts install: ${message}\n`);
		process.exitCode = 1;
		return;
	}

	const { manifest, installedTo, domainMergeResults } = result;

	// Handle domain conflicts
	if (domainMergeResults.length > 0) {
		let choice: ConflictChoice;

		if (options.yes) {
			choice = "merge";
		} else {
			choice = await promptConflictChoice(domainMergeResults);
		}

		if (choice === "skip") {
			await uninstallPackage(manifest.name, scope, cwd);
			console.log(`Skipped: "${manifest.name}" was not installed.`);
			return;
		}

		if (choice === "cancel") {
			await uninstallPackage(manifest.name, scope, cwd);
			process.stderr.write(
				`cosmonauts install: cancelled — "${manifest.name}" was not installed.\n`,
			);
			process.exitCode = 1;
			return;
		}

		if (choice === "replace") {
			// Remove packages that conflict
			const conflictingPkgs = [
				...new Set(domainMergeResults.map((r) => r.existingPackage)),
			];
			for (const pkgName of conflictingPkgs) {
				await uninstallPackage(pkgName, scope, cwd);
				console.log(`Removed conflicting package: "${pkgName}"`);
			}
		}
		// merge: fall through — install already in place
	}

	const domainNames = manifest.domains.map((d) => d.name).join(", ");
	const scopeLabel = scope === "user" ? "global" : "local";
	console.log(
		`Installed "${manifest.name}" v${manifest.version} [${scopeLabel}]`,
	);
	console.log(`  Domains: ${domainNames}`);
	console.log(`  Path:    ${installedTo}`);
}

// ============================================================================
// Action: uninstall
// ============================================================================

export async function uninstallAction(
	name: string,
	options: UninstallCliOptions,
): Promise<void> {
	const cwd = options.projectRoot ?? process.cwd();
	const scope: PackageScope = options.local ? "project" : "user";

	let removed: boolean;
	try {
		removed = await uninstallPackage(name, scope, cwd);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`cosmonauts uninstall: ${message}\n`);
		process.exitCode = 1;
		return;
	}

	if (!removed) {
		process.stderr.write(
			`cosmonauts uninstall: package "${name}" is not installed.\n`,
		);
		process.exitCode = 1;
		return;
	}

	const scopeLabel = scope === "user" ? "global" : "local";
	console.log(`Uninstalled "${name}" [${scopeLabel}]`);
}

// ============================================================================
// Action: packages list
// ============================================================================

/**
 * Attempt to load the portable flag from a domain's domain.ts.
 * Falls back to false if the file cannot be loaded.
 */
async function loadDomainPortable(
	installPath: string,
	domainRelPath: string,
): Promise<boolean> {
	try {
		const domainFile = join(installPath, domainRelPath, "domain.ts");
		const mod = (await import(domainFile)) as Record<string, unknown>;
		const manifest =
			(mod.default as Record<string, unknown> | undefined) ??
			(mod.domain as Record<string, unknown> | undefined) ??
			(mod.manifest as Record<string, unknown> | undefined);
		return (manifest?.portable as boolean | undefined) ?? false;
	} catch {
		return false;
	}
}

export async function packagesListAction(
	options: PackagesListCliOptions = {},
): Promise<void> {
	const cwd = options.projectRoot ?? process.cwd();

	let [globalPkgs, localPkgs]: [InstalledPackage[], InstalledPackage[]] = [
		[],
		[],
	];
	try {
		[globalPkgs, localPkgs] = await Promise.all([
			listInstalledPackages("user"),
			listInstalledPackages("project", cwd),
		]);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`cosmonauts packages list: ${message}\n`);
		process.exitCode = 1;
		return;
	}

	const allPkgs: Array<InstalledPackage & { scopeLabel: string }> = [
		...globalPkgs.map((p) => ({ ...p, scopeLabel: "global" })),
		...localPkgs.map((p) => ({ ...p, scopeLabel: "local" })),
	];

	if (allPkgs.length === 0) {
		console.log("No packages installed.");
		return;
	}

	// Compute column widths
	const nameWidth = Math.max(7, ...allPkgs.map((p) => p.manifest.name.length));
	const versionWidth = Math.max(
		7,
		...allPkgs.map((p) => p.manifest.version.length),
	);

	// Header
	console.log(
		`${"PACKAGE".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  SCOPE   PORTABLE  DOMAINS`,
	);
	console.log(
		`${"-".repeat(nameWidth)}  ${"-".repeat(versionWidth)}  ------  --------  -------`,
	);

	for (const pkg of allPkgs) {
		const { manifest, installPath, scopeLabel } = pkg;

		// Build domain info with portable flags
		const domainParts: string[] = [];
		for (const domain of manifest.domains) {
			const portable = await loadDomainPortable(installPath, domain.path);
			domainParts.push(`${domain.name}(${portable ? "portable" : "local"})`);
		}

		const name = manifest.name.padEnd(nameWidth);
		const version = manifest.version.padEnd(versionWidth);
		const scope = scopeLabel.padEnd(6);
		// Show whether any domain is portable as the package-level indicator
		const anyPortable = await Promise.all(
			manifest.domains.map((d) => loadDomainPortable(installPath, d.path)),
		).then((flags) => flags.some(Boolean));
		const portableStr = anyPortable ? "yes" : "no";

		console.log(
			`${name}  ${version}  ${scope}  ${portableStr.padEnd(8)}  ${domainParts.join(", ")}`,
		);
	}
}

// ============================================================================
// Commander programs
// ============================================================================

export function createInstallProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts install")
		.description(
			"Install a domain package from a catalog name, git URL, or local path",
		)
		.argument(
			"<source>",
			"Catalog short name, https:// URL, github:owner/repo, or local path",
		)
		.option("--link", "Install as a symlink (local paths only)")
		.option("--local", "Install to project-local scope (default: global)")
		.option("--branch <branch>", "Git branch or tag to checkout (git sources)")
		.option(
			"-y, --yes",
			"Non-interactive: auto-merge domain conflicts without prompting",
		)
		.action(async (source: string, options: InstallCliOptions) => {
			await installAction(source, options);
		});

	return program;
}

export function createUninstallProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts uninstall")
		.description("Remove an installed domain package")
		.argument("<name>", "Package name to uninstall")
		.option("--local", "Target project-local scope (default: global)")
		.action(async (name: string, options: UninstallCliOptions) => {
			await uninstallAction(name, options);
		});

	return program;
}

export function createPackagesProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts packages")
		.description("Manage installed domain packages");

	// Default action: list packages when invoked without a subcommand
	program.action(async () => {
		await packagesListAction();
	});

	program
		.command("list")
		.alias("ls")
		.description(
			"List all installed packages with version, domains, and portable indicators",
		)
		.action(async () => {
			await packagesListAction();
		});

	return program;
}
