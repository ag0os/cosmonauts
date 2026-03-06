/**
 * Tests for project config scaffolding during init.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	loadProjectConfig,
	scaffoldProjectConfig,
} from "../../lib/config/loader.ts";
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

	test("scaffolded config contains default workflows", async () => {
		await scaffoldProjectConfig(tmp.path);

		const config = await loadProjectConfig(tmp.path);
		expect(config.workflows).toBeDefined();
		expect(config.workflows?.["plan-and-build"]).toBeDefined();
		expect(config.workflows?.implement).toBeDefined();
		expect(config.workflows?.verify).toBeDefined();
	});

	test("scaffolded config contains skills", async () => {
		await scaffoldProjectConfig(tmp.path);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeDefined();
		expect(config.skills).toContain("typescript");
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

	test("resolveWorkflow succeeds for plan-and-build without any scaffold", async () => {
		// Built-in defaults should be enough
		const wf = await resolveWorkflow("plan-and-build", tmp.path);
		expect(wf.name).toBe("plan-and-build");
	});

	test("all three standard workflows resolve on fresh directory", async () => {
		for (const name of ["plan-and-build", "implement", "verify"]) {
			const wf = await resolveWorkflow(name, tmp.path);
			expect(wf.name).toBe(name);
			expect(wf.chain).toBeTruthy();
		}
	});
});
