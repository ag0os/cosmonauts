import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const PROJECT_EXPORT_BASELINES = [
	{
		assetId: "skill:plan",
		sourcePath: "domains/shared/skills/plan",
		targetPath: ".claude/skills/plan",
		treeSha256:
			"1625946e86e24ee37a1765f4df39c96dd3eaa6af0cbc50e4f057bfb0908341f2",
	},
	{
		assetId: "skill:roadmap",
		sourcePath: "domains/shared/skills/roadmap",
		targetPath: ".claude/skills/roadmap",
		treeSha256:
			"6bfce5bd8f823522d8c7fb43000c6da762ef0b7a0b19f25fe1530a0f699941aa",
	},
	{
		assetId: "skill:skills-cli",
		sourcePath: "domains/shared/skills/skills-cli",
		targetPath: ".claude/skills/skills-cli",
		treeSha256:
			"273b796f42e350707ac28b8cee547d14e1d9de074604864a7a25f1c776402f8b",
	},
	{
		assetId: "skill:task",
		sourcePath: "domains/shared/skills/task",
		targetPath: ".claude/skills/task",
		treeSha256:
			"886ef2a3b0721f98dc26a79ed7cae169330079dc224775dc297c4902f3a894e0",
	},
] as const;

const PERSONAL_BUNDLE_BASELINE = {
	assetId: "external-skill:cosmonauts",
	sourcePath: "external-skills/cosmonauts",
	targetPath: "/Users/cosmos/.claude/skills/cosmonauts",
	treeSha256:
		"543d215db19d89fa079faf60416d4eb63704aa95302f304347af1d01f61a9b35",
} as const;

const PERMANENT_FOREIGN_CONFLICT = {
	assetId: "skill:playwright-cli",
	sourcePath: "bundled/coding/skills/playwright-cli",
	targetPath: ".claude/skills/playwright-cli",
	status: "locally-edited",
	reason: "foreign-or-untraceable",
} as const;

const LIVE_COMMAND_BASELINES = [
	{
		assetId: "command:spec-to-backlog",
		path: "/Users/cosmos/.claude/commands/spec-to-backlog.md",
		byteSha256:
			"1981c27f3c5ffb4f448bd4741a9700f38f013ada366f739f93c38ab8cb588cc7",
	},
	{
		assetId: "command:implement-plan",
		path: "/Users/cosmos/.claude/commands/implement-plan.md",
		byteSha256:
			"b73abe6e6a7d24a43c92cd1d06f95027b645630c289854978faae777d33f037b",
	},
] as const;

const STRICT_CANDIDATE_CASES = {
	nestedOverride: [
		{
			domain: "coding",
			sourceRootId: "coding:override",
			logicalPath: "languages/rails/rails-api",
			outputIdentity: "rails-api",
		},
		{
			domain: "coding",
			sourceRootId: "coding:base",
			logicalPath: "languages/rails/rails-api",
			outputIdentity: "rails-api",
		},
	],
	flat: {
		domain: "project",
		logicalPath: "quick-ref",
		outputIdentity: "quick-ref",
		targetShape: "flat-wrapper",
	},
	collisions: [
		{
			domain: "shared",
			sourceRootId: "shared:base",
			logicalPath: "deploy",
			outputIdentity: "deploy",
		},
		{
			domain: "coding",
			sourceRootId: "coding:override",
			logicalPath: "operations/deploy",
			outputIdentity: "deploy",
		},
		{
			domain: "project",
			sourceRootId: "project:skills",
			logicalPath: "cosmonauts-tasks",
			outputIdentity: "cosmonauts-tasks",
		},
	],
	bundle: {
		assetId: "external-skill:cosmonauts",
		outputIdentity: "cosmonauts",
		reservedNames: [
			"cosmonauts",
			"cosmonauts-chains",
			"cosmonauts-plans",
			"cosmonauts-skills",
			"cosmonauts-tasks",
		],
	},
} as const;

describe("live harness inventory characterization", () => {
	test("identifies exactly four project copies and a separate personal bundle", async () => {
		expect(PROJECT_EXPORT_BASELINES).toHaveLength(4);
		expect(PROJECT_EXPORT_BASELINES.map((row) => row.assetId)).toEqual([
			"skill:plan",
			"skill:roadmap",
			"skill:skills-cli",
			"skill:task",
		]);
		expect(
			PROJECT_EXPORT_BASELINES.some(
				(row) => row.assetId === (PERSONAL_BUNDLE_BASELINE.assetId as string),
			),
		).toBe(false);
		expect(PERSONAL_BUNDLE_BASELINE).toMatchObject({
			assetId: "external-skill:cosmonauts",
			targetPath: "/Users/cosmos/.claude/skills/cosmonauts",
		});

		for (const row of PROJECT_EXPORT_BASELINES) {
			await expect(
				stat(join(process.cwd(), row.sourcePath)),
			).resolves.toBeDefined();
			await expect(
				stat(join(process.cwd(), row.targetPath)),
			).resolves.toBeDefined();
		}
		await expect(
			stat(join(process.cwd(), PERSONAL_BUNDLE_BASELINE.sourcePath)),
		).resolves.toBeDefined();
		await expect(
			stat(PERSONAL_BUNDLE_BASELINE.targetPath),
		).resolves.toBeDefined();
	});

	test("keeps playwright-cli only as the permanent foreign conflict", () => {
		expect(PROJECT_EXPORT_BASELINES.map((row) => row.assetId)).not.toContain(
			"skill:playwright-cli",
		);
		expect(PERSONAL_BUNDLE_BASELINE.assetId).not.toBe("skill:playwright-cli");
		expect(PERMANENT_FOREIGN_CONFLICT).toEqual({
			assetId: "skill:playwright-cli",
			sourcePath: "bundled/coding/skills/playwright-cli",
			targetPath: ".claude/skills/playwright-cli",
			status: "locally-edited",
			reason: "foreign-or-untraceable",
		});
	});

	test("pins both fixed live Claude command byte baselines", async () => {
		for (const baseline of LIVE_COMMAND_BASELINES) {
			const bytes = await readFile(baseline.path);
			expect(createHash("sha256").update(bytes).digest("hex")).toBe(
				baseline.byteSha256,
			);
		}
	});

	test("separates tolerant effective listing from strict healthy collision-aware export candidates", async () => {
		// @cosmo-behavior plan:harness-adapters#B-011
		expect(STRICT_CANDIDATE_CASES.nestedOverride).toHaveLength(2);
		expect(
			new Set(
				STRICT_CANDIDATE_CASES.nestedOverride.map(
					(candidate) => `${candidate.domain}:${candidate.logicalPath}`,
				),
			).size,
		).toBe(1);
		expect(
			[
				...new Set(
					STRICT_CANDIDATE_CASES.collisions.map(
						(candidate) => candidate.outputIdentity,
					),
				),
			].sort(),
		).toEqual(["cosmonauts-tasks", "deploy"]);
		expect(STRICT_CANDIDATE_CASES.flat.targetShape).toBe("flat-wrapper");
		expect(STRICT_CANDIDATE_CASES.bundle.reservedNames).toHaveLength(5);

		const discoveryModule = (await import(
			"../../lib/skills/discovery.ts"
		)) as Record<string, unknown>;
		expect(
			typeof discoveryModule.discoverSkillCandidatesStrict,
			"B-011 requires strict candidate discovery in addition to tolerant listing",
		).toBe("function");

		const inventoryPath = join(
			process.cwd(),
			"lib",
			"harness-adapters",
			"inventory.ts",
		);
		expect(
			existsSync(inventoryPath),
			"B-011 requires collision-aware candidate preparation before writes",
		).toBe(true);
		if (!existsSync(inventoryPath)) return;

		const inventorySource = await readFile(inventoryPath, "utf-8");
		expect(inventorySource).toMatch(/frontmatter-name/);
		expect(inventorySource).toMatch(/collision/i);
		for (const reservedName of STRICT_CANDIDATE_CASES.bundle.reservedNames) {
			expect(inventorySource).toContain(reservedName);
		}

		const inventoryModulePath = "../../lib/harness-adapters/inventory.ts";
		const inventoryModule = (await import(
			/* @vite-ignore */ inventoryModulePath
		)) as Record<string, unknown>;
		const prepare = inventoryModule.prepareSkillExportAssets;
		expect(typeof prepare).toBe("function");
		if (typeof prepare !== "function") return;

		const candidates = [
			...STRICT_CANDIDATE_CASES.nestedOverride,
			STRICT_CANDIDATE_CASES.flat,
			...STRICT_CANDIDATE_CASES.collisions,
		].map((candidate, index) => {
			const sourceRootId =
				"sourceRootId" in candidate ? candidate.sourceRootId : "project:skills";
			return {
				name: candidate.outputIdentity,
				description: `candidate ${index}`,
				dirPath: `/sources/${sourceRootId}/${candidate.logicalPath}`,
				sourceRoot: `/sources/${sourceRootId}`,
				sourcePath: candidate.logicalPath,
				sourceRootId,
				...candidate,
			};
		});
		const sourceHealth = [
			...new Set(candidates.map((candidate) => candidate.sourceRootId)),
		].map((sourceRootId) => ({ sourceRootId, status: "complete" }));
		const prepared = (await prepare({
			candidates,
			sourceHealth,
			staticAssets: [
				{
					...STRICT_CANDIDATE_CASES.bundle,
					kind: "skill",
					ownership: {
						kind: "authority",
						authorityId: "cosmonauts/core",
					},
					sourceRootId: "cosmonauts:external-skills",
					sourceRoot: join(process.cwd(), "external-skills"),
					sourcePath: "cosmonauts",
					logicalPath: "cosmonauts",
					defaultScope: "personal",
				},
			],
		})) as {
			readonly assets: readonly Record<string, unknown>[];
			readonly collisions: readonly Record<string, unknown>[];
		};

		expect(
			prepared.assets.filter((asset) => asset.outputIdentity === "rails-api"),
		).toEqual([
			expect.objectContaining({
				domain: "coding",
				sourceRootId: "coding:override",
				logicalPath: "languages/rails/rails-api",
				outputIdentity: "rails-api",
			}),
		]);
		expect(prepared.assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: "external-skill:cosmonauts",
					outputIdentity: "cosmonauts",
				}),
				expect.objectContaining({
					logicalPath: "quick-ref",
					outputIdentity: "quick-ref",
				}),
			]),
		);
		expect(
			prepared.collisions.map((collision) => collision.outputIdentity).sort(),
		).toEqual(["cosmonauts-tasks", "deploy"]);
	});
});
