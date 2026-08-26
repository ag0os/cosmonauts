import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	cp,
	mkdir,
	readFile,
	realpath,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createCosmonautsInventoryGeneratedNode,
	renderCosmonautsInventory,
} from "../../lib/harness-adapters/inventory.ts";
import {
	getStaticHarnessAsset,
	resolveHarnessAssetTarget,
} from "../../lib/harness-adapters/registry.ts";
import { GENERATED_BY_MARKER } from "../../lib/harness-adapters/render.ts";
import { syncHarnessAsset } from "../../lib/harness-adapters/sync.ts";
import type {
	HarnessAsset,
	RuntimeInventorySnapshot,
} from "../../lib/harness-adapters/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("harness-inventory-");
const TEST_CODING_DOMAIN = `cod${"ing"}`;
const BUNDLED_PLAYWRIGHT_SOURCE = `bundled/${TEST_CODING_DOMAIN}/skills/playwright-cli`;

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
	sourcePath: BUNDLED_PLAYWRIGHT_SOURCE,
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
			domain: TEST_CODING_DOMAIN,
			sourceRootId: `${TEST_CODING_DOMAIN}:override`,
			logicalPath: "languages/rails/rails-api",
			outputIdentity: "rails-api",
		},
		{
			domain: TEST_CODING_DOMAIN,
			sourceRootId: `${TEST_CODING_DOMAIN}:base`,
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
			domain: TEST_CODING_DOMAIN,
			sourceRootId: `${TEST_CODING_DOMAIN}:override`,
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
	test("renders the stable-authority external bundle with exact live inventory bytes and fallbacks", async () => {
		// @cosmo-behavior plan:harness-adapters#B-010
		const snapshot = {
			chains: [
				{
					name: "zeta",
					description: "last",
					expression: "reviewer -> verifier",
				},
				{
					name: "alpha|line\nslash\\tab\tcontrol\u0001",
					description: "first|line\rnext",
					expression: "planner\\pipe| -> worker",
				},
			],
			effectiveSkills: [
				{
					name: "same",
					domain: "shared",
					description: "second domain",
				},
				{
					name: "alpha",
					domain: TEST_CODING_DOMAIN,
					description: "first\\skill|description\ncontinued",
				},
				{
					name: "same",
					domain: TEST_CODING_DOMAIN,
					description: "first domain",
				},
			],
			paths: [
				{
					target: "codex",
					kind: "skill",
					project: ".agents/skills",
					personal: "~/.agents/skills",
				},
				{
					target: "claude",
					kind: "skill",
					project: ".claude/skills",
					personal: "~/.claude/skills",
				},
				{
					target: "claude",
					kind: "command",
					project: ".claude/commands",
					personal: "~/.claude/commands",
				},
				{
					target: "open-code",
					kind: "skill",
					project: ".opencode/skills",
					personal: "~/.opencode/skills",
				},
				{
					target: "claude",
					kind: "agent-package",
					project: ".claude/agents",
					personal: "~/.claude/agents",
				},
			],
			candidates: [],
			sourceHealth: [],
		} as unknown as RuntimeInventorySnapshot;

		const expected = Buffer.from(
			[
				GENERATED_BY_MARKER.toString("utf8").trimEnd(),
				"# Generated Cosmonauts Inventory",
				"",
				"## Named chains",
				"",
				"| Name | Description | Expression |",
				"|---|---|---|",
				"| `alpha\\|line\\nslash\\\\tab\\tcontrol\\u0001` | first\\|line\\rnext | `planner\\\\pipe\\| -> worker` |",
				"| `zeta` | last | `reviewer -> verifier` |",
				"",
				"## Skills",
				"",
				"| Name | Domain | Description |",
				"|---|---|---|",
				`| \`alpha\` | \`${TEST_CODING_DOMAIN}\` | first\\\\skill\\|description\\ncontinued |`,
				`| \`same\` | \`${TEST_CODING_DOMAIN}\` | first domain |`,
				"| `same` | `shared` | second domain |",
				"",
				"## Harness paths",
				"",
				"| Target | Kind | Project | Personal |",
				"|---|---|---|---|",
				"| `claude` | `command` | `.claude/commands` | `~/.claude/commands` |",
				"| `claude` | `skill` | `.claude/skills` | `~/.claude/skills` |",
				"| `codex` | `skill` | `.agents/skills` | `~/.agents/skills` |",
				"",
			].join("\n"),
		);
		expect(renderCosmonautsInventory(snapshot)).toEqual(expected);
		expect(renderCosmonautsInventory(snapshot)).toEqual(expected);
		expect(expected.toString("utf8")).not.toMatch(
			/open-code|agent-package|unsupported/,
		);

		const generated = createCosmonautsInventoryGeneratedNode(snapshot);
		expect(generated).toMatchObject({
			relativePath: "references/generated-inventory.md",
			renderedBytes: expected,
		});
		const mutate = (
			key: "chains" | "effectiveSkills" | "paths",
			value: unknown,
		) =>
			createCosmonautsInventoryGeneratedNode({
				...snapshot,
				[key]: value,
			});
		for (const changed of [
			mutate("chains", [
				...snapshot.chains,
				{ name: "changed", description: "changed", expression: "worker" },
			]),
			mutate("effectiveSkills", [
				...snapshot.effectiveSkills,
				{ name: "changed", domain: "shared", description: "changed" },
			]),
			mutate(
				"paths",
				snapshot.paths.map((row) =>
					row.target === "codex"
						? { ...row, personal: "~/changed/skills" }
						: row,
				),
			),
			mutate("chains", [
				...snapshot.chains.slice(0, 1),
				{
					...snapshot.chains[1],
					description: `${snapshot.chains[1]?.description}\\|\n`,
				},
			]),
		]) {
			expect(Buffer.from(changed.inputBytes)).not.toEqual(
				Buffer.from(generated.inputBytes),
			);
			expect(Buffer.from(changed.renderedBytes)).not.toEqual(expected);
		}

		const bundleFiles = [
			"SKILL.md",
			"chains/SKILL.md",
			"skills/SKILL.md",
			"plans/SKILL.md",
			"tasks/SKILL.md",
		] as const;
		const bundleContents = await Promise.all(
			bundleFiles.map((path) =>
				readFile(
					join(process.cwd(), "external-skills/cosmonauts", path),
					"utf8",
				),
			),
		);
		const discoveryText = bundleContents.slice(0, 3).join("\n");
		expect(discoveryText).toContain("references/generated-inventory.md");
		expect(discoveryText).toContain("cosmonauts run chain list");
		expect(discoveryText).toContain("cosmonauts skills list --json");
		expect(discoveryText).not.toMatch(
			/--list-chains|--list-agents|--list-domains|\.gemini\/|open-code|Common domain defaults|What to actually export/,
		);
		expect(
			existsSync(
				join(
					process.cwd(),
					"external-skills/cosmonauts/references/generated-inventory.md",
				),
			),
		).toBe(false);

		const bundle = getStaticHarnessAsset("external-skill:cosmonauts");
		expect(bundle).toMatchObject({
			assetId: "external-skill:cosmonauts",
			outputIdentity: "cosmonauts",
			defaultScope: "personal",
			ownership: { kind: "authority", authorityId: "cosmonauts/core" },
			reservedNames: STRICT_CANDIDATE_CASES.bundle.reservedNames,
		});
		if (!bundle) throw new Error("Expected the registered bundle asset");

		const projectA = join(tmp.path, "project-a");
		const projectB = join(tmp.path, "project-b");
		const copyHome = join(tmp.path, "copy-home");
		for (const path of [projectA, projectB, copyHome]) {
			await mkdir(path, { recursive: true });
		}
		const canonicalProjectA = await realpath(projectA);
		const canonicalProjectB = await realpath(projectB);
		const copyTarget = resolveHarnessAssetTarget({
			targetId: "claude",
			asset: bundle,
			roots: { projectRoot: projectA, homeRoot: copyHome },
			requestedMode: "copy",
		});
		const installed = await syncHarnessAsset({
			projectRoot: projectA,
			asset: bundle,
			target: copyTarget,
			generatedNodes: [generated],
		});
		expect(installed.manifestEntry).toMatchObject({
			owner: {
				kind: "authority",
				ownerId: "authority:cosmonauts/core",
			},
			generatingProjectRoot: canonicalProjectA,
		});
		expect(
			await readFile(
				join(copyTarget.targetPath, "references/generated-inventory.md"),
			),
		).toEqual(expected);

		const factDrift = await syncHarnessAsset({
			projectRoot: projectA,
			asset: bundle,
			target: copyTarget,
			check: true,
			generatedNodes: [
				mutate("chains", [
					...snapshot.chains,
					{ name: "new", description: "new", expression: "worker" },
				]),
			],
		});
		expect(factDrift).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "source-changed",
		});

		const projectBCheck = await syncHarnessAsset({
			projectRoot: projectB,
			asset: bundle,
			target: copyTarget,
			check: true,
			generatedNodes: [generated],
		});
		expect(projectBCheck).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "regenerated-from-other-project",
			previousGeneratingProjectRoot: canonicalProjectA,
			generatingProjectRoot: canonicalProjectB,
			wroteTarget: false,
			wroteManifest: false,
		});
		const projectBSync = await syncHarnessAsset({
			projectRoot: projectB,
			asset: bundle,
			target: copyTarget,
			generatedNodes: [generated],
		});
		expect(projectBSync).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "regenerated-from-other-project",
			previousGeneratingProjectRoot: canonicalProjectA,
			generatingProjectRoot: canonicalProjectB,
			wroteTarget: true,
			wroteManifest: true,
		});
		expect(projectBSync.beforeStatus).not.toBe("locally-edited");

		const relocatedPackage = join(tmp.path, "relocated-package");
		await cp(
			join(process.cwd(), "external-skills/cosmonauts"),
			join(relocatedPackage, "external-skills/cosmonauts"),
			{ recursive: true },
		);
		const relocatedBundle = {
			...bundle,
			sourceRoot: relocatedPackage,
		} satisfies HarnessAsset;
		const relocated = await syncHarnessAsset({
			projectRoot: projectB,
			asset: relocatedBundle,
			target: copyTarget,
			check: true,
			generatedNodes: [generated],
		});
		expect(relocated.beforeStatus).not.toBe("locally-edited");
		expect(relocated.reason).not.toMatch(/foreign/);

		const wrapperHome = join(tmp.path, "wrapper-home");
		await mkdir(wrapperHome, { recursive: true });
		const wrapperTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: relocatedBundle,
			roots: { projectRoot: projectB, homeRoot: wrapperHome },
			requestedMode: "link",
		});
		const pluginSentinel = join(projectB, "plugin-executed");
		await mkdir(join(projectB, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(projectB, ".cosmonauts", "config.json"),
			JSON.stringify({ pluginDirs: [join(projectB, "untrusted-plugin")] }),
		);
		await syncHarnessAsset({
			projectRoot: projectB,
			asset: relocatedBundle,
			target: wrapperTarget,
			generatedNodes: [generated],
		});
		expect(existsSync(pluginSentinel)).toBe(false);
		expect(
			(
				await stat(
					join(wrapperTarget.targetPath, "references/generated-inventory.md"),
				)
			).isFile(),
		).toBe(true);
		expect(
			(await stat(join(wrapperTarget.targetPath, "SKILL.md"))).isFile(),
		).toBe(true);
		const authoredSource = join(
			relocatedPackage,
			"external-skills/cosmonauts/chains/SKILL.md",
		);
		const authoredTarget = join(wrapperTarget.targetPath, "chains/SKILL.md");
		const authoredBefore = await readFile(authoredSource);
		await writeFile(
			authoredSource,
			Buffer.concat([authoredBefore, Buffer.from("\n")]),
		);
		expect(await readFile(authoredTarget)).toEqual(
			await readFile(authoredSource),
		);
		const authoredLive = await syncHarnessAsset({
			projectRoot: projectB,
			asset: relocatedBundle,
			target: wrapperTarget,
			check: true,
			generatedNodes: [generated],
		});
		expect(authoredLive).toMatchObject({
			beforeStatus: "current",
			reason: "current",
		});
		const wrapperInputDrift = await syncHarnessAsset({
			projectRoot: projectB,
			asset: relocatedBundle,
			target: wrapperTarget,
			check: true,
			generatedNodes: [
				mutate("effectiveSkills", [
					...snapshot.effectiveSkills,
					{ name: "new", domain: "shared", description: "new" },
				]),
			],
		});
		expect(wrapperInputDrift).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "generated-input-changed",
		});
	});

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
			sourcePath: BUNDLED_PLAYWRIGHT_SOURCE,
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
			...STRICT_CANDIDATE_CASES.bundle.reservedNames.map(
				(outputIdentity, index) => ({
					domain: index % 2 === 0 ? "shared" : TEST_CODING_DOMAIN,
					sourceRootId: `reserved:${index}`,
					logicalPath: `reserved/${outputIdentity}`,
					outputIdentity,
				}),
			),
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
		const registeredBundle = getStaticHarnessAsset("external-skill:cosmonauts");
		expect(registeredBundle).toMatchObject({
			assetId: "external-skill:cosmonauts",
			outputIdentity: "cosmonauts",
			ownership: { kind: "authority", authorityId: "cosmonauts/core" },
			reservedNames: STRICT_CANDIDATE_CASES.bundle.reservedNames,
		});
		if (!registeredBundle) throw new Error("Expected registered bundle asset");
		const nestedBundleNames = await Promise.all(
			["", "chains", "plans", "skills", "tasks"].map(async (directory) => {
				const content = await readFile(
					join(
						process.cwd(),
						"external-skills",
						"cosmonauts",
						directory,
						"SKILL.md",
					),
					"utf-8",
				);
				return content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
			}),
		);
		expect(nestedBundleNames).toEqual(
			STRICT_CANDIDATE_CASES.bundle.reservedNames,
		);
		const prepared = (await prepare({
			candidates,
			sourceHealth,
			staticAssets: [registeredBundle],
		})) as {
			readonly assets: readonly Record<string, unknown>[];
			readonly collisions: readonly Record<string, unknown>[];
			readonly reconciliationAuthority: string;
			readonly canReconcile: boolean;
		};

		expect(
			prepared.assets.filter((asset) => asset.outputIdentity === "rails-api"),
		).toEqual([
			expect.objectContaining({
				domain: TEST_CODING_DOMAIN,
				sourceRootId: `${TEST_CODING_DOMAIN}:override`,
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
		).toEqual([
			"cosmonauts",
			"cosmonauts-chains",
			"cosmonauts-plans",
			"cosmonauts-skills",
			"cosmonauts-tasks",
			"deploy",
		]);
		expect(prepared.canReconcile).toBe(false);
		expect(prepared.reconciliationAuthority).toBe("blocked-collision");
		expect(
			prepared.assets.filter(
				(asset) => asset.assetId === "external-skill:cosmonauts",
			),
		).toHaveLength(1);
		expect(
			prepared.assets.some((asset) =>
				STRICT_CANDIDATE_CASES.bundle.reservedNames
					.slice(1)
					.some((name) => asset.assetId === `external-skill:${name}`),
			),
		).toBe(false);
		expect(prepared.assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					logicalPath: "quick-ref",
					flatteningRule: "frontmatter-name",
					targetShape: "flat-wrapper",
				}),
			]),
		);

		const incomplete = (await prepare({
			candidates: candidates.slice(0, 1),
			sourceHealth: [
				{
					sourceRootId: candidates[0]?.sourceRootId,
					status: "incomplete",
				},
			],
			staticAssets: [],
		})) as {
			readonly reconciliationAuthority: string;
			readonly canReconcile: boolean;
		};
		expect(incomplete).toMatchObject({
			reconciliationAuthority: "blocked-incomplete-discovery",
			canReconcile: false,
		});
		expect(inventorySource).not.toMatch(
			/\b(?:writeFile|rename|rm|mkdir|symlink)\s*\(/,
		);
	});
});
