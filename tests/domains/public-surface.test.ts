import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	selectPublicAgentIds,
	selectPublicChains,
	selectPublicSkillNames,
} from "../../lib/domains/public-surface.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

function makeAgent(id: string): AgentDefinition {
	return {
		id,
		description: `${id} agent`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain: "writing",
	};
}

function makeDomain(overrides: Partial<LoadedDomain> = {}): LoadedDomain {
	return {
		manifest: { id: "writing", description: "Writing domain" },
		portable: false,
		agents: new Map([
			["editor", makeAgent("editor")],
			["reviewer", makeAgent("reviewer")],
		]),
		capabilities: new Set(),
		prompts: new Set(["editor", "reviewer"]),
		skills: new Set(["style-guide", "outline"]),
		extensions: new Set(),
		chains: [
			{
				name: "draft",
				description: "Draft",
				chain: "editor -> reviewer",
			},
			{
				name: "review",
				description: "Review",
				chain: "reviewer",
			},
		],
		provenance: [
			{
				origin: "test",
				precedence: 0,
				kind: "domains-dir",
				rootDir: "/tmp/writing",
			},
		],
		rootDirs: ["/tmp/writing"],
		...overrides,
	};
}

describe("domain public surface rules", () => {
	it("exposes every discovered asset type when manifest.internal is omitted", () => {
		// @cosmo-behavior plan:domain-authoring#B-005
		const domain = makeDomain();

		expect(selectPublicAgentIds(domain)).toEqual(["editor", "reviewer"]);
		expect(selectPublicSkillNames(domain)).toEqual(["style-guide", "outline"]);
		expect(selectPublicChains(domain).map((chain) => chain.name)).toEqual([
			"draft",
			"review",
		]);
	});
});
