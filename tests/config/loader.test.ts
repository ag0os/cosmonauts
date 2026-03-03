/**
 * Tests for project config loader.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadProjectConfig } from "../../lib/config/loader.ts";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "config-test-"));
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("loadProjectConfig", () => {
	test("returns empty config when file does not exist", async () => {
		const config = await loadProjectConfig(tmpDir);
		expect(config).toEqual({});
	});

	test("returns empty config when .cosmonauts dir does not exist", async () => {
		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toBeUndefined();
		expect(config.workflows).toBeUndefined();
	});

	test("parses skills array", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", "react"] }),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("parses workflows object", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.workflows).toEqual({
			deploy: { description: "Deploy workflow", chain: "worker" },
		});
	});

	test("parses config with both skills and workflows", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({
				skills: ["typescript"],
				workflows: {
					plan: { description: "Plan", chain: "planner" },
				},
			}),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toEqual(["typescript"]);
		expect(config.workflows).toBeDefined();
	});

	test("throws on invalid JSON", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadProjectConfig(tmpDir)).rejects.toThrow("Invalid JSON");
	});

	test("throws on non-object JSON (array)", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify([1, 2, 3]),
		);

		await expect(loadProjectConfig(tmpDir)).rejects.toThrow("Invalid config");
	});

	test("returns empty config for empty object", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toBeUndefined();
		expect(config.workflows).toBeUndefined();
	});

	test("filters non-string values from skills array", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", 42, null, "react"] }),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("ignores skills when not an array", async () => {
		await mkdir(join(tmpDir, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmpDir, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: "typescript" }),
		);

		const config = await loadProjectConfig(tmpDir);
		expect(config.skills).toBeUndefined();
	});
});
