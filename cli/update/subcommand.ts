/**
 * CLI subcommand: `cosmonauts update`
 *
 * update <name>   Update a specific installed package.
 * update --all    Update all installed packages in the active scope.
 */

import { spawn } from "node:child_process";
import { Command } from "commander";
import {
	resolveCatalogEntry,
	resolveCatalogSource,
} from "../../lib/packages/catalog.ts";
import {
	installPackage,
	loadInstallMeta,
	uninstallPackage,
} from "../../lib/packages/installer.ts";
import {
	listInstalledPackages,
	resolveStorePath,
} from "../../lib/packages/store.ts";
import type { PackageScope } from "../../lib/packages/types.ts";

// ============================================================================
// Types
// ============================================================================

interface UpdateOptions {
	target?: string;
	all?: boolean;
	local?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function gitPull(installPath: string): Promise<void> {
	return new Promise((res, rej) => {
		const child = spawn("git", ["-C", installPath, "pull"], {
			stdio: "pipe",
		});
		const stderr: Buffer[] = [];
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("close", (code) => {
			if (code === 0) {
				res();
			} else {
				const msg = Buffer.concat(stderr).toString().trim();
				rej(new Error(`git pull failed (exit ${code}): ${msg}`));
			}
		});
		child.on("error", rej);
	});
}

// ============================================================================
// Strategy per source type
// ============================================================================

async function updateOne(
	name: string,
	scope: PackageScope,
	cwd: string,
): Promise<void> {
	const installPath = resolveStorePath(name, scope, cwd);
	const meta = await loadInstallMeta(installPath);

	if (meta === null) {
		process.stderr.write(
			`No metadata found for "${name}"; cannot determine update strategy\n`,
		);
		return;
	}

	switch (meta.source) {
		case "catalog": {
			const entry = resolveCatalogEntry(meta.catalogName);
			const source = entry
				? resolveCatalogSource(entry.source)
				: resolveCatalogSource(`./bundled/${meta.catalogName}`);

			try {
				await uninstallPackage(name, scope, cwd);
				await installPackage({
					source,
					scope,
					projectRoot: cwd,
					catalogName: meta.catalogName,
				});
				console.log(`Updated "${name}" from catalog "${meta.catalogName}"`);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				process.stderr.write(
					`cosmonauts update: failed to update "${name}": ${message}\n`,
				);
				process.exitCode = 1;
			}
			break;
		}

		case "git": {
			try {
				await gitPull(installPath);
				console.log(`Updated "${name}" via git pull`);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				process.stderr.write(
					`cosmonauts update: failed to update "${name}": ${message}\n`,
				);
				process.exitCode = 1;
			}
			break;
		}

		case "link": {
			console.log(
				`"${name}": Symlinked package — already live, no update needed`,
			);
			break;
		}

		case "local": {
			process.stderr.write(
				`"${name}": Local package source unknown; re-run \`cosmonauts install <path>\` to update\n`,
			);
			break;
		}
	}
}

// ============================================================================
// Action
// ============================================================================

export async function updateAction(options: UpdateOptions): Promise<void> {
	const cwd = options.projectRoot ?? process.cwd();
	const scope: PackageScope = options.local ? "project" : "user";

	if (options.target) {
		await updateOne(options.target, scope, cwd);
		return;
	}

	if (options.all) {
		const packages = await listInstalledPackages(
			scope,
			scope === "project" ? cwd : undefined,
		);
		if (packages.length === 0) {
			console.log("No packages installed.");
			return;
		}
		for (const pkg of packages) {
			await updateOne(pkg.manifest.name, scope, cwd);
		}
		return;
	}

	process.stderr.write(
		"cosmonauts update: specify a package name or use --all\n",
	);
	process.exitCode = 1;
}

// ============================================================================
// Commander program
// ============================================================================

export function createUpdateProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts update")
		.description("Update installed domain packages")
		.argument("[name]", "Package name to update")
		.option("--all", "Update all installed packages")
		.option("--local", "Target project-local scope (default: global)")
		.action(
			async (
				name: string | undefined,
				options: { all?: boolean; local?: boolean },
			) => {
				await updateAction({ target: name, ...options });
			},
		);

	return program;
}
