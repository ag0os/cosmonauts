/**
 * Tests for project config scaffolding during init.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createDefaultProjectConfig } from "../../lib/config/defaults.ts";
import { scaffoldProjectConfig } from "../../lib/config/loader.ts";
import { resolveWorkflow } from "../../lib/workflows/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("config-scaffold-test-");

describe("scaffoldProjectConfig", () => {
	test("creates .cosmonauts/config.json in empty directory", async () => {
		const created = await scaffoldProjectConfig(tmp.path);

		expect(created).toBe(true);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		await expect(access(configPath)).resolves.toBeUndefined();
	});

	test("scaffolded config matches canonical defaults", async () => {
		await scaffoldProjectConfig(tmp.path);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		const raw = await readFile(configPath, "utf-8");
		const config = JSON.parse(raw);
		const expected = createDefaultProjectConfig();
		const planAndBuildChain = config.workflows["plan-and-build"]?.chain ?? "";
		const implementChain = config.workflows.implement?.chain ?? "";

		expect(config).toEqual(expected);
		expect(config.skills).toEqual(expected.skills);
		expect(config.workflows).toEqual(expected.workflows);
		expect(config.workflows["plan-and-build"]).toBeDefined();
		expect(config.workflows.implement).toBeDefined();
		expect(config.workflows.verify).toBeDefined();
		expect(config.workflows.verify.description).toContain(
			"fixer-only remediation",
		);
		expect(planAndBuildChain).toContain("integration-verifier");
		expect(planAndBuildChain.indexOf("integration-verifier")).toBeLessThan(
			planAndBuildChain.indexOf("quality-manager"),
		);
		expect(implementChain).toContain("integration-verifier");
		expect(implementChain).toContain("integration-verifier -> quality-manager");
	});

	test("createDefaultProjectConfig returns a fresh object", () => {
		const first = createDefaultProjectConfig();
		const second = createDefaultProjectConfig();
		const firstPlanAndBuild = first.workflows?.["plan-and-build"]?.chain ?? "";
		const firstImplement = first.workflows?.implement?.chain ?? "";

		expect(first).toEqual(second);
		expect(first).not.toBe(second);
		expect(first.skills).not.toBe(second.skills);
		expect(first.workflows).not.toBe(second.workflows);
		expect(first.workflows?.["plan-and-build"]).not.toBe(
			second.workflows?.["plan-and-build"],
		);
		expect(first.workflows?.verify?.description).toContain(
			"fixer-only remediation",
		);
		expect(firstPlanAndBuild).toContain("integration-verifier");
		expect(firstPlanAndBuild).toContain(
			"integration-verifier -> quality-manager",
		);
		expect(firstImplement).toContain("integration-verifier");
		expect(firstImplement).toContain("integration-verifier -> quality-manager");
	});

	test("does not overwrite existing config.json", async () => {
		const configDir = join(tmp.path, ".cosmonauts");
		await mkdir(configDir, { recursive: true });
		const customConfig = JSON.stringify({ skills: ["python"] });
		await writeFile(join(configDir, "config.json"), customConfig, "utf-8");

		const created = await scaffoldProjectConfig(tmp.path);

		expect(created).toBe(false);

		// Verify original content is preserved
		const content = await readFile(join(configDir, "config.json"), "utf-8");
		expect(JSON.parse(content)).toEqual({ skills: ["python"] });
	});

	test("is idempotent — second call returns false", async () => {
		const first = await scaffoldProjectConfig(tmp.path);
		const second = await scaffoldProjectConfig(tmp.path);

		expect(first).toBe(true);
		expect(second).toBe(false);
	});

	test("scaffolded config produces valid JSON", async () => {
		await scaffoldProjectConfig(tmp.path);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		const raw = await readFile(configPath, "utf-8");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});

describe("fresh project bootstrap path", () => {
	test("resolveWorkflow succeeds for plan-and-build after scaffold", async () => {
		await scaffoldProjectConfig(tmp.path);

		const wf = await resolveWorkflow("plan-and-build", tmp.path);
		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBeTruthy();
	});

	test("resolveWorkflow throws without scaffold (no built-in defaults)", async () => {
		await expect(resolveWorkflow("plan-and-build", tmp.path)).rejects.toThrow(
			'Unknown workflow "plan-and-build"',
		);
	});

	test("all three standard workflows resolve after scaffold", async () => {
		await scaffoldProjectConfig(tmp.path);

		for (const name of ["plan-and-build", "implement", "verify"]) {
			const wf = await resolveWorkflow(name, tmp.path);
			expect(wf.name).toBe(name);
			expect(wf.chain).toBeTruthy();
		}
	});
});
