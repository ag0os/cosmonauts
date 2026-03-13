/**
 * Tests for skill exporter.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { exportSkill, resolveTargetDir } from "../../lib/skills/exporter.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("skills-export-");

describe("resolveTargetDir", () => {
	test("claude project → .claude/skills/<name>/", () => {
		const result = resolveTargetDir("plan", {
			target: "claude",
			projectRoot: "/project",
		});
		expect(result).toBe("/project/.claude/skills/plan");
	});

	test("claude personal → ~/.claude/skills/<name>/", () => {
		const result = resolveTargetDir("plan", {
			target: "claude",
			projectRoot: "/project",
			personal: true,
		});
		expect(result).toBe(join(homedir(), ".claude/skills/plan"));
	});

	test("codex project → .agents/skills/<name>/", () => {
		const result = resolveTargetDir("task", {
			target: "codex",
			projectRoot: "/project",
		});
		expect(result).toBe("/project/.agents/skills/task");
	});

	test("codex personal → ~/.codex/skills/<name>/", () => {
		const result = resolveTargetDir("task", {
			target: "codex",
			projectRoot: "/project",
			personal: true,
		});
		expect(result).toBe(join(homedir(), ".codex/skills/task"));
	});
});

describe("exportSkill", () => {
	test("copies SKILL.md to target directory", async () => {
		// Create source skill
		const sourceDir = join(tmp.path, "source", "plan");
		await mkdir(sourceDir, { recursive: true });
		await writeFile(
			join(sourceDir, "SKILL.md"),
			"---\nname: plan\ndescription: Plans\n---\n# Plan\n",
		);

		const result = await exportSkill(sourceDir, "plan", {
			target: "claude",
			projectRoot: tmp.path,
		});

		expect(result.name).toBe("plan");
		expect(result.targetPath).toBe(join(tmp.path, ".claude/skills/plan"));

		const exported = await readFile(
			join(result.targetPath, "SKILL.md"),
			"utf-8",
		);
		expect(exported).toContain("name: plan");
	});

	test("copies supporting files alongside SKILL.md", async () => {
		// Create source skill with supporting files
		const sourceDir = join(tmp.path, "source", "typescript");
		const refsDir = join(sourceDir, "references");
		await mkdir(refsDir, { recursive: true });
		await writeFile(
			join(sourceDir, "SKILL.md"),
			"---\nname: typescript\n---\n",
		);
		await writeFile(join(refsDir, "patterns.md"), "# Patterns\n");

		const result = await exportSkill(sourceDir, "typescript", {
			target: "codex",
			projectRoot: tmp.path,
		});

		const refContent = await readFile(
			join(result.targetPath, "references", "patterns.md"),
			"utf-8",
		);
		expect(refContent).toBe("# Patterns\n");
	});

	test("removes stale files from previous export", async () => {
		const sourceDir = join(tmp.path, "source", "plan");
		const refsDir = join(sourceDir, "references");
		await mkdir(refsDir, { recursive: true });
		await writeFile(join(sourceDir, "SKILL.md"), "v1");
		await writeFile(join(refsDir, "old-ref.md"), "old content");

		// First export includes old-ref.md
		const first = await exportSkill(sourceDir, "plan", {
			target: "claude",
			projectRoot: tmp.path,
		});

		// Remove the reference file from source, then re-export
		const { rm } = await import("node:fs/promises");
		await rm(refsDir, { recursive: true });
		const second = await exportSkill(sourceDir, "plan", {
			target: "claude",
			projectRoot: tmp.path,
		});

		// The stale reference should not exist in the export
		const { stat } = await import("node:fs/promises");
		const staleRef = join(second.targetPath, "references", "old-ref.md");
		await expect(stat(staleRef)).rejects.toThrow();

		// But SKILL.md should still be there
		const content = await readFile(join(first.targetPath, "SKILL.md"), "utf-8");
		expect(content).toBe("v1");
	});

	test("overwrites existing export", async () => {
		const sourceDir = join(tmp.path, "source", "plan");
		await mkdir(sourceDir, { recursive: true });
		await writeFile(join(sourceDir, "SKILL.md"), "version 1");

		// First export
		await exportSkill(sourceDir, "plan", {
			target: "claude",
			projectRoot: tmp.path,
		});

		// Update source and re-export
		await writeFile(join(sourceDir, "SKILL.md"), "version 2");
		const result = await exportSkill(sourceDir, "plan", {
			target: "claude",
			projectRoot: tmp.path,
		});

		const content = await readFile(
			join(result.targetPath, "SKILL.md"),
			"utf-8",
		);
		expect(content).toBe("version 2");
	});
});
