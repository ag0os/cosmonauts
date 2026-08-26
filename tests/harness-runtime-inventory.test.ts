import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { LoadedDomain } from "../lib/domains/types.ts";
import { composeHarnessRuntimeInventory } from "../lib/harness-runtime-inventory.ts";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("harness-runtime-inventory-");

function makeDomain(rootDirs: readonly string[]): LoadedDomain {
	return {
		manifest: { id: "shared", description: "shared domain" },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		chains: [],
		provenance: [],
		rootDirs,
	};
}

describe("harness runtime inventory characterization", () => {
	test("keeps named-chain discovery on cosmonauts run chain list", async () => {
		const [runSource, mainSource, bundleSource, chainsSource] =
			await Promise.all([
				readFile(join(process.cwd(), "cli", "run", "subcommand.ts"), "utf-8"),
				readFile(join(process.cwd(), "cli", "main.ts"), "utf-8"),
				readFile(
					join(process.cwd(), "external-skills", "cosmonauts", "SKILL.md"),
					"utf-8",
				),
				readFile(
					join(
						process.cwd(),
						"external-skills",
						"cosmonauts",
						"chains",
						"SKILL.md",
					),
					"utf-8",
				),
			]);

		expect(runSource).toContain('.command("chain")');
		expect(runSource).toContain('expressionOrName === "list"');
		expect(runSource).toMatch(
			/listNamedChains\(projectRoot, runtime\.chains\)/,
		);
		expect(bundleSource).toContain("cosmonauts run chain list");
		expect(chainsSource).toContain("cosmonauts run chain list");
		expect(mainSource).not.toContain("--list-chains");
	});

	test("requires one outer composer for chain effective-skill candidate health and path rows", async () => {
		// @cosmo-behavior plan:harness-adapters#B-011
		const composerPath = join(
			process.cwd(),
			"lib",
			"harness-runtime-inventory.ts",
		);
		expect(
			existsSync(composerPath),
			"B-011 requires the outer runtime inventory composer",
		).toBe(true);
		if (!existsSync(composerPath)) return;

		const source = await readFile(composerPath, "utf-8");
		expect(source).toMatch(/listNamedChains/);
		expect(source).toMatch(/discoverSkills/);
		expect(source).toMatch(/discoverSkillCandidatesStrict/);
		expect(source).toMatch(/effectiveSkills/);
		expect(source).toMatch(/sourceHealth/);
		expect(source).toMatch(/paths/);
		expect(source).not.toMatch(/CosmonautsRuntime\.create/);
		expect(source).not.toMatch(/child_process|execFile|spawn\(/);

		const overrideRoot = join(tmp.path, "override");
		const baseRoot = join(tmp.path, "base");
		for (const [root, description] of [
			[overrideRoot, "override plan"],
			[baseRoot, "base plan"],
		] as const) {
			const skillDir = join(root, "skills", "plan");
			await mkdir(skillDir, { recursive: true });
			await writeFile(
				join(skillDir, "SKILL.md"),
				`---\nname: plan\ndescription: ${description}\n---\n`,
			);
		}
		const runtime = {
			projectConfig: {},
			domains: [makeDomain([overrideRoot, baseRoot])],
			domainContext: undefined,
			chains: [
				{
					name: "verify",
					description: "Verify changes",
					chain: "reviewer -> verifier",
				},
			],
		} as unknown as CosmonautsRuntime;
		const snapshot = await composeHarnessRuntimeInventory({
			projectRoot: tmp.path,
			runtime,
		});

		expect(snapshot.chains).toEqual([
			{
				name: "verify",
				description: "Verify changes",
				expression: "reviewer -> verifier",
			},
		]);
		expect(snapshot.effectiveSkills).toEqual([
			{
				name: "plan",
				domain: "shared",
				description: "override plan",
			},
		]);
		expect(snapshot.candidates).toHaveLength(2);
		expect(snapshot.sourceHealth).toEqual([
			expect.objectContaining({ sourceRoot: overrideRoot, status: "complete" }),
			expect.objectContaining({ sourceRoot: baseRoot, status: "complete" }),
		]);
		expect(snapshot.paths).toEqual([
			{
				target: "claude",
				kind: "command",
				project: join(".claude", "commands"),
				personal: join("~", ".claude", "commands"),
			},
			{
				target: "claude",
				kind: "skill",
				project: join(".claude", "skills"),
				personal: join("~", ".claude", "skills"),
			},
			{
				target: "codex",
				kind: "skill",
				project: join(".agents", "skills"),
				personal: join("~", ".agents", "skills"),
			},
		]);
	});
});
