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
		manifest: { id, description: `Test ${id}`, default: id === "main" },
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
	it("returns the declared default when no explicit domain is given", () => {
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

	it("throws a neutral no default domain error when no default is declared", () => {
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
			"[no-default-domain] No default domain is declared; synthetic agent definition requires an explicit domain or a declared default.",
		);

		try {
			resolveDefaultDomain({
				resolver,
				purpose: "synthetic agent definition",
			});
		} catch (error) {
			expect(error).toBeInstanceOf(NoDefaultDomainError);
			expect((error as Error).message).not.toContain('"main"');
			expect((error as Error).message).not.toContain("coding");
		}
	});

	it("requires a consumer default for resolver-less callers", () => {
		expect(() => resolveDefaultDomain()).toThrow(NoDefaultDomainError);
		expect(resolveDefaultDomain({ defaultDomain: "studio" })).toBe("studio");
	});
});
