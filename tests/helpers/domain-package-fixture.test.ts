import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDomainsFromSources } from "../../lib/domains/loader.ts";
import { scanDomainSources } from "../../lib/packages/scanner.ts";
import { writeProjectInstalledDomainPackage } from "./domain-package-fixture.ts";
import { useTempDir } from "./fs.ts";

const tmp = useTempDir("domain-package-fixture-test-");

describe("synthetic domain package fixture", () => {
	it("loads a synthetic installable domain package through the package scanner", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-014
		const projectRoot = join(tmp.path, "project");
		const builtinDomainsDir = join(tmp.path, "domains");
		await mkdir(projectRoot, { recursive: true });
		await mkdir(builtinDomainsDir, { recursive: true });

		const fixture = await writeProjectInstalledDomainPackage(projectRoot, {
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
		});

		expect(fixture.packageRoot).toBe(
			join(projectRoot, ".cosmonauts", "packages", "synthetic-coding"),
		);
		expect(fixture.domainRoot).toBe(fixture.packageRoot);

		const sources = await scanDomainSources({
			builtinDomainsDir,
			projectRoot,
		});
		expect(sources).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domainsDir: fixture.packageRoot,
					origin: "local:synthetic-coding",
					precedence: 2,
					sourceType: "domain-root",
				}),
			]),
		);

		const packageSources = sources.filter(
			(source) =>
				source.origin === "builtin" ||
				source.origin === "local:synthetic-coding",
		);
		const domains = await loadDomainsFromSources(packageSources, undefined, {
			activeDomainIds: [fixture.domainId],
		});
		const domain = domains.find(
			(candidate) => candidate.manifest.id === "ruby-coding",
		);

		expect(domain).toBeDefined();
		expect(domain?.manifest).toMatchObject({
			id: "ruby-coding",
			description: "Synthetic Ruby coding domain",
			lead: "captain",
		});
		expect(domain?.portable).toBe(true);
		expect([...(domain?.agents.keys() ?? [])].sort()).toEqual([
			"captain",
			"worker",
		]);
		expect(domain?.agents.get("captain")).toMatchObject({
			id: "captain",
			domain: "ruby-coding",
			capabilities: ["navigation"],
			skills: ["mission-brief"],
			subagents: ["ruby-coding/worker"],
		});
		expect(domain?.prompts).toEqual(new Set(["captain", "worker"]));
		expect(domain?.capabilities).toEqual(new Set(["navigation"]));
		expect(domain?.skills).toEqual(new Set(["mission-brief"]));
		expect(domain?.chains).toEqual([
			{
				name: "survey",
				description: "Survey a target",
				chain: "captain -> worker",
			},
		]);
		expect(domain?.provenance).toEqual([
			{
				origin: "local:synthetic-coding",
				precedence: 2,
				kind: "domain-root",
				rootDir: fixture.packageRoot,
			},
		]);
		expect(domain?.rootDirs).toEqual([fixture.packageRoot]);
	});
});
