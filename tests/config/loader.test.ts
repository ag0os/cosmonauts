/**
 * Tests for project config loader.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadProjectConfig } from "../../lib/config/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("config-test-");

describe("loadProjectConfig", () => {
	test("returns empty config when file does not exist", async () => {
		const config = await loadProjectConfig(tmp.path);
		expect(config).toEqual({});
	});

	test("returns empty config when .cosmonauts dir does not exist", async () => {
		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
		expect(config.workflows).toBeUndefined();
	});

	test("throws on read errors other than missing file", async () => {
		await mkdir(join(tmp.path, ".cosmonauts", "config.json"), {
			recursive: true,
		});
		await expect(loadProjectConfig(tmp.path)).rejects.toThrow();
	});

	test("parses domain string", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ domain: "coding" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBe("coding");
	});

	test("defaults domain to undefined when not provided", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBeUndefined();
	});

	test("ignores domain when not a string", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ domain: 42 }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.domain).toBeUndefined();
	});

	test("parses skills array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", "react"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("parses workflows object", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.workflows).toEqual({
			deploy: { description: "Deploy workflow", chain: "worker" },
		});
	});

	test("parses config with both skills and workflows", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				skills: ["typescript"],
				workflows: {
					plan: { description: "Plan", chain: "planner" },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript"]);
		expect(config.workflows).toBeDefined();
	});

	test("throws on invalid JSON", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadProjectConfig(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("throws on non-object JSON (array)", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify([1, 2, 3]),
		);

		await expect(loadProjectConfig(tmp.path)).rejects.toThrow("Invalid config");
	});

	test("returns empty config for empty object", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
		expect(config.workflows).toBeUndefined();
	});

	test("filters non-string values from skills array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript", 42, null, "react"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript", "react"]);
	});

	test("ignores skills when not an array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: "typescript" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toBeUndefined();
	});

	test("parses skillPaths and resolves them relative to project root", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: [".claude/skills", ".codex/skills"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([
			resolve(tmp.path, ".claude/skills"),
			resolve(tmp.path, ".codex/skills"),
		]);
	});

	test("expands tilde in skillPaths to home directory", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: ["~/.claude/skills"] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([join(homedir(), ".claude/skills")]);
	});

	test("filters non-string values from skillPaths", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: ["./skills", 42, null] }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toEqual([resolve(tmp.path, "./skills")]);
	});

	test("ignores skillPaths when not an array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skillPaths: "/some/path" }),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skillPaths).toBeUndefined();
	});
});
