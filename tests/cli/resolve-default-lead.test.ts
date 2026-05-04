import { describe, expect, test } from "vitest";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { resolveDefaultLead } from "../../lib/agents/resolve-default-lead.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/index.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

function makeAgent(domain: string, id: string): AgentDefinition {
	return {
		id,
		description: `${domain}/${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain,
	};
}

function makeDomain(
	id: string,
	lead: string | undefined,
	agentIds: readonly string[] = [],
): LoadedDomain {
	return {
		manifest: {
			id,
			description: `${id} domain`,
			...(lead ? { lead } : {}),
		},
		portable: id !== "shared" && id !== "main",
		agents: new Map(
			agentIds.map((agentId) => [agentId, makeAgent(id, agentId)]),
		),
		capabilities: new Set(),
		prompts: new Set(agentIds),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: [],
	};
}

function makeRuntime(domains: readonly LoadedDomain[], domainContext?: string) {
	return {
		domains,
		domainContext,
		domainRegistry: new DomainRegistry([...domains]),
		agentRegistry: createRegistryFromDomains(domains),
	};
}

function expectAgent(
	definition: AgentDefinition,
	domain: string,
	id: string,
): void {
	expect(definition.domain).toBe(domain);
	expect(definition.id).toBe(id);
}

describe("resolveDefaultLead", () => {
	test("returns the explicit agent flag before default leads", () => {
		const runtime = makeRuntime([
			makeDomain("shared", undefined),
			makeDomain("main", "cosmo", ["cosmo"]),
			makeDomain("coding", "cody", ["cody"]),
		]);

		const definition = resolveDefaultLead(runtime, { agent: "cody" });

		expectAgent(definition, "coding", "cody");
	});

	test("returns the domain-context lead before the main lead", () => {
		const runtime = makeRuntime(
			[
				makeDomain("shared", undefined),
				makeDomain("main", "cosmo", ["cosmo"]),
				makeDomain("coding", "cody", ["cody"]),
			],
			"coding",
		);

		const definition = resolveDefaultLead(runtime, {});

		expectAgent(definition, "coding", "cody");
	});

	test("returns main/cosmo when main and coding are installed", () => {
		const runtime = makeRuntime([
			makeDomain("shared", undefined),
			makeDomain("main", "cosmo", ["cosmo"]),
			makeDomain("coding", "cody", ["cody"]),
		]);

		const definition = resolveDefaultLead(runtime, {});

		expectAgent(definition, "main", "cosmo");
	});

	test("returns the first non-shared non-main domain lead when main is absent", () => {
		const runtime = makeRuntime([
			makeDomain("shared", undefined),
			makeDomain("coding", "cody", ["cody"]),
		]);

		const definition = resolveDefaultLead(runtime, {});

		expectAgent(definition, "coding", "cody");
	});

	test("throws when no installed domain has a lead", () => {
		const runtime = makeRuntime([makeDomain("shared", undefined)]);

		expect(() => resolveDefaultLead(runtime, {})).toThrow(
			"No domain with a lead agent installed",
		);
	});
});
