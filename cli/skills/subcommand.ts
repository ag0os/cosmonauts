/**
 * CLI subcommand: `cosmonauts skills`
 *
 * Lists and exports skills across domains.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadDomains } from "../../lib/domains/loader.ts";
import {
	discoverSkills,
	type ExportTarget,
	exportSkill,
} from "../../lib/skills/index.ts";

const VALID_TARGETS: ReadonlySet<string> = new Set(["claude", "codex"]);

function resolveDomainsDir(): string {
	return resolve(fileURLToPath(import.meta.url), "..", "..", "..", "domains");
}

export function createSkillsProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts skills")
		.description("Skill management and cross-harness export");

	// ── list ──────────────────────────────────────────────────────────
	program
		.command("list")
		.alias("ls")
		.description("List all skills across domains")
		.action(async () => {
			try {
				const domains = await loadDomains(resolveDomainsDir());
				const skills = await discoverSkills(domains);

				if (skills.length === 0) {
					console.log("No skills found.");
					return;
				}

				const nameWidth = Math.max(6, ...skills.map((s) => s.name.length));
				const domainWidth = Math.max(6, ...skills.map((s) => s.domain.length));

				for (const skill of skills) {
					const name = skill.name.padEnd(nameWidth);
					const domain = skill.domain.padEnd(domainWidth);
					console.log(`  ${name}  ${domain}  ${skill.description}`);
				}
			} catch (error) {
				console.error(`Error listing skills: ${error}`);
				process.exitCode = 1;
			}
		});

	// ── export ────────────────────────────────────────────────────────
	program
		.command("export")
		.description("Export skills to Claude Code or Codex directories")
		.requiredOption("-t, --target <harness>", "Target harness: claude, codex")
		.option("--personal", "Export to user-level directory instead of project")
		.option("--all", "Export all skills")
		.argument("[skills...]", "Skill names to export")
		.action(async (skillNames: string[], options) => {
			try {
				if (!VALID_TARGETS.has(options.target)) {
					console.error(
						`Invalid target "${options.target}". Must be one of: claude, codex`,
					);
					process.exitCode = 1;
					return;
				}

				const target = options.target as ExportTarget;
				const projectRoot = process.cwd();
				const domains = await loadDomains(resolveDomainsDir());
				const allSkills = await discoverSkills(domains);

				if (allSkills.length === 0) {
					console.log("No skills found to export.");
					return;
				}

				// Determine which skills to export
				let toExport = allSkills;
				if (!options.all) {
					if (skillNames.length === 0) {
						console.error("Specify skill names to export, or use --all.");
						process.exitCode = 1;
						return;
					}

					const skillMap = new Map(allSkills.map((s) => [s.name, s]));
					const missing = skillNames.filter((n) => !skillMap.has(n));
					if (missing.length > 0) {
						console.error(
							`Unknown skills: ${missing.join(", ")}. Run 'cosmonauts skills list' to see available skills.`,
						);
						process.exitCode = 1;
						return;
					}

					toExport = skillNames
						.map((n) => skillMap.get(n))
						.filter((s) => s !== undefined);
				}

				// Export each skill
				for (const skill of toExport) {
					const result = await exportSkill(skill.dirPath, skill.name, {
						target,
						projectRoot,
						personal: options.personal,
					});
					console.log(`  exported: ${skill.name} → ${result.targetPath}`);
				}

				console.log(`\n${toExport.length} skill(s) exported to ${target}.`);
			} catch (error) {
				console.error(`Error exporting skills: ${error}`);
				process.exitCode = 1;
			}
		});

	return program;
}
