import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useTempDir } from "./fs.ts";
import { loadProjectInstalledSyntheticDomainPackage } from "./packages.ts";

const tmp = useTempDir("package-helper-test-");

describe("synthetic installable domain package helper", () => {
	it("writes and loads a project-installed package through scanner and loader seams", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-014
		const projectRoot = join(tmp.path, "project");
		const builtinDomainsDir = join(tmp.path, "domains");
		await mkdir(projectRoot, { recursive: true });
		await mkdir(builtinDomainsDir, { recursive: true });

		const fixture = await loadProjectInstalledSyntheticDomainPackage({
			projectRoot,
			builtinDomainsDir,
			package: {
				packageName: "synthetic-coding",
				domainId: "ruby-coding",
				domainDescription: "Synthetic Ruby coding domain",
				lead: "captain",
				portable: true,
				agents: [
					{
						id: "captain",
						capabilities: ["navigation"],
						skills: ["mission-brief"],
						subagents: ["ruby-coding/worker"],
					},
					{ id: "worker", capabilities: ["navigation"] },
				],
				prompts: {
					captain: "Captain persona.",
					worker: "Worker persona.",
				},
				capabilities: {
					navigation: "Navigation capability.",
				},
				skills: {
					"mission-brief": "# Mission Brief\n",
				},
				chains: [
					{
						name: "survey",
						description: "Survey a target",
						chain: "captain -> worker",
					},
				],
			},
		});

		expect(fixture.packageRoot).toBe(
			join(projectRoot, ".cosmonauts", "packages", "synthetic-coding"),
		);
		expect(fixture.domainRoot).toBe(fixture.packageRoot);
		expect(fixture.sources).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domainsDir: fixture.packageRoot,
					origin: "local:synthetic-coding",
					precedence: 2,
					sourceType: "domain-root",
				}),
			]),
		);
		expect(fixture.packageSources).toEqual([
			expect.objectContaining({ origin: "builtin" }),
			expect.objectContaining({ origin: "local:synthetic-coding" }),
		]);

		const { domain } = fixture;
		expect(domain.manifest).toMatchObject({
			id: "ruby-coding",
			description: "Synthetic Ruby coding domain",
			lead: "captain",
		});
		expect(domain.portable).toBe(true);
		expect([...domain.agents.keys()].sort()).toEqual(["captain", "worker"]);
		expect(domain.agents.get("captain")).toMatchObject({
			id: "captain",
			domain: "ruby-coding",
			capabilities: ["navigation"],
			skills: ["mission-brief"],
			subagents: ["ruby-coding/worker"],
		});
		expect(domain.prompts).toEqual(new Set(["captain", "worker"]));
		expect(domain.capabilities).toEqual(new Set(["navigation"]));
		expect(domain.skills).toEqual(new Set(["mission-brief"]));
		expect(domain.chains).toEqual([
			{
				name: "survey",
				description: "Survey a target",
				chain: "captain -> worker",
			},
		]);
		expect(domain.provenance).toEqual([
			{
				origin: "local:synthetic-coding",
				precedence: 2,
				kind: "domain-root",
				rootDir: fixture.packageRoot,
			},
		]);
		expect(domain.rootDirs).toEqual([fixture.packageRoot]);
	});
});
