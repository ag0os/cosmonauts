import { describe, expect, it } from "vitest";
import {
	type DomainBindingResolution,
	DomainBindingResolver,
	type ResolvedAgentReference,
} from "../../lib/domains/bindings.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

function makeDomain(id: string): LoadedDomain {
	return {
		manifest: { id, description: `${id} domain` },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		chains: [],
		provenance: [
			{
				origin: "test",
				precedence: 0,
				kind: "domains-dir",
				rootDir: `/tmp/${id}`,
			},
		],
		rootDirs: [`/tmp/${id}`],
	};
}

describe("DomainBindingResolver", () => {
	it("resolves an unbound role to the same-named active domain with requested and resolved references", () => {
		// @cosmo-behavior plan:domain-authoring#B-007
		const resolver = new DomainBindingResolver({
			registry: new DomainRegistry([makeDomain("ruby-coding")]),
		});

		const roleResolution: DomainBindingResolution =
			resolver.resolveRole("ruby-coding");
		const agentResolution: ResolvedAgentReference =
			resolver.resolveAgentReference("ruby-coding/worker");

		expect(roleResolution).toEqual({
			role: "ruby-coding",
			domainId: "ruby-coding",
			source: "default",
		});
		expect(agentResolution).toEqual({
			requested: {
				role: "ruby-coding",
				agentId: "worker",
				qualifiedId: "ruby-coding/worker",
			},
			resolved: {
				role: "ruby-coding",
				agentId: "worker",
				qualifiedId: "ruby-coding/worker",
			},
			binding: roleResolution,
		});
	});
});
