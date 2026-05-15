/**
 * CLI subcommand: `cosmonauts skills`
 *
 * Lists and exports skills across all runtime-visible domains, including
 * bundled packages, globally and locally installed packages, plugin dirs,
 * and user-configured `projectConfig.skillPaths`. Mirrors the discovery
 * path used by interactive sessions so the CLI never under-reports.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import type {
	DiscoveredSkill,
	ExtraSkillSource,
} from "../../lib/skills/index.ts";
import {
	discoverSkills,
	type ExportTarget,
	exportSkill,
} from "../../lib/skills/index.ts";
import type { CliOutputMode } from "../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../shared/output.ts";

const VALID_TARGETS: ReadonlySet<string> = new Set(["claude", "codex"]);

/** Label applied to skills discovered via `projectConfig.skillPaths`. */
const PROJECT_SKILL_DOMAIN = "project";

/** JSON shape for `cosmonauts skills list --json`. */
export interface SkillListItem {
	name: string;
	domain: string;
	description: string;
}

interface SkillsProgramOptions {
	readonly domain?: string;
	readonly pluginDir?: readonly string[];
}

export function renderSkillsList(
	skills: readonly DiscoveredSkill[],
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	const items: SkillListItem[] = skills.map((skill) => ({
		name: skill.name,
		domain: skill.domain,
		description: skill.description,
	}));

	if (mode === "json") {
		return { kind: "json", value: items };
	}

	if (mode === "plain") {
		return {
			kind: "lines",
			lines: items.map(
				(item) => `${item.name}\t${item.domain}\t${item.description}`,
			),
		};
	}

	if (items.length === 0) {
		return { kind: "lines", lines: ["No skills found."] };
	}

	const nameWidth = Math.max(6, ...items.map((item) => item.name.length));
	const domainWidth = Math.max(6, ...items.map((item) => item.domain.length));
	return {
		kind: "lines",
		lines: items.map(
			(item) =>
				`  ${item.name.padEnd(nameWidth)}  ${item.domain.padEnd(domainWidth)}  ${item.description}`,
		),
	};
}

/**
 * Bootstrap a runtime mirroring `cosmonauts` interactive sessions and
 * `cosmonauts export`, then discover every skill it can see — domain skill
 * dirs plus user-configured `skillPaths`.
 */
async function discoverAllRuntimeSkills(
	options: SkillsProgramOptions,
): Promise<DiscoveredSkill[]> {
	const frameworkRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const bundledDirs = await discoverFrameworkBundledPackageDirs(frameworkRoot);
	const pluginDirs = options.pluginDir?.length
		? [...options.pluginDir]
		: undefined;

	const runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: join(frameworkRoot, "domains"),
		projectRoot: process.cwd(),
		bundledDirs,
		domainOverride: options.domain,
		pluginDirs,
	});

	const projectExtras: ExtraSkillSource[] = (
		runtime.projectConfig.skillPaths ?? []
	).map((skillsDir) => ({ skillsDir, domain: PROJECT_SKILL_DOMAIN }));

	return discoverSkills(runtime.domains, projectExtras);
}

export function createSkillsProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts skills")
		.description("Skill management and cross-harness export")
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format")
		.option("-d, --domain <id>", "Set domain context for agent resolution")
		.option(
			"--plugin-dir <path>",
			"Add a directory as a session-only domain source (repeatable)",
			(value: string, previous: string[]) => [...previous, value],
			[] as string[],
		);

	// ── list ──────────────────────────────────────────────────────────
	program
		.command("list")
		.alias("ls")
		.description("List all skills across domains")
		.action(async () => {
			const programOpts = program.opts<
				SkillsProgramOptions & { json?: boolean; plain?: boolean }
			>();
			const mode = getOutputMode(programOpts);
			try {
				const skills = await discoverAllRuntimeSkills(programOpts);
				const rendered = renderSkillsList(skills, mode);
				if (rendered.kind === "json") {
					printJson(rendered.value);
				} else {
					printLines(rendered.lines);
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
				const programOpts = program.opts<SkillsProgramOptions>();
				const allSkills = await discoverAllRuntimeSkills(programOpts);

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
