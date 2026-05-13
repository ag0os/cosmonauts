/**
 * CLI subcommands: `cosmonauts install`, `cosmonauts uninstall`, `cosmonauts packages`
 *
 * install  <source>  Install a package from catalog name, git URL, or local path.
 * uninstall <name>   Remove an installed package.
 * packages [list]    List all installed packages.
 */

import { join } from "node:path";
import { createInterface } from "node:readline";
import { Command } from "commander";
import {
	resolveCatalogEntry,
	resolveCatalogSource,
} from "../../lib/packages/catalog.ts";
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
import { printCliError } from "../shared/errors.ts";
import type { CliOutputMode } from "../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../shared/output.ts";

// ============================================================================
// Types
// ============================================================================

interface InstallCliOptions {
	link?: boolean;
	local?: boolean;
	branch?: string;
	yes?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

interface UninstallCliOptions {
	local?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

interface PackagesListCliOptions {
	/** Override project root for testing */
	projectRoot?: string;
	/** Output mode for the package listing */
	mode?: CliOutputMode;
}

/** Per-domain entry in `packages list --json` rows. */
export interface PackageListDomainItem {
	name: string;
	portable: boolean;
}

/** Row shape for `packages list --json`. */
export interface PackageListRow {
	name: string;
	version: string;
	scope: "global" | "local";
	portable: boolean;
	domains: PackageListDomainItem[];
}

interface InstallRequest {
	source: string;
	scope: PackageScope;
	cwd: string;
	catalogName?: string;
}

type InstallPackageResult = Awaited<ReturnType<typeof installPackage>>;

type ConflictChoice = "merge" | "replace" | "skip" | "cancel";

// ============================================================================
// Source resolution
// ============================================================================

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

export function resolveInstallRequest(
	arg: string,
	options: InstallCliOptions,
): InstallRequest {
	const cwd = options.projectRoot ?? process.cwd();
	const scope: PackageScope = options.local ? "project" : "user";
	const entry = resolveCatalogEntry(arg);
	const source = entry ? resolveCatalogSource(entry.source) : arg;

	return {
		source,
		scope,
		cwd,
		catalogName: entry?.name,
	};
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
	const request = resolveInstallRequest(arg, options);

	let result: InstallPackageResult;
	try {
		result = await installPackage({
			source: request.source,
			scope: request.scope,
			projectRoot: request.cwd,
			link: options.link,
			branch: options.branch,
			catalogName: request.catalogName,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		printCliError(message, {}, { prefix: "cosmonauts install" });
		process.exitCode = 1;
		return;
	}

	const conflictStatus = await handleInstallConflicts(result, request, options);
	if (conflictStatus === "stopped") {
		return;
	}

	printLines(renderInstallSuccess(result, request.scope));
}

async function handleInstallConflicts(
	result: InstallPackageResult,
	request: InstallRequest,
	options: InstallCliOptions,
): Promise<"continue" | "stopped"> {
	const { manifest, domainMergeResults } = result;

	if (domainMergeResults.length === 0) {
		return "continue";
	}

	const choice = options.yes
		? "merge"
		: await promptConflictChoice(domainMergeResults);

	if (choice === "skip") {
		await rollbackInstalledPackage(manifest.name, request.scope, request.cwd);
		printLines([`Skipped: "${manifest.name}" was not installed.`]);
		return "stopped";
	}

	if (choice === "cancel") {
		await rollbackInstalledPackage(manifest.name, request.scope, request.cwd);
		printCliError(
			`cancelled — "${manifest.name}" was not installed.`,
			{},
			{ prefix: "cosmonauts install" },
		);
		process.exitCode = 1;
		return "stopped";
	}

	if (choice === "replace") {
		const conflictingPackages = [
			...new Set(domainMergeResults.map((r) => r.existingPackage)),
		];
		for (const packageName of conflictingPackages) {
			await uninstallPackage(packageName, request.scope, request.cwd);
			printLines([`Removed conflicting package: "${packageName}"`]);
		}
	}

	return "continue";
}

async function rollbackInstalledPackage(
	manifestName: string,
	scope: PackageScope,
	cwd: string,
): Promise<void> {
	await uninstallPackage(manifestName, scope, cwd);
}

export function renderInstallSuccess(
	result: InstallPackageResult,
	scope: PackageScope,
): string[] {
	const { manifest, installedTo } = result;
	const domainNames = manifest.domains.map((d) => d.name).join(", ");
	const scopeLabel = scope === "user" ? "global" : "local";
	return [
		`Installed "${manifest.name}" v${manifest.version} [${scopeLabel}]`,
		`  Domains: ${domainNames}`,
		`  Path:    ${installedTo}`,
	];
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

async function buildPackageListRows(
	packages: ReadonlyArray<InstalledPackage & { scopeLabel: "global" | "local" }>,
): Promise<PackageListRow[]> {
	const rows: PackageListRow[] = [];
	for (const pkg of packages) {
		const domains: PackageListDomainItem[] = [];
		for (const domain of pkg.manifest.domains) {
			const portable = await loadDomainPortable(pkg.installPath, domain.path);
			domains.push({ name: domain.name, portable });
		}
		rows.push({
			name: pkg.manifest.name,
			version: pkg.manifest.version,
			scope: pkg.scopeLabel,
			portable: domains.some((d) => d.portable),
			domains,
		});
	}
	return rows;
}

export function renderPackagesList(
	rows: readonly PackageListRow[],
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	if (mode === "json") {
		return { kind: "json", value: rows };
	}

	if (mode === "plain") {
		return {
			kind: "lines",
			lines: rows.map(
				(row) =>
					`${row.name}\t${row.version}\t${row.scope}\t${row.portable ? "yes" : "no"}\t${row.domains
						.map((d) => `${d.name}(${d.portable ? "portable" : "local"})`)
						.join(",")}`,
			),
		};
	}

	if (rows.length === 0) {
		return { kind: "lines", lines: ["No packages installed."] };
	}

	const nameWidth = Math.max(7, ...rows.map((row) => row.name.length));
	const versionWidth = Math.max(7, ...rows.map((row) => row.version.length));
	const lines = [
		`${"PACKAGE".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  SCOPE   PORTABLE  DOMAINS`,
		`${"-".repeat(nameWidth)}  ${"-".repeat(versionWidth)}  ------  --------  -------`,
	];
	for (const row of rows) {
		const domainsStr = row.domains
			.map((d) => `${d.name}(${d.portable ? "portable" : "local"})`)
			.join(", ");
		lines.push(
			`${row.name.padEnd(nameWidth)}  ${row.version.padEnd(versionWidth)}  ${row.scope.padEnd(6)}  ${(
				row.portable ? "yes" : "no"
			).padEnd(8)}  ${domainsStr}`,
		);
	}
	return { kind: "lines", lines };
}

export async function packagesListAction(
	options: PackagesListCliOptions = {},
): Promise<void> {
	const cwd = options.projectRoot ?? process.cwd();
	const mode = options.mode ?? "human";

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

	const allPkgs: Array<
		InstalledPackage & { scopeLabel: "global" | "local" }
	> = [
		...globalPkgs.map((p) => ({ ...p, scopeLabel: "global" as const })),
		...localPkgs.map((p) => ({ ...p, scopeLabel: "local" as const })),
	];

	const rows = await buildPackageListRows(allPkgs);
	const rendered = renderPackagesList(rows, mode);
	if (rendered.kind === "json") {
		printJson(rendered.value);
	} else {
		printLines(rendered.lines);
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
		.description("Manage installed domain packages")
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	// Default action: list packages when invoked without a subcommand
	program.action(async () => {
		await packagesListAction({ mode: getOutputMode(program.opts()) });
	});

	program
		.command("list")
		.alias("ls")
		.description(
			"List all installed packages with version, domains, and portable indicators",
		)
		.action(async () => {
			await packagesListAction({ mode: getOutputMode(program.opts()) });
		});

	return program;
}
