/**
 * Tests for project config loader.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
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
		expect(config.chains).toBeUndefined();
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

	test("parses chains object", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					deploy: {
						description: "Deploy chain",
						chain: "worker",
					},
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.chains).toEqual({
			deploy: { description: "Deploy chain", chain: "worker" },
		});
	});

	test("parses config with both skills and chains", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				skills: ["typescript"],
				chains: {
					plan: { description: "Plan", chain: "planner" },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.skills).toEqual(["typescript"]);
		expect(config.chains).toBeDefined();
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
		expect(config.chains).toBeUndefined();
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

	test("parses activeDomains and domainBindings without changing optional field semantics", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				activeDomains: ["coding", 42, "writing"],
				domainBindings: { "ruby-coding": "ruby-experimental" },
			}),
		);

		const config = await loadProjectConfig(tmp.path);
		expect(config.activeDomains).toEqual(["coding", "writing"]);
		expect(config.domainBindings).toEqual({
			"ruby-coding": "ruby-experimental",
		});
		expect(config.domain).toBeUndefined();
		expect(config.skills).toBeUndefined();
		expect(config.skillPaths).toBeUndefined();
		expect(config.chains).toBeUndefined();
	});

	test("warns on malformed domainBindings shape instead of dropping it silently", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: ["ruby-coding", "ruby-experimental"],
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domainBindings).toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain(
			"Skipping malformed domainBindings",
		);
		expect(warn.mock.calls[0]?.[0]).toContain('{ "coding": "ruby-coding" }');
		expect(warn.mock.calls[0]?.[0]).toContain(
			'["ruby-coding","ruby-experimental"]',
		);
		warn.mockRestore();
	});

	test("warns on a malformed domainBindings entry instead of dropping it silently", async () => {
		// @cosmo-behavior plan:domain-authoring#B-024
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: {
					"ruby-coding": "ruby-experimental",
					badNumber: 42,
					emptyTarget: "",
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domainBindings).toEqual({
			"ruby-coding": "ruby-experimental",
		});
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0]?.[0]).toContain("badNumber");
		expect(warn.mock.calls[0]?.[0]).toContain("42");
		expect(warn.mock.calls[0]?.[0]).toContain("Skipping malformed");
		expect(warn.mock.calls[1]?.[0]).toContain("emptyTarget");
		expect(warn.mock.calls[1]?.[0]).toContain('""');
		warn.mockRestore();
	});

	test("parses only planned architectureMap primitive config fields", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				architectureMap: {
					sourceRoots: ["lib", "src"],
					moduleRoots: ["lib/agents"],
					exclude: ["fixtures"],
					injectionMaxBytes: 12000,
					narrative: { enabled: false, maxModulesPerRun: 4 },
					unknown: { ignored: true },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.architectureMap).toEqual({
			sourceRoots: ["lib", "src"],
			moduleRoots: ["lib/agents"],
			exclude: ["fixtures"],
			injectionMaxBytes: 12000,
			narrative: { enabled: false, maxModulesPerRun: 4 },
		});
	});

	test("warns and ignores malformed architectureMap entries while preserving unrelated config", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domain: "coding",
				architectureMap: {
					sourceRoots: ["lib", 42],
					moduleRoots: "lib/agents",
					exclude: [null, "fixtures"],
					injectionMaxBytes: "large",
					narrative: { enabled: "yes", maxModulesPerRun: 3 },
				},
			}),
		);

		const config = await loadProjectConfig(tmp.path);

		expect(config.domain).toBe("coding");
		expect(config.architectureMap).toEqual({
			sourceRoots: ["lib"],
			exclude: ["fixtures"],
			narrative: { maxModulesPerRun: 3 },
		});
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.sourceRoots entry",
		);
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.moduleRoots",
		);
		expect(warn.mock.calls.map((call) => call[0]).join("\n")).toContain(
			"architectureMap.injectionMaxBytes",
		);
		warn.mockRestore();
	});
});
