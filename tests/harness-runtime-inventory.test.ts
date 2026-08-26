import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

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
	});
});
