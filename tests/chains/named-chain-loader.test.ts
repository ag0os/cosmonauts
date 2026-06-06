/**
 * Tests for chain loader.
 *
 * Chains come from two sources: domain-provided defaults and
 * project config (`.cosmonauts/config.json`). Project config takes
 * precedence on name collision.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	listNamedChains,
	loadNamedChains,
	resolveNamedChain,
} from "../../lib/chains/loader.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("chain-test-");

describe("loadNamedChains", () => {
	test("returns empty array when no config file exists", async () => {
		const chains = await loadNamedChains(tmp.path);

		expect(chains).toEqual([]);
	});

	test("loads chains from project config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					"plan-and-build": {
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					implement: {
						description: "From existing plan",
						chain: "task-manager -> coordinator -> quality-manager",
					},
					verify: {
						description: "Review and remediation",
						chain: "quality-manager",
					},
				},
			}),
		);

		const chains = await loadNamedChains(tmp.path);

		expect(chains.length).toBe(3);
		expect(chains.map((w) => w.name)).toContain("plan-and-build");
		expect(chains.map((w) => w.name)).toContain("implement");
		expect(chains.map((w) => w.name)).toContain("verify");
	});

	test("loads single chain from config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					refactor: {
						description: "Refactoring chain",
						chain: "planner -> task-manager -> coordinator",
					},
				},
			}),
		);

		const chains = await loadNamedChains(tmp.path);

		expect(chains.length).toBe(1);
		expect(chains[0]?.name).toBe("refactor");
		expect(chains[0]?.chain).toBe("planner -> task-manager -> coordinator");
	});

	test("loads a project chain named list as registry data", async () => {
		// @cosmo-behavior plan:orchestration-surface-consolidation#B-011
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					list: {
						description: "Project list chain",
						chain: "planner -> reviewer",
					},
				},
			}),
		);

		const chains = await loadNamedChains(tmp.path);

		expect(chains).toEqual([
			{
				name: "list",
				description: "Project list chain",
				chain: "planner -> reviewer",
			},
		]);
	});

	test("invalid JSON throws descriptive error", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			"not valid json {{{",
		);

		await expect(loadNamedChains(tmp.path)).rejects.toThrow("Invalid JSON");
	});

	test("empty config returns empty array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({}),
		);

		const chains = await loadNamedChains(tmp.path);
		expect(chains).toEqual([]);
	});

	test("config with only skills and no chains returns empty array", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ skills: ["typescript"] }),
		);

		const chains = await loadNamedChains(tmp.path);
		expect(chains).toEqual([]);
	});
});

describe("resolveNamedChain", () => {
	test("throws for any chain name when no config exists", async () => {
		await expect(resolveNamedChain("plan-and-build", tmp.path)).rejects.toThrow(
			'Unknown named chain "plan-and-build"',
		);
	});

	test("resolves project-defined chain", async () => {
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

		const wf = await resolveNamedChain("deploy", tmp.path);
		expect(wf.name).toBe("deploy");
		expect(wf.chain).toBe("worker");
	});

	test("throws for unknown chain name with config", async () => {
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

		await expect(resolveNamedChain("nonexistent", tmp.path)).rejects.toThrow(
			'Unknown named chain "nonexistent"',
		);
	});
});

describe("listNamedChains", () => {
	test("returns empty array when no config exists", async () => {
		const listed = await listNamedChains(tmp.path);
		expect(listed).toEqual([]);
	});

	test("returns same result as loadNamedChains", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					build: {
						description: "Build chain",
						chain: "planner -> coordinator",
					},
				},
			}),
		);

		const loaded = await loadNamedChains(tmp.path);
		const listed = await listNamedChains(tmp.path);

		expect(listed).toEqual(loaded);
	});
});

describe("domain chain merging", () => {
	test("merges domain chains with project config", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					deploy: { description: "Deploy", chain: "worker" },
				},
			}),
		);

		const domainChains = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
			{ name: "verify", description: "Review", chain: "quality-manager" },
		];

		const chains = await loadNamedChains(tmp.path, domainChains);
		expect(chains).toHaveLength(3);
		expect(chains.map((w) => w.name)).toContain("plan-and-build");
		expect(chains.map((w) => w.name)).toContain("verify");
		expect(chains.map((w) => w.name)).toContain("deploy");
	});

	test("project config overrides domain chain on name collision", async () => {
		// @cosmo-behavior plan:orchestration-surface-consolidation#B-015
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					"plan-and-build": {
						description: "Custom pipeline",
						chain: "worker",
					},
				},
			}),
		);

		const domainChains = [
			{
				name: "plan-and-build",
				description: "Default pipeline",
				chain: "planner -> coordinator",
			},
		];

		const chains = await loadNamedChains(tmp.path, domainChains);
		expect(chains).toHaveLength(1);
		const pab = chains.find((w) => w.name === "plan-and-build");
		expect(pab?.chain).toBe("worker"); // project config wins
		expect(pab?.description).toBe("Custom pipeline");
	});

	test("domain chains returned when no project config exists", async () => {
		const domainChains = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
		];

		const chains = await loadNamedChains(tmp.path, domainChains);
		expect(chains).toHaveLength(1);
		expect(chains[0]?.name).toBe("plan-and-build");
	});

	test("resolveNamedChain finds domain-provided chain", async () => {
		const domainChains = [
			{
				name: "plan-and-build",
				description: "Full pipeline",
				chain: "planner -> coordinator",
			},
		];

		const wf = await resolveNamedChain(
			"plan-and-build",
			tmp.path,
			domainChains,
		);
		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBe("planner -> coordinator");
	});

	test("listNamedChains includes domain chains", async () => {
		const domainChains = [
			{ name: "verify", description: "Review", chain: "quality-manager" },
		];

		const listed = await listNamedChains(tmp.path, domainChains);
		expect(listed).toHaveLength(1);
		expect(listed[0]?.name).toBe("verify");
	});
});
