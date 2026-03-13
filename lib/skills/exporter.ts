/**
 * Skill exporter — copies skill directories to target harness locations.
 *
 * Supports Claude Code (.claude/skills/) and Codex (.agents/skills/)
 * at both project and personal (user-level) scope.
 */

import { cp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Supported export targets. */
export type ExportTarget = "claude" | "codex";

/** Scope of the export: project-local or user-level (personal). */
export type ExportScope = "project" | "personal";

/** Result of exporting a single skill. */
export interface ExportResult {
	/** Skill name that was exported. */
	readonly name: string;
	/** Absolute path the skill was exported to. */
	readonly targetPath: string;
}

/** Options for exporting skills. */
export interface ExportOptions {
	/** Target harness to export to. */
	readonly target: ExportTarget;
	/** Project root directory (used for project-scope exports). */
	readonly projectRoot: string;
	/** Whether to export to user-level directory instead of project. */
	readonly personal?: boolean;
}

/**
 * Resolve the target directory for a skill export.
 *
 * Project-level:
 *   claude → <projectRoot>/.claude/skills/<name>/
 *   codex  → <projectRoot>/.agents/skills/<name>/
 *
 * Personal (user-level):
 *   claude → ~/.claude/skills/<name>/
 *   codex  → ~/.codex/skills/<name>/
 */
export function resolveTargetDir(name: string, options: ExportOptions): string {
	const scope = options.personal ? "personal" : "project";
	const base = scope === "personal" ? homedir() : options.projectRoot;

	switch (options.target) {
		case "claude":
			return join(base, ".claude", "skills", name);
		case "codex":
			return join(
				base,
				scope === "personal" ? ".codex" : ".agents",
				"skills",
				name,
			);
	}
}

/**
 * Export a skill directory to the target harness location.
 *
 * Copies the entire skill directory (SKILL.md + supporting files)
 * to the resolved target path. Overwrites existing content.
 */
export async function exportSkill(
	sourcePath: string,
	name: string,
	options: ExportOptions,
): Promise<ExportResult> {
	const targetPath = resolveTargetDir(name, options);
	await rm(targetPath, { recursive: true, force: true });
	await cp(sourcePath, targetPath, { recursive: true });
	return { name, targetPath };
}
