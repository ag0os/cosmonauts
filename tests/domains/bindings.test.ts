import { describe, expect, it } from "vitest";
import {
	type DomainBindingResolution,
	DomainBindingResolver,
	DomainBindingTargetError,
	isDomainBindingTargetError,
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

describe("isDomainBindingTargetError", () => {
	function namedError(fields: Record<string, unknown>): Error {
		return Object.assign(new Error("binding"), {
			name: "DomainBindingTargetError",
			...fields,
		});
	}

	it("accepts the library's own error", () => {
		expect(
			isDomainBindingTargetError(
				new DomainBindingTargetError("worker", "ghost"),
			),
		).toBe(true);
	});

	it("accepts a same-name error from another module instance that carries both fields", () => {
		expect(
			isDomainBindingTargetError(
				namedError({ role: "worker", targetDomain: "ghost" }),
			),
		).toBe(true);
	});

	it("rejects a same-name error missing its role", () => {
		expect(
			isDomainBindingTargetError(namedError({ targetDomain: "ghost" })),
		).toBe(false);
	});

	it("rejects a same-name error missing its target domain", () => {
		expect(isDomainBindingTargetError(namedError({ role: "worker" }))).toBe(
			false,
		);
	});

	it("rejects a same-name error whose fields are not strings", () => {
		expect(
			isDomainBindingTargetError(
				namedError({ role: 1, targetDomain: "ghost" }),
			),
		).toBe(false);
		expect(
			isDomainBindingTargetError(
				namedError({ role: "worker", targetDomain: {} }),
			),
		).toBe(false);
	});

	it("rejects an error with both fields but another name", () => {
		expect(
			isDomainBindingTargetError(
				Object.assign(new Error("binding"), {
					role: "worker",
					targetDomain: "ghost",
				}),
			),
		).toBe(false);
	});
});
