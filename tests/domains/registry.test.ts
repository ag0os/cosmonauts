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
		rootDir: `/tmp/${id}`,
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
});
