/**
 * Tests for skill exporter.
 */

import {
	lstat,
	mkdir,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { HarnessProvenanceManifest } from "../../lib/harness-adapters/provenance.ts";
import {
	resolveHarnessTransactionPaths,
	serializeHarnessManifest,
} from "../../lib/harness-adapters/provenance.ts";
import {
	digestRenderedFiles,
	renderIdentityMarkdown,
} from "../../lib/harness-adapters/render.ts";
import { observeHarnessNodeSnapshot } from "../../lib/harness-adapters/sync.ts";
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
	test("preserves a target created after lock-held missing classification", async () => {
		const fixture = await createBoundaryMutationFixture("create");
		let observationCount = 0;
		let classifiedMutation: Awaited<
			ReturnType<typeof observeHarnessNodeSnapshot>
		> | null = null;

		const report = await runHarnessSync({
			...boundarySyncOptions(fixture),
			onOwnerGroupTargetsObserved: async () => {
				observationCount += 1;
				if (observationCount !== 2) return;
				await mkdir(fixture.targetPath, { recursive: true });
				await writeFile(
					join(fixture.targetPath, "SKILL.md"),
					"# Local creation\n",
				);
				classifiedMutation = await observeHarnessNodeSnapshot(
					fixture.targetPath,
				);
			},
		});

		expect(observationCount).toBe(2);
		expect(report).toMatchObject({
			exitCode: 1,
			rows: [
				{
					asset: fixture.asset.assetId,
					before: "locally-edited",
					reason: "locally-edited",
					action: "none",
					final: "locally-edited",
				},
			],
		});
		expect(await observeHarnessNodeSnapshot(fixture.targetPath)).toEqual(
			classifiedMutation,
		);
		expect(await readFile(join(fixture.targetPath, "SKILL.md"), "utf8")).toBe(
			"# Local creation\n",
		);
		await expect(exists(fixture.manifestPath)).resolves.toBe(false);
		await expect(exists(fixture.journalPath)).resolves.toBe(false);
	});

	test("preserves a managed target replaced after lock-held classification", async () => {
		const fixture = await createBoundaryMutationFixture("replace");
		await expect(
			runHarnessSync(boundarySyncOptions(fixture)),
		).resolves.toMatchObject({ exitCode: 0 });
		await writeFile(fixture.sourcePath, "# Source v2\n");
		const manifestBefore = await readFile(fixture.manifestPath, "utf8");
		const localTarget = join(fixture.projectRoot, "local-link-target");
		await mkdir(localTarget, { recursive: true });
		await writeFile(join(localTarget, "SKILL.md"), "# Local replacement\n");
		let observationCount = 0;
		let classifiedMutation: Awaited<
			ReturnType<typeof observeHarnessNodeSnapshot>
		> | null = null;

		const report = await runHarnessSync({
			...boundarySyncOptions(fixture),
			onOwnerGroupTargetsObserved: async () => {
				observationCount += 1;
				if (observationCount !== 2) return;
				await rm(fixture.targetPath, { recursive: true });
				await symlink(localTarget, fixture.targetPath, "dir");
				classifiedMutation = await observeHarnessNodeSnapshot(
					fixture.targetPath,
				);
			},
		});

		expect(observationCount).toBe(2);
		expect(report).toMatchObject({
			exitCode: 1,
			rows: [
				{
					asset: fixture.asset.assetId,
					before: "locally-edited",
					reason: "locally-edited",
					action: "none",
					final: "locally-edited",
				},
			],
		});
		expect(await observeHarnessNodeSnapshot(fixture.targetPath)).toEqual(
			classifiedMutation,
		);
		expect((await lstat(fixture.targetPath)).isSymbolicLink()).toBe(true);
		expect(await readlink(fixture.targetPath)).toBe(localTarget);
		expect(await readFile(join(fixture.targetPath, "SKILL.md"), "utf8")).toBe(
			"# Local replacement\n",
		);
		expect(await readFile(fixture.manifestPath, "utf8")).toBe(manifestBefore);
		await expect(exists(fixture.journalPath)).resolves.toBe(false);
	});

	test("aborts source-removal apply when the target changes after lock-held classification", async () => {
		const fixture = await createBoundaryMutationFixture("source-removal");
		await expect(
			runHarnessSync(boundarySyncOptions(fixture)),
		).resolves.toMatchObject({ exitCode: 0 });
		const manifestBefore = {
			contents: await readFile(fixture.manifestPath, "utf8"),
			mtimeMs: (await lstat(fixture.manifestPath)).mtimeMs,
		};
		let observationCount = 0;
		let classifiedMutation: Awaited<
			ReturnType<typeof observeHarnessNodeSnapshot>
		> | null = null;

		const report = await runHarnessSync({
			...boundarySyncOptions(fixture),
			assets: [],
			request: {
				targetIds: ["claude"],
				scopes: ["project"],
				kinds: ["skill"],
				reconciliation: "complete",
				check: false,
			},
			onOwnerGroupTargetsObserved: async () => {
				observationCount += 1;
				if (observationCount !== 2) return;
				await writeFile(
					join(fixture.targetPath, "SKILL.md"),
					"# Local edit before removal\n",
				);
				classifiedMutation = await observeHarnessNodeSnapshot(
					fixture.targetPath,
				);
			},
		});

		expect(observationCount).toBe(2);
		expect(report).toMatchObject({
			exitCode: 1,
			rows: [
				{
					asset: fixture.asset.assetId,
					before: "locally-edited",
					reason: "locally-edited",
					action: "none",
					final: "locally-edited",
				},
			],
		});
		expect(await observeHarnessNodeSnapshot(fixture.targetPath)).toEqual(
			classifiedMutation,
		);
		expect(await readFile(join(fixture.targetPath, "SKILL.md"), "utf8")).toBe(
			"# Local edit before removal\n",
		);
		expect(await readFile(fixture.manifestPath, "utf8")).toBe(
			manifestBefore.contents,
		);
		expect((await lstat(fixture.manifestPath)).mtimeMs).toBe(
			manifestBefore.mtimeMs,
		);
		await expect(exists(fixture.journalPath)).resolves.toBe(false);
	});

	test("refuses malformed manifest path authority without changing any owner bytes", async () => {
		const cases = [
			{
				label: "output-path",
				mutate: async (entry: Record<string, unknown>, _ownerRoot: string) => {
					const settingsPath = join(_ownerRoot, "settings.json");
					const settingsBytes = Buffer.from('{"theme":"untouched"}\n');
					await writeFile(settingsPath, settingsBytes);
					entry.outputPath = settingsPath;
					const provenance = entry.provenance as Record<string, unknown>;
					provenance.baselineDigest = digestRenderedFiles([
						{ relativePath: "", bytes: settingsBytes },
					]);
				},
			},
			{
				label: "output-identity",
				mutate: async (entry: Record<string, unknown>) => {
					entry.outputIdentity = "another-asset";
				},
			},
			{
				label: "owner-shape",
				mutate: async (entry: Record<string, unknown>) => {
					delete (entry.owner as Record<string, unknown>).projectRoot;
				},
			},
			{
				label: "unsupported-adapter",
				mutate: async (entry: Record<string, unknown>) => {
					entry.target = "codex";
					entry.kind = "command";
				},
			},
		] as const;

		for (const testCase of cases) {
			const fixture = await createBoundaryMutationFixture(
				`manifest-${testCase.label}`,
			);
			await expect(
				runHarnessSync(boundarySyncOptions(fixture)),
			).resolves.toMatchObject({ exitCode: 0 });
			const manifest = JSON.parse(
				await readFile(fixture.manifestPath, "utf8"),
			) as { entries: Record<string, Record<string, unknown>> };
			const stored = Object.entries(manifest.entries)[0];
			if (!stored) throw new Error("Expected one installed manifest entry.");
			await testCase.mutate(stored[1], dirname(fixture.manifestPath));
			await writeFile(
				fixture.manifestPath,
				`${JSON.stringify(manifest, null, 2)}\n`,
			);
			const before = await observeHarnessNodeSnapshot(fixture.projectRoot);

			const report = await runHarnessSync({
				...boundarySyncOptions(fixture),
				assets: [],
				request: {
					targetIds: ["claude"],
					scopes: ["project"],
					kinds: ["skill"],
					reconciliation: "complete",
					check: false,
				},
			});

			expect(report).toMatchObject({
				exitCode: 1,
				rows: [
					{
						asset: "(owner-root)",
						action: "failed",
						final: "source-ahead",
					},
				],
			});
			expect(report.rows[0]?.reason).toContain("Invalid harness provenance");
			expect(await observeHarnessNodeSnapshot(fixture.projectRoot)).toEqual(
				before,
			);
		}

		const fixture = await createBoundaryMutationFixture("manifest-key");
		await expect(
			runHarnessSync(boundarySyncOptions(fixture)),
		).resolves.toMatchObject({ exitCode: 0 });
		const manifest = JSON.parse(
			await readFile(fixture.manifestPath, "utf8"),
		) as { entries: Record<string, Record<string, unknown>> };
		const stored = Object.entries(manifest.entries)[0];
		if (!stored) throw new Error("Expected one installed manifest entry.");
		delete manifest.entries[stored[0]];
		manifest.entries['["wrong-owner","wrong-asset"]'] = stored[1];
		await writeFile(
			fixture.manifestPath,
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		const before = await observeHarnessNodeSnapshot(fixture.projectRoot);
		const report = await runHarnessSync({
			...boundarySyncOptions(fixture),
			assets: [],
			request: {
				targetIds: ["claude"],
				scopes: ["project"],
				kinds: ["skill"],
				reconciliation: "complete",
				check: false,
			},
		});
		expect(report.exitCode).toBe(1);
		expect(report.rows[0]?.reason).toContain("Invalid harness provenance");
		expect(await observeHarnessNodeSnapshot(fixture.projectRoot)).toEqual(
			before,
		);
	});

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

	test("uses one stable owner-group observation for catalogue and stale check rows", async () => {
		const projectRoot = join(tmp.path, "stable-check-project");
		const homeRoot = join(tmp.path, "stable-check-home");
		const sourceRoot = join(projectRoot, "stable-check-source");
		await Promise.all([
			mkdir(homeRoot, { recursive: true }),
			mkdir(join(sourceRoot, "current"), { recursive: true }),
			mkdir(join(sourceRoot, "stale"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(join(sourceRoot, "current", "SKILL.md"), "# Current\n"),
			writeFile(join(sourceRoot, "stale", "SKILL.md"), "# Stale\n"),
		]);
		const current = {
			assetId: "skill:stable-current",
			kind: "skill",
			ownership: { kind: "project" },
			sourceRootId: "root:stable-check",
			sourceRoot,
			sourcePath: "current",
			logicalPath: "stable-current",
			outputIdentity: "stable-current",
			defaultScope: "project",
		} as const satisfies HarnessAsset;
		const stale = {
			...current,
			assetId: "skill:stable-stale",
			sourcePath: "stale",
			logicalPath: "stable-stale",
			outputIdentity: "stable-stale",
		} as const satisfies HarnessAsset;
		const sourceHealth = [
			{
				sourceRootId: current.sourceRootId,
				sourceRoot,
				domain: "stable-check",
				status: "complete",
				issues: [],
			},
		] as const satisfies readonly SourceHealthRow[];
		const baseOptions = {
			projectRoot,
			homeRoot,
			sourceHealth,
			request: {
				targetIds: ["claude"],
				scopes: ["project"],
				kinds: ["skill"],
				reconciliation: "complete",
				check: true,
			},
		} as const;
		await expect(
			runHarnessSync({
				...baseOptions,
				assets: [current, stale],
				request: { ...baseOptions.request, check: false },
			}),
		).resolves.toMatchObject({ exitCode: 0 });

		const ownerRoot = join(projectRoot, ".claude");
		const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
		const transactionPaths = resolveHarnessTransactionPaths(
			ownerRoot,
			"claude",
		);
		const assertConsistencyRows = (
			report: Awaited<ReturnType<typeof runHarnessSync>>,
			reason: "concurrent-change" | "pending-journal",
		) => {
			expect(report.exitCode).toBe(1);
			expect(report.rows).toHaveLength(2);
			expect(report.rows.map((row) => row.asset).sort()).toEqual([
				current.assetId,
				stale.assetId,
			]);
			expect(report.rows.every((row) => row.reason === reason)).toBe(true);
			expect(report.rows.every((row) => row.action === "none")).toBe(true);
		};
		await expect(
			runHarnessSync({ ...baseOptions, assets: [current] }),
		).resolves.toMatchObject({
			exitCode: 1,
			rows: expect.arrayContaining([
				expect.objectContaining({
					asset: current.assetId,
					reason: "current",
				}),
				expect.objectContaining({
					asset: stale.assetId,
					reason: "source-removed",
				}),
			]),
		});

		let manifestWindows = 0;
		const concurrentManifest = await runHarnessSync({
			...baseOptions,
			assets: [current],
			onOwnerGroupTargetsObserved: async () => {
				manifestWindows += 1;
				const manifest = JSON.parse(
					await readFile(manifestPath, "utf8"),
				) as HarnessProvenanceManifest;
				const first = Object.entries(manifest.entries)[0];
				if (!first) throw new Error("stable check manifest entry missing");
				const [key, entry] = first;
				await writeFile(
					manifestPath,
					serializeHarnessManifest({
						...manifest,
						entries: {
							...manifest.entries,
							[key]: {
								...entry,
								exportedAt: "2035-01-01T00:00:00.000Z",
							},
						},
					}),
				);
			},
		});
		assertConsistencyRows(concurrentManifest, "concurrent-change");
		expect(manifestWindows).toBe(1);

		let journalWindows = 0;
		const concurrentJournal = await runHarnessSync({
			...baseOptions,
			assets: [current],
			onOwnerGroupTargetsObserved: async () => {
				journalWindows += 1;
				await writeFile(transactionPaths.journalPath, '{"phase":"prepared"}\n');
			},
		});
		assertConsistencyRows(concurrentJournal, "concurrent-change");
		expect(journalWindows).toBe(1);

		const beforePending = {
			manifest: await readFile(manifestPath, "utf8"),
			manifestMtime: (await lstat(manifestPath)).mtimeMs,
			journal: await readFile(transactionPaths.journalPath, "utf8"),
			journalMtime: (await lstat(transactionPaths.journalPath)).mtimeMs,
			current: await readFile(
				join(ownerRoot, "skills", "stable-current", "SKILL.md"),
				"utf8",
			),
			stale: await readFile(
				join(ownerRoot, "skills", "stable-stale", "SKILL.md"),
				"utf8",
			),
		};
		let pendingWindows = 0;
		const pending = await runHarnessSync({
			...baseOptions,
			assets: [current],
			onOwnerGroupTargetsObserved: () => {
				pendingWindows += 1;
			},
		});
		assertConsistencyRows(pending, "pending-journal");
		expect(pendingWindows).toBe(1);
		expect(await readFile(manifestPath, "utf8")).toBe(beforePending.manifest);
		expect((await lstat(manifestPath)).mtimeMs).toBe(
			beforePending.manifestMtime,
		);
		expect(await readFile(transactionPaths.journalPath, "utf8")).toBe(
			beforePending.journal,
		);
		expect((await lstat(transactionPaths.journalPath)).mtimeMs).toBe(
			beforePending.journalMtime,
		);
		expect(
			await readFile(
				join(ownerRoot, "skills", "stable-current", "SKILL.md"),
				"utf8",
			),
		).toBe(beforePending.current);
		expect(
			await readFile(
				join(ownerRoot, "skills", "stable-stale", "SKILL.md"),
				"utf8",
			),
		).toBe(beforePending.stale);
		await expect(exists(transactionPaths.lockPath)).resolves.toBe(false);

		const emptyOwnerRoot = join(projectRoot, ".agents");
		const emptyTransactionPaths = resolveHarnessTransactionPaths(
			emptyOwnerRoot,
			"codex",
		);
		await writeFile(
			emptyTransactionPaths.journalPath,
			'{"phase":"prepared"}\n',
		);
		const emptyJournalBefore = {
			bytes: await readFile(emptyTransactionPaths.journalPath, "utf8"),
			mtime: (await lstat(emptyTransactionPaths.journalPath)).mtimeMs,
		};
		await expect(
			runHarnessSync({
				projectRoot,
				homeRoot,
				assets: [],
				sourceHealth: [],
				request: {
					targetIds: ["codex"],
					scopes: ["project"],
					kinds: ["skill"],
					reconciliation: "complete",
					check: true,
				},
			}),
		).resolves.toMatchObject({
			exitCode: 1,
			rows: [{ asset: "(owner-root)", reason: "pending-journal" }],
		});
		expect(await readFile(emptyTransactionPaths.journalPath, "utf8")).toBe(
			emptyJournalBefore.bytes,
		);
		expect((await lstat(emptyTransactionPaths.journalPath)).mtimeMs).toBe(
			emptyJournalBefore.mtime,
		);
		await expect(exists(emptyOwnerRoot)).resolves.toBe(false);
		await expect(exists(emptyTransactionPaths.lockPath)).resolves.toBe(false);
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

interface BoundaryMutationFixture {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly sourcePath: string;
	readonly asset: HarnessAsset;
	readonly sourceHealth: readonly SourceHealthRow[];
	readonly targetPath: string;
	readonly manifestPath: string;
	readonly journalPath: string;
}

async function createBoundaryMutationFixture(
	label: string,
): Promise<BoundaryMutationFixture> {
	const projectRoot = join(tmp.path, `boundary-${label}-project`);
	const homeRoot = join(tmp.path, `boundary-${label}-home`);
	const sourceRoot = join(projectRoot, "source");
	const sourcePath = join(sourceRoot, "skill", "SKILL.md");
	await Promise.all([
		mkdir(homeRoot, { recursive: true }),
		mkdir(join(sourceRoot, "skill"), { recursive: true }),
	]);
	await writeFile(sourcePath, "# Source\n");
	const asset = {
		assetId: `skill:boundary-${label}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: `root:boundary-${label}`,
		sourceRoot,
		sourcePath: "skill",
		logicalPath: `boundary-${label}`,
		outputIdentity: `boundary-${label}`,
		defaultScope: "project",
	} as const satisfies HarnessAsset;
	const ownerRoot = join(projectRoot, ".claude");
	return {
		projectRoot,
		homeRoot,
		sourcePath,
		asset,
		sourceHealth: [
			{
				sourceRootId: asset.sourceRootId,
				sourceRoot,
				domain: `boundary-${label}`,
				status: "complete",
				issues: [],
			},
		],
		targetPath: join(ownerRoot, "skills", `boundary-${label}`),
		manifestPath: join(ownerRoot, ".cosmonauts-harness-manifest.json"),
		journalPath: resolveHarnessTransactionPaths(ownerRoot, "claude")
			.journalPath,
	};
}

function boundarySyncOptions(fixture: BoundaryMutationFixture) {
	return {
		projectRoot: fixture.projectRoot,
		homeRoot: fixture.homeRoot,
		assets: [fixture.asset],
		sourceHealth: fixture.sourceHealth,
		request: {
			targetIds: ["claude"],
			scopes: ["project"],
			assetIds: [fixture.asset.assetId],
			reconciliation: "partial",
			check: false,
		},
	} as const;
}
