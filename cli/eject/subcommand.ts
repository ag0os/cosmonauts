/**
 * CLI subcommand: `cosmonauts eject`
 *
 * eject <domain>   Copy an installed domain to .cosmonauts/domains/ for local customization.
 */

import { join } from "node:path";
import { Command } from "commander";
import { ejectDomain } from "../../lib/packages/eject.ts";

// ============================================================================
// Types
// ============================================================================

export interface EjectCliOptions {
	force?: boolean;
	/** Override project root for testing */
	projectRoot?: string;
}

// ============================================================================
// Action
// ============================================================================

export async function ejectAction(
	domainId: string,
	options: EjectCliOptions,
): Promise<void> {
	const projectRoot = options.projectRoot ?? process.cwd();

	try {
		const result = await ejectDomain({
			domainId,
			projectRoot,
			force: options.force,
		});

		const ejectedRelative = join(".cosmonauts", "domains", domainId);

		console.log(`Ejected "${domainId}" to ${ejectedRelative}/`);
		console.log(`Source: ${result.sourcePackage} (${result.sourcePath})`);
		console.log();
		console.log(
			"The installed package is still active as a fallback. To remove it:",
		);
		console.log(`  cosmonauts uninstall ${result.sourcePackage}`);
		console.log();
		console.log(
			'Tip: Add "cosmonauts" as a dev dependency for IDE type support in ejected files.',
		);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`cosmonauts eject: ${message}\n`);
		process.exitCode = 1;
	}
}

// ============================================================================
// Commander program
// ============================================================================

export function createEjectProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts eject")
		.description(
			"Copy an installed domain to .cosmonauts/domains/ for local customization",
		)
		.argument("<domain>", "Domain ID to eject (e.g. coding)")
		.option("--force", "Overwrite if target already exists")
		.action(async (domain: string, options: { force?: boolean }) => {
			await ejectAction(domain, options);
		});

	return program;
}
