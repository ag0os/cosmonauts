/**
 * CLI subcommand: `cosmonauts create`
 *
 * Scaffolds new cosmonauts packages and domains.
 *
 * Usage:
 *   cosmonauts create domain <name>
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";

// ============================================================================
// Scaffolding helpers
// ============================================================================

/**
 * Generate cosmonauts.json content for a new package.
 */
function generateManifest(name: string): string {
	return JSON.stringify(
		{
			name,
			version: "0.1.0",
			description: `${name} domain package`,
			domains: [{ name, path: name }],
		},
		null,
		2,
	);
}

/**
 * Generate domain.ts content for a new domain.
 */
function generateDomainTs(name: string): string {
	return `import type { DomainManifest } from "cosmonauts/lib/domains/types.ts";

export const manifest: DomainManifest = {
	id: "${name}",
	description: "${name} domain",
	portable: false,
};
`;
}

// ============================================================================
// Scaffold action
// ============================================================================

/**
 * Scaffold a new domain package under ./<name>/ in the current directory.
 *
 * @throws If the target directory already exists
 */
export async function scaffoldDomain(
	name: string,
	cwd: string = process.cwd(),
): Promise<void> {
	const packageDir = join(cwd, name);
	const domainDir = join(packageDir, name);

	// Fail fast if target already exists
	const targetExists = await stat(packageDir).then(
		() => true,
		() => false,
	);

	if (targetExists) {
		throw new Error(
			`Directory "${name}" already exists. Remove it before scaffolding.`,
		);
	}

	// Create subdirectories inside the domain directory
	const subdirs = ["agents", "prompts", "capabilities", "skills", "extensions"];
	for (const sub of subdirs) {
		await mkdir(join(domainDir, sub), { recursive: true });
	}

	// Write cosmonauts.json at package root
	await writeFile(join(packageDir, "cosmonauts.json"), generateManifest(name));

	// Write domain.ts inside the domain directory
	await writeFile(join(domainDir, "domain.ts"), generateDomainTs(name));
}

// ============================================================================
// Commander program
// ============================================================================

export function createCreateProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts create")
		.description("Scaffold new cosmonauts packages and domains");

	program
		.command("domain <name>")
		.description(
			"Create a new domain package scaffold in the current directory",
		)
		.action(async (name: string) => {
			try {
				await scaffoldDomain(name);
				console.log(`Created domain package "${name}":`);
				console.log(`  ${name}/cosmonauts.json`);
				console.log(`  ${name}/${name}/domain.ts`);
				console.log(`  ${name}/${name}/agents/`);
				console.log(`  ${name}/${name}/prompts/`);
				console.log(`  ${name}/${name}/capabilities/`);
				console.log(`  ${name}/${name}/skills/`);
				console.log(`  ${name}/${name}/extensions/`);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				process.stderr.write(`cosmonauts create domain: ${message}\n`);
				process.exitCode = 1;
			}
		});

	return program;
}
