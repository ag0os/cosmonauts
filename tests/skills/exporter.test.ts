/**
 * Tests for skill exporter.
 */

import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderIdentityMarkdown } from "../../lib/harness-adapters/render.ts";
import type {
	HarnessAsset,
	SourceHealthRow,
} from "../../lib/harness-adapters/types.ts";
import {
	exportSkill,
	resolveTargetDir,
	runHarnessSync,
} from "../../lib/skills/exporter.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("skills-export-");

describe("resolveTargetDir", () => {
	test("keeps the complete legacy target and scope matrix", () => {
		const cases = [
			{
				target: "claude" as const,
				personal: false,
				expected: "/project/.claude/skills/contract",
			},
			{
				target: "claude" as const,
				personal: true,
				expected: join(homedir(), ".claude/skills/contract"),
			},
			{
				target: "codex" as const,
				personal: false,
				expected: "/project/.agents/skills/contract",
			},
			{
				target: "codex" as const,
				personal: true,
				expected: join(homedir(), ".agents/skills/contract"),
			},
		];

		expect(
			cases.map(({ target, personal }) =>
				resolveTargetDir("contract", {
					target,
					projectRoot: "/project",
					personal,
				}),
			),
		).toEqual(cases.map(({ expected }) => expected));
	});

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

	test("codex personal → ~/.agents/skills/<name>/", () => {
		const result = resolveTargetDir("task", {
			target: "codex",
			projectRoot: "/project",
			personal: true,
		});
		expect(result).toBe(join(homedir(), ".agents/skills/task"));
	});
});

describe("exportSkill", () => {
	test("routes compatibility export through provenance without a destructive copier", async () => {
		const source = await readFile(
			new URL("../../lib/skills/exporter.ts", import.meta.url),
			"utf8",
		);
		expect(source).not.toMatch(/\bcp\s*\(/);
		expect(source).not.toMatch(/rm\s*\(\s*targetPath/);
		expect(source).toContain("runHarnessSync");
		expect(source).toContain("applySyncPlanInTransaction");
	});

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
		expect(content).toBe(renderIdentityMarkdown(Buffer.from("v1")).toString());
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
		expect(content).toBe(
			renderIdentityMarkdown(Buffer.from("version 2")).toString(),
		);
	});
});

describe("runHarnessSync selection", () => {
	test("omitted target selects Claude and Codex while descriptor scope defaults apply", async () => {
		const projectRoot = join(tmp.path, "selection-project");
		const homeRoot = join(tmp.path, "selection-home");
		const sourceRoot = join(tmp.path, "selection-source");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
			mkdir(join(sourceRoot, "skill"), { recursive: true }),
		]);
		await writeFile(join(sourceRoot, "skill", "SKILL.md"), "# Selection\n");
		const report = await runHarnessSync({
			projectRoot,
			homeRoot,
			assets: [
				{
					assetId: "skill:selection",
					kind: "skill",
					ownership: {
						kind: "authority",
						authorityId: "cosmonauts/core",
					},
					sourceRootId: "selection:root",
					sourceRoot,
					sourcePath: "skill",
					logicalPath: "skill",
					outputIdentity: "selection",
					defaultScope: "personal",
				},
			],
			sourceHealth: [
				{
					sourceRootId: "selection:root",
					sourceRoot,
					domain: "selection",
					status: "complete",
					issues: [],
				},
			],
			request: {
				reconciliation: "partial",
				check: true,
				assetIds: ["skill:selection", "skill:selection"],
			},
		});
		expect(
			report.rows.map(({ target, scope, asset }) => ({ target, scope, asset })),
		).toEqual([
			{ target: "claude", scope: "personal", asset: "skill:selection" },
			{ target: "codex", scope: "personal", asset: "skill:selection" },
		]);
		expect(report.exitCode).toBe(1);
		await expect(exists(join(homeRoot, ".claude"))).resolves.toBe(false);
		await expect(exists(join(homeRoot, ".agents"))).resolves.toBe(false);
	});

	test("forgets only after a still-declared source root is completely observed", async () => {
		const projectRoot = join(tmp.path, "forget-health-project");
		const homeRoot = join(tmp.path, "forget-health-home");
		const sourceRoot = join(projectRoot, "declared-root");
		await Promise.all([
			mkdir(homeRoot, { recursive: true }),
			mkdir(join(sourceRoot, "skill"), { recursive: true }),
		]);
		await writeFile(join(sourceRoot, "skill", "SKILL.md"), "# Declared\n");
		const asset = {
			assetId: "skill:declared",
			kind: "skill",
			ownership: { kind: "project" },
			sourceRootId: "root:declared",
			sourceRoot,
			sourcePath: "skill",
			logicalPath: "declared",
			outputIdentity: "declared",
			defaultScope: "project",
		} as const satisfies HarnessAsset;
		const completeHealth = {
			sourceRootId: asset.sourceRootId,
			sourceRoot,
			domain: "declared",
			status: "complete",
			issues: [],
		} as const satisfies SourceHealthRow;
		const forget = (sourceHealth: readonly SourceHealthRow[]) =>
			runHarnessSync({
				projectRoot,
				homeRoot,
				assets: [],
				sourceHealth,
				request: {
					targetIds: ["claude"],
					scopes: ["project"],
					kinds: ["skill"],
					reconciliation: "complete",
					check: false,
					forgetRemovedAssetIds: [asset.assetId],
				},
			});
		expect(
			(
				await runHarnessSync({
					projectRoot,
					homeRoot,
					assets: [asset],
					sourceHealth: [completeHealth],
					request: {
						targetIds: ["claude"],
						scopes: ["project"],
						assetIds: [asset.assetId],
						reconciliation: "partial",
						check: false,
					},
				})
			).exitCode,
		).toBe(0);

		const manifestPath = join(
			projectRoot,
			".claude",
			".cosmonauts-harness-manifest.json",
		);
		const targetPath = join(
			projectRoot,
			".claude",
			"skills",
			"declared",
			"SKILL.md",
		);
		await rm(join(sourceRoot, "skill"), { recursive: true });
		const before = {
			manifest: await readFile(manifestPath, "utf8"),
			target: await readFile(targetPath, "utf8"),
		};

		const incomplete = await forget([
			{
				...completeHealth,
				status: "incomplete",
				issues: [{ kind: "read", path: sourceRoot, message: "unreadable" }],
			},
		]);
		expect(incomplete).toMatchObject({
			exitCode: 1,
			rows: [
				{
					reason: "inventory-incomplete",
					action: "none",
					final: "source-ahead",
				},
			],
		});
		expect(await readFile(manifestPath, "utf8")).toBe(before.manifest);
		expect(await readFile(targetPath, "utf8")).toBe(before.target);

		await expect(forget([completeHealth])).resolves.toMatchObject({
			exitCode: 0,
			rows: [{ action: "forget-entry", final: "current" }],
		});
		expect(await readFile(targetPath, "utf8")).toBe(before.target);

		await writeFile(manifestPath, before.manifest);
		await rm(sourceRoot, { recursive: true });
		await expect(forget([])).resolves.toMatchObject({
			exitCode: 0,
			rows: [{ action: "forget-entry", final: "current" }],
		});
		expect(await readFile(targetPath, "utf8")).toBe(before.target);
	});
});

async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch {
		return false;
	}
}
