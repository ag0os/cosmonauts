import { describe, expect, it } from "vitest";
import {
	NoDefaultDomainError,
	resolveDefaultDomain,
} from "../../lib/domains/default-domain.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

function makeDomain(id: string): LoadedDomain {
	return {
		manifest: { id, description: `Test ${id}` },
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
				rootDir: `/test/${id}`,
			},
		],
		rootDirs: [`/test/${id}`],
	};
}

function makeResolver(domainIds: readonly string[]): DomainResolver {
	return new DomainResolver(
		new DomainRegistry(domainIds.map((id) => makeDomain(id))),
	);
}

describe("resolveDefaultDomain", () => {
	it("returns main for missing explicit domain when main is installed", () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-001
		const resolver = makeResolver(["shared", "main"]);

		expect(resolveDefaultDomain({ resolver })).toBe("main");
	});

	it("returns an explicit domain without consulting the fallback", () => {
		const resolver = makeResolver(["shared"]);

		expect(
			resolveDefaultDomain({
				explicitDomain: "custom",
				resolver,
			}),
		).toBe("custom");
	});

	it("throws a no default domain error when main is unavailable", () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-002
		const resolver = makeResolver(["shared"]);

		expect(() =>
			resolveDefaultDomain({
				resolver,
				purpose: "synthetic agent definition",
			}),
		).toThrow(NoDefaultDomainError);
		expect(() =>
			resolveDefaultDomain({
				resolver,
				purpose: "synthetic agent definition",
			}),
		).toThrow(
			'[no-default-domain] No default domain "main" is installed; synthetic agent definition requires an explicit domain.',
		);

		try {
			resolveDefaultDomain({
				resolver,
				purpose: "synthetic agent definition",
			});
		} catch (error) {
			expect(error).toBeInstanceOf(NoDefaultDomainError);
			expect((error as NoDefaultDomainError).domain).toBe("main");
			expect((error as Error).message).not.toContain("coding");
		}
	});

	it("returns main for missing explicit domain when no resolver can prove absence", () => {
		expect(resolveDefaultDomain()).toBe("main");
	});
});
