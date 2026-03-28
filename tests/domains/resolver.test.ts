import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

// ============================================================================
// Helpers
// ============================================================================

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
		rootDirs: [`/domains/${id}`],
		...overrides,
	} as LoadedDomain;
}

function makePortableDomain(
	id: string,
	overrides: Partial<LoadedDomain> = {},
): LoadedDomain {
	return makeDomain(id, {
		manifest: { id, description: `Portable domain ${id}`, portable: true },
		portable: true,
		...overrides,
	});
}

// ============================================================================
// DomainResolver construction
// ============================================================================

describe("DomainResolver", () => {
	it("exposes the registry via getter", () => {
		const domains = [makeDomain("shared"), makeDomain("coding")];
		const registry = new DomainRegistry(domains);
		const resolver = new DomainResolver(registry);
		expect(resolver.registry).toBe(registry);
	});

	it("fromSingleDir constructs a resolver with registry", () => {
		const domains = [makeDomain("shared"), makeDomain("coding")];
		const resolver = DomainResolver.fromSingleDir("/some/dir", domains);
		expect(resolver.registry).toBeInstanceOf(DomainRegistry);
		expect(resolver.registry.listIds()).toEqual(["shared", "coding"]);
	});

	it("fromSingleDir ignores the dir argument (domains carry their own rootDirs)", () => {
		const domains = [makeDomain("shared")];
		const resolver = DomainResolver.fromSingleDir("/ignored", domains);
		expect(resolver.resolveBasePath()).toBe("/domains/shared/prompts/base.md");
	});
});

// ============================================================================
// resolveBasePath / resolveRuntimeTemplatePath — always from shared
// ============================================================================

describe("resolveBasePath", () => {
	it("returns the shared base.md path", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared"), makeDomain("coding")]),
		);
		expect(resolver.resolveBasePath()).toBe("/domains/shared/prompts/base.md");
	});

	it("returns undefined when shared domain is not registered", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("coding")]),
		);
		expect(resolver.resolveBasePath()).toBeUndefined();
	});
});

describe("resolveRuntimeTemplatePath", () => {
	it("returns the shared sub-agent template path", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared")]),
		);
		expect(resolver.resolveRuntimeTemplatePath()).toBe(
			"/domains/shared/prompts/runtime/sub-agent.md",
		);
	});

	it("returns undefined when shared domain is not registered", () => {
		const resolver = new DomainResolver(new DomainRegistry([]));
		expect(resolver.resolveRuntimeTemplatePath()).toBeUndefined();
	});
});

// ============================================================================
// resolveCapabilityPath — three-tier
// ============================================================================

describe("resolveCapabilityPath", () => {
	it("resolves from agent's own domain (tier 1)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { capabilities: new Set(["core"]) }),
				makeDomain("coding", { capabilities: new Set(["core"]) }),
			]),
		);
		expect(resolver.resolveCapabilityPath("core", "coding")).toBe(
			"/domains/coding/capabilities/core.md",
		);
	});

	it("falls back to portable domain when agent domain lacks capability (tier 2)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding"),
				makePortableDomain("utils", { capabilities: new Set(["shared-cap"]) }),
			]),
		);
		expect(resolver.resolveCapabilityPath("shared-cap", "coding")).toBe(
			"/domains/utils/capabilities/shared-cap.md",
		);
	});

	it("falls back to shared domain when neither agent nor portable provide the capability (tier 3)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { capabilities: new Set(["core"]) }),
				makeDomain("coding"),
			]),
		);
		expect(resolver.resolveCapabilityPath("core", "coding")).toBe(
			"/domains/shared/capabilities/core.md",
		);
	});

	it("returns undefined when no domain provides the capability", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared"), makeDomain("coding")]),
		);
		expect(resolver.resolveCapabilityPath("missing", "coding")).toBeUndefined();
	});

	it("tier 1 wins over tier 2 portable", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding", { capabilities: new Set(["cap"]) }),
				makePortableDomain("utils", { capabilities: new Set(["cap"]) }),
			]),
		);
		expect(resolver.resolveCapabilityPath("cap", "coding")).toBe(
			"/domains/coding/capabilities/cap.md",
		);
	});

	it("tier 2 portable wins over tier 3 shared", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { capabilities: new Set(["cap"]) }),
				makeDomain("coding"),
				makePortableDomain("utils", { capabilities: new Set(["cap"]) }),
			]),
		);
		expect(resolver.resolveCapabilityPath("cap", "coding")).toBe(
			"/domains/utils/capabilities/cap.md",
		);
	});

	it("portable domains are searched in registry discovery order", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding"),
				makePortableDomain("alpha", { capabilities: new Set(["cap"]) }),
				makePortableDomain("beta", { capabilities: new Set(["cap"]) }),
			]),
		);
		// alpha comes first in registry order
		expect(resolver.resolveCapabilityPath("cap", "coding")).toBe(
			"/domains/alpha/capabilities/cap.md",
		);
	});
});

// ============================================================================
// resolvePersonaPath — three-tier
// ============================================================================

describe("resolvePersonaPath", () => {
	it("resolves from agent's own domain (tier 1)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { prompts: new Set(["worker"]) }),
				makeDomain("coding", { prompts: new Set(["worker"]) }),
			]),
		);
		expect(resolver.resolvePersonaPath("worker", "coding")).toBe(
			"/domains/coding/prompts/worker.md",
		);
	});

	it("falls back to portable domain (tier 2)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding"),
				makePortableDomain("extra", { prompts: new Set(["analyst"]) }),
			]),
		);
		expect(resolver.resolvePersonaPath("analyst", "coding")).toBe(
			"/domains/extra/prompts/analyst.md",
		);
	});

	it("falls back to shared (tier 3)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { prompts: new Set(["base"]) }),
				makeDomain("coding"),
			]),
		);
		expect(resolver.resolvePersonaPath("base", "coding")).toBe(
			"/domains/shared/prompts/base.md",
		);
	});

	it("returns undefined when no domain provides the persona", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared"), makeDomain("coding")]),
		);
		expect(resolver.resolvePersonaPath("unknown", "coding")).toBeUndefined();
	});
});

// ============================================================================
// resolveExtensionPath — three-tier
// ============================================================================

describe("resolveExtensionPath", () => {
	it("resolves from agent's own domain (tier 1)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { extensions: new Set(["tasks"]) }),
				makeDomain("coding", { extensions: new Set(["tasks"]) }),
			]),
		);
		expect(resolver.resolveExtensionPath("tasks", "coding")).toBe(
			"/domains/coding/extensions/tasks",
		);
	});

	it("falls back to portable domain (tier 2)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding"),
				makePortableDomain("extras", { extensions: new Set(["custom-ext"]) }),
			]),
		);
		expect(resolver.resolveExtensionPath("custom-ext", "coding")).toBe(
			"/domains/extras/extensions/custom-ext",
		);
	});

	it("falls back to shared (tier 3)", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { extensions: new Set(["todo"]) }),
				makeDomain("coding"),
			]),
		);
		expect(resolver.resolveExtensionPath("todo", "coding")).toBe(
			"/domains/shared/extensions/todo",
		);
	});

	it("returns undefined when no domain provides the extension", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared"), makeDomain("coding")]),
		);
		expect(resolver.resolveExtensionPath("missing", "coding")).toBeUndefined();
	});
});

// ============================================================================
// shared domain is always last regardless of portable flag
// ============================================================================

describe("shared domain resolution order", () => {
	it("shared is always searched last even if it has portable flag", () => {
		// shared marked portable should still be last
		const sharedDomain: LoadedDomain = {
			manifest: { id: "shared", description: "Shared", portable: true },
			portable: true,
			agents: new Map(),
			capabilities: new Set(["cap"]),
			prompts: new Set(),
			skills: new Set(),
			extensions: new Set(),
			workflows: [],
			rootDirs: ["/domains/shared"],
		};
		const resolver = new DomainResolver(
			new DomainRegistry([
				sharedDomain,
				makePortableDomain("portable", { capabilities: new Set(["cap"]) }),
			]),
		);
		// portable should win over shared
		expect(resolver.resolveCapabilityPath("cap", "other")).toBe(
			"/domains/portable/capabilities/cap.md",
		);
	});

	it("non-portable non-agent domains are not searched", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding"),
				// writing is not portable, not the agent domain, not shared — skipped
				makeDomain("writing", { capabilities: new Set(["cap"]) }),
			]),
		);
		expect(resolver.resolveCapabilityPath("cap", "coding")).toBeUndefined();
	});
});

// ============================================================================
// allSkillDirs
// ============================================================================

describe("allSkillDirs", () => {
	it("returns skill dirs from all domains with shared last", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { skills: new Set(["shell"]) }),
				makeDomain("coding", { skills: new Set(["typescript"]) }),
			]),
		);
		expect(resolver.allSkillDirs()).toEqual([
			"/domains/coding/skills",
			"/domains/shared/skills",
		]);
	});

	it("omits domains with no skills", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared"),
				makeDomain("coding", { skills: new Set(["typescript"]) }),
			]),
		);
		expect(resolver.allSkillDirs()).toEqual(["/domains/coding/skills"]);
	});

	it("returns empty array when no domains have skills", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([makeDomain("shared"), makeDomain("coding")]),
		);
		expect(resolver.allSkillDirs()).toEqual([]);
	});

	it("non-shared domains appear before shared", () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("shared", { skills: new Set(["s"]) }),
				makePortableDomain("pkg", { skills: new Set(["p"]) }),
				makeDomain("coding", { skills: new Set(["c"]) }),
			]),
		);
		const dirs = resolver.allSkillDirs();
		const sharedIdx = dirs.indexOf("/domains/shared/skills");
		const pkgIdx = dirs.indexOf("/domains/pkg/skills");
		const codingIdx = dirs.indexOf("/domains/coding/skills");
		expect(sharedIdx).toBeGreaterThan(pkgIdx);
		expect(sharedIdx).toBeGreaterThan(codingIdx);
	});
});

// ============================================================================
// fromSingleDir
// ============================================================================

describe("DomainResolver.fromSingleDir", () => {
	it("creates a working resolver with correct registry", () => {
		const domains = [
			makeDomain("shared", { capabilities: new Set(["core"]) }),
			makeDomain("coding", { capabilities: new Set(["coding-rw"]) }),
		];
		const resolver = DomainResolver.fromSingleDir("/my/domains", domains);

		expect(resolver.registry.has("shared")).toBe(true);
		expect(resolver.registry.has("coding")).toBe(true);
		expect(resolver.resolveCapabilityPath("core", "coding")).toBe(
			"/domains/shared/capabilities/core.md",
		);
		expect(resolver.resolveCapabilityPath("coding-rw", "coding")).toBe(
			"/domains/coding/capabilities/coding-rw.md",
		);
	});

	it("handles empty domain list", () => {
		const resolver = DomainResolver.fromSingleDir("/dir", []);
		expect(resolver.registry.listIds()).toEqual([]);
		expect(resolver.resolveBasePath()).toBeUndefined();
	});

	it("works identically to constructor with equivalent registry", () => {
		const domains = [
			makeDomain("shared", { prompts: new Set(["base"]) }),
			makeDomain("coding"),
		];
		const fromFactory = DomainResolver.fromSingleDir("/dir", domains);
		const fromConstructor = new DomainResolver(new DomainRegistry(domains));

		expect(fromFactory.resolveBasePath()).toBe(
			fromConstructor.resolveBasePath(),
		);
		expect(fromFactory.resolvePersonaPath("base", "coding")).toBe(
			fromConstructor.resolvePersonaPath("base", "coding"),
		);
	});
});
