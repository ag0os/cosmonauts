/**
 * Tests for CLI chain resolution — verifying that domain-provided chains
 * are correctly aggregated and passed through to chain listing/resolution.
 *
 * These tests validate the integration pattern used in cli/main.ts:
 * selectDomainChains(domains, domainContext) → passed to
 * listNamedChains/resolveNamedChain.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	listNamedChains,
	resolveNamedChain,
	selectDomainChains,
} from "../../lib/chains/loader.ts";
import type { NamedChain } from "../../lib/chains/types.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("cli-chain-resolution-");

/**
 * Helper: build domain chains the same way cli/main.ts does.
 */
function aggregateDomainChains(
	domains: Pick<LoadedDomain, "manifest" | "chains">[],
	domainContext?: string,
): NamedChain[] {
	return selectDomainChains(domains as LoadedDomain[], domainContext);
}

describe("CLI chain resolution — domain chains without project config", () => {
	test("listNamedChains returns domain defaults when no config exists", async () => {
		const domains = [
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					{
						name: "implement",
						description: "From existing plan",
						chain: "task-manager -> coordinator -> quality-manager",
					},
					{
						name: "verify",
						description: "Review and remediation",
						chain: "quality-manager",
					},
				],
			},
			{
				manifest: { id: "shared", description: "Shared" },
				chains: [],
			},
		];

		const domainChains = aggregateDomainChains(domains);
		const listed = await listNamedChains(tmp.path, domainChains);

		expect(listed).toHaveLength(3);
		expect(listed.map((w) => w.name)).toEqual(
			expect.arrayContaining(["plan-and-build", "implement", "verify"]),
		);
	});

	test("resolveNamedChain finds domain chain without project config", async () => {
		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
				],
			},
		]);

		const wf = await resolveNamedChain(
			"plan-and-build",
			tmp.path,
			domainChains,
		);

		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBe(
			"planner -> task-manager -> coordinator -> quality-manager",
		);
	});

	test("resolveNamedChain throws for unknown name with domain chains", async () => {
		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		await expect(
			resolveNamedChain("nonexistent", tmp.path, domainChains),
		).rejects.toThrow('Unknown named chain "nonexistent"');
	});
});

describe("CLI chain resolution — project config overrides domain chains", () => {
	test("project config chain overrides domain chain on name collision", async () => {
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

		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Default pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					{
						name: "verify",
						description: "Review",
						chain: "quality-manager",
					},
				],
			},
		]);

		const chains = await listNamedChains(tmp.path, domainChains);

		// Should have 2: overridden plan-and-build + domain verify
		expect(chains).toHaveLength(2);

		const pab = chains.find((w) => w.name === "plan-and-build");
		expect(pab?.chain).toBe("worker"); // project config wins
		expect(pab?.description).toBe("Custom pipeline");

		const verify = chains.find((w) => w.name === "verify");
		expect(verify?.chain).toBe("quality-manager"); // domain default preserved
	});

	test("resolveNamedChain returns project override instead of domain default", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				chains: {
					implement: {
						description: "Custom implement",
						chain: "coordinator",
					},
				},
			}),
		);

		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "implement",
						description: "Domain implement",
						chain: "task-manager -> coordinator -> quality-manager",
					},
				],
			},
		]);

		const wf = await resolveNamedChain("implement", tmp.path, domainChains);

		expect(wf.chain).toBe("coordinator"); // project config wins
		expect(wf.description).toBe("Custom implement");
	});

	test("project config adds new chains alongside domain defaults", async () => {
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

		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		const chains = await listNamedChains(tmp.path, domainChains);

		expect(chains).toHaveLength(2);
		expect(chains.map((w) => w.name)).toEqual(
			expect.arrayContaining(["plan-and-build", "deploy"]),
		);
	});
});

describe("CLI chain resolution — multiple domains", () => {
	test("aggregates chains from multiple domains", async () => {
		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "shared", description: "Shared" },
				chains: [],
			},
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "plan-and-build",
						description: "Coding pipeline",
						chain: "planner -> coordinator",
					},
					{
						name: "verify",
						description: "Review",
						chain: "quality-manager",
					},
				],
			},
		]);

		const listed = await listNamedChains(tmp.path, domainChains);

		expect(listed).toHaveLength(2);
		expect(listed.map((w) => w.name)).toContain("plan-and-build");
		expect(listed.map((w) => w.name)).toContain("verify");
	});

	test("later domain chains override earlier ones on name collision", async () => {
		// Simulates two domains both defining 'build'
		const domainChains = aggregateDomainChains([
			{
				manifest: { id: "shared", description: "Shared" },
				chains: [
					{
						name: "build",
						description: "Generic build",
						chain: "worker",
					},
				],
			},
			{
				manifest: { id: "coding", description: "Coding" },
				chains: [
					{
						name: "build",
						description: "Coding build",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		const listed = await listNamedChains(tmp.path, domainChains);

		// The loader iterates in order, so later domain overwrites earlier
		expect(listed).toHaveLength(1);
		const build = listed.find((w) => w.name === "build");
		expect(build?.description).toBe("Coding build");
		expect(build?.chain).toBe("planner -> coordinator");
	});

	test("filters chains to the selected domain while keeping shared ones", async () => {
		const domainChains = aggregateDomainChains(
			[
				{
					manifest: { id: "shared", description: "Shared" },
					chains: [
						{
							name: "shared-check",
							description: "Shared chain",
							chain: "reviewer",
						},
					],
				},
				{
					manifest: { id: "coding", description: "Coding" },
					chains: [
						{
							name: "plan-and-build",
							description: "Coding pipeline",
							chain: "planner -> coordinator",
						},
					],
				},
				{
					manifest: { id: "docs", description: "Docs" },
					chains: [
						{
							name: "publish",
							description: "Docs pipeline",
							chain: "writer",
						},
					],
				},
			],
			"docs",
		);

		expect(domainChains.map((w) => w.name)).toEqual([
			"shared-check",
			"publish",
		]);
	});
});
