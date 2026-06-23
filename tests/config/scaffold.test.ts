/**
 * Tests for project config scaffolding during init.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import chains from "../../bundled/coding/chains.ts";
import { resolveNamedChain } from "../../lib/chains/loader.ts";
import { createDefaultProjectConfig } from "../../lib/config/defaults.ts";
import { scaffoldProjectConfig } from "../../lib/config/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("config-scaffold-test-");

describe("scaffoldProjectConfig", () => {
	test("creates .cosmonauts/config.json in empty directory", async () => {
		const created = await scaffoldProjectConfig(tmp.path);

		expect(created).toBe(true);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		await expect(access(configPath)).resolves.toBeUndefined();
	});

	test("scaffolded config matches the canonical (minimal) default", async () => {
		await scaffoldProjectConfig(tmp.path);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		const config = JSON.parse(await readFile(configPath, "utf-8"));

		expect(config).toEqual(createDefaultProjectConfig());
	});

	test("scaffolded config does not declare chains", async () => {
		await scaffoldProjectConfig(tmp.path);

		const configPath = join(tmp.path, ".cosmonauts", "config.json");
		const config = JSON.parse(await readFile(configPath, "utf-8"));

		expect(config.chains).toBeUndefined();
	});

	test("createDefaultProjectConfig returns a fresh object each call", () => {
		const first = createDefaultProjectConfig();
		const second = createDefaultProjectConfig();

		expect(first).toEqual(second);
		expect(first).not.toBe(second);
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

describe("chain resolution after scaffold", () => {
	test("domain chains resolve whether or not a config was scaffolded", async () => {
		const before = await resolveNamedChain("plan-and-build", tmp.path, chains);
		expect(before.name).toBe("plan-and-build");
		expect(before.chain).toBeTruthy();

		await scaffoldProjectConfig(tmp.path);

		// The scaffolded (empty) config adds nothing — resolution is unchanged.
		const after = await resolveNamedChain("plan-and-build", tmp.path, chains);
		expect(after.chain).toBe(before.chain);
	});

	test("standard domain chains resolve after scaffold", async () => {
		await scaffoldProjectConfig(tmp.path);

		for (const name of ["plan-and-build", "implement", "verify"]) {
			const wf = await resolveNamedChain(name, tmp.path, chains);
			expect(wf.name).toBe(name);
			expect(wf.chain).toBeTruthy();
		}
	});

	test("resolveNamedChain throws for an unknown chain", async () => {
		await scaffoldProjectConfig(tmp.path);

		await expect(
			resolveNamedChain("does-not-exist", tmp.path, chains),
		).rejects.toThrow('Unknown named chain "does-not-exist"');
	});

	test("resolveNamedChain throws when no domain chains are available", async () => {
		await scaffoldProjectConfig(tmp.path);

		await expect(resolveNamedChain("plan-and-build", tmp.path)).rejects.toThrow(
			'Unknown named chain "plan-and-build"',
		);
	});
});
