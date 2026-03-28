import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

function makeDomain(
	id: string,
	overrides: Partial<LoadedDomain> = {},
): LoadedDomain {
	return {
		manifest: { id, description: `Domain ${id}` },
		portable: false,
		agents: new Map<string, AgentDefinition>(),
		capabilities: new Set<string>(),
		prompts: new Set<string>(),
		skills: new Set<string>(),
		extensions: new Set<string>(),
		workflows: [],
		rootDirs: [`/tmp/${id}`],
		...overrides,
	};
}

describe("DomainRegistry", () => {
	it("constructs from an array of loaded domains", () => {
		const registry = new DomainRegistry([
			makeDomain("shared"),
			makeDomain("coding"),
		]);
		expect(registry.listIds()).toEqual(["shared", "coding"]);
	});

	it("returns undefined for unknown domain ID", () => {
		const registry = new DomainRegistry([makeDomain("shared")]);
		expect(registry.get("nonexistent")).toBeUndefined();
	});

	it("get returns the loaded domain", () => {
		const domain = makeDomain("coding");
		const registry = new DomainRegistry([domain]);
		expect(registry.get("coding")).toBe(domain);
	});

	it("has returns true for registered domains", () => {
		const registry = new DomainRegistry([makeDomain("coding")]);
		expect(registry.has("coding")).toBe(true);
		expect(registry.has("nonexistent")).toBe(false);
	});

	it("listIds returns all domain IDs", () => {
		const registry = new DomainRegistry([
			makeDomain("shared"),
			makeDomain("coding"),
			makeDomain("writing"),
		]);
		expect(registry.listIds()).toEqual(["shared", "coding", "writing"]);
	});

	it("listAll returns all loaded domains", () => {
		const domains = [makeDomain("shared"), makeDomain("coding")];
		const registry = new DomainRegistry(domains);
		const all = registry.listAll();
		expect(all).toHaveLength(2);
		expect(all[0]?.manifest.id).toBe("shared");
		expect(all[1]?.manifest.id).toBe("coding");
	});

	it("handles empty domain list", () => {
		const registry = new DomainRegistry([]);
		expect(registry.listIds()).toEqual([]);
		expect(registry.listAll()).toEqual([]);
		expect(registry.has("anything")).toBe(false);
	});
});

describe("DomainRegistry.resolveCapability", () => {
	it("resolves from preferred domain first", () => {
		const coding = makeDomain("coding", {
			capabilities: new Set(["coding-readwrite"]),
		});
		const shared = makeDomain("shared", {
			capabilities: new Set(["core"]),
		});
		const registry = new DomainRegistry([shared, coding]);

		const result = registry.resolveCapability("coding-readwrite", "coding");
		expect(result).toBe(coding);
	});

	it("falls back to shared when preferred domain lacks capability", () => {
		const coding = makeDomain("coding", {
			capabilities: new Set(["coding-readwrite"]),
		});
		const shared = makeDomain("shared", {
			capabilities: new Set(["core"]),
		});
		const registry = new DomainRegistry([shared, coding]);

		const result = registry.resolveCapability("core", "coding");
		expect(result).toBe(shared);
	});

	it("resolves from shared when no preferred domain specified", () => {
		const shared = makeDomain("shared", {
			capabilities: new Set(["core", "tasks"]),
		});
		const registry = new DomainRegistry([shared]);

		expect(registry.resolveCapability("core")).toBe(shared);
		expect(registry.resolveCapability("tasks")).toBe(shared);
	});

	it("returns undefined when no domain has the capability", () => {
		const shared = makeDomain("shared", {
			capabilities: new Set(["core"]),
		});
		const registry = new DomainRegistry([shared]);

		expect(registry.resolveCapability("nonexistent")).toBeUndefined();
	});

	it("returns undefined when preferred domain does not exist and shared lacks it", () => {
		const shared = makeDomain("shared", {
			capabilities: new Set(["core"]),
		});
		const registry = new DomainRegistry([shared]);

		expect(
			registry.resolveCapability("missing", "nonexistent"),
		).toBeUndefined();
	});

	it("resolves from portable domain (tier 2) when agent domain lacks capability", () => {
		const shared = makeDomain("shared");
		const coding = makeDomain("coding");
		const pkg = makeDomain("pkg", {
			manifest: { id: "pkg", description: "Portable", portable: true },
			portable: true,
			capabilities: new Set(["portable-cap"]),
		});
		const registry = new DomainRegistry([shared, coding, pkg]);

		expect(registry.resolveCapability("portable-cap", "coding")).toBe(pkg);
	});

	it("agent domain (tier 1) wins over portable domain (tier 2)", () => {
		const shared = makeDomain("shared");
		const coding = makeDomain("coding", {
			capabilities: new Set(["cap"]),
		});
		const pkg = makeDomain("pkg", {
			manifest: { id: "pkg", description: "Portable", portable: true },
			portable: true,
			capabilities: new Set(["cap"]),
		});
		const registry = new DomainRegistry([shared, coding, pkg]);

		expect(registry.resolveCapability("cap", "coding")).toBe(coding);
	});

	it("portable domain (tier 2) wins over shared (tier 3)", () => {
		const shared = makeDomain("shared", { capabilities: new Set(["cap"]) });
		const coding = makeDomain("coding");
		const pkg = makeDomain("pkg", {
			manifest: { id: "pkg", description: "Portable", portable: true },
			portable: true,
			capabilities: new Set(["cap"]),
		});
		const registry = new DomainRegistry([shared, coding, pkg]);

		expect(registry.resolveCapability("cap", "coding")).toBe(pkg);
	});

	it("searches portable domains in registry discovery order", () => {
		const shared = makeDomain("shared");
		const coding = makeDomain("coding");
		const alpha = makeDomain("alpha", {
			manifest: { id: "alpha", description: "Portable alpha", portable: true },
			portable: true,
			capabilities: new Set(["cap"]),
		});
		const beta = makeDomain("beta", {
			manifest: { id: "beta", description: "Portable beta", portable: true },
			portable: true,
			capabilities: new Set(["cap"]),
		});
		const registry = new DomainRegistry([shared, coding, alpha, beta]);

		// alpha was registered first so it wins
		expect(registry.resolveCapability("cap", "coding")).toBe(alpha);
	});

	it("skips non-portable non-agent domains", () => {
		const shared = makeDomain("shared");
		const coding = makeDomain("coding");
		const writing = makeDomain("writing", {
			capabilities: new Set(["prose-cap"]),
		}); // not portable
		const registry = new DomainRegistry([shared, coding, writing]);

		expect(registry.resolveCapability("prose-cap", "coding")).toBeUndefined();
	});
});

describe("DomainRegistry.listPortable", () => {
	it("returns empty array when no portable domains are registered", () => {
		const registry = new DomainRegistry([
			makeDomain("shared"),
			makeDomain("coding"),
		]);
		expect(registry.listPortable()).toEqual([]);
	});

	it("returns all domains with portable = true", () => {
		const pkg1 = makeDomain("pkg1", {
			manifest: { id: "pkg1", description: "Portable 1", portable: true },
			portable: true,
		});
		const pkg2 = makeDomain("pkg2", {
			manifest: { id: "pkg2", description: "Portable 2", portable: true },
			portable: true,
		});
		const coding = makeDomain("coding"); // not portable
		const registry = new DomainRegistry([
			makeDomain("shared"),
			coding,
			pkg1,
			pkg2,
		]);

		const portable = registry.listPortable();
		expect(portable).toHaveLength(2);
		expect(portable.map((d) => d.manifest.id)).toContain("pkg1");
		expect(portable.map((d) => d.manifest.id)).toContain("pkg2");
	});

	it("does not include non-portable domains", () => {
		const registry = new DomainRegistry([
			makeDomain("shared"),
			makeDomain("coding"),
			makeDomain("pkg", {
				manifest: { id: "pkg", description: "Portable", portable: true },
				portable: true,
			}),
		]);

		const portable = registry.listPortable();
		const ids = portable.map((d) => d.manifest.id);
		expect(ids).not.toContain("shared");
		expect(ids).not.toContain("coding");
		expect(ids).toContain("pkg");
	});
});
