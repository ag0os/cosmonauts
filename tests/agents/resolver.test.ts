import { describe, expect, it } from "vitest";
import {
	AgentRegistry,
	createRegistryFromDomains,
} from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

// ============================================================================
// Fixtures — synthetic definitions with test-provider models
// ============================================================================

const ALPHA: AgentDefinition = {
	id: "alpha",
	description: "First fixture agent",
	capabilities: ["core", "coding-readwrite"],
	model: "test-provider/alpha-model",
	tools: "coding",
	extensions: ["tasks"],
	projectContext: true,
	session: "persistent",
	loop: false,
};

const BETA: AgentDefinition = {
	id: "beta",
	description: "Second fixture agent",
	capabilities: ["core", "coding-readonly"],
	model: "test-provider/beta-model",
	tools: "readonly",
	extensions: ["plans"],
	subagents: ["alpha"],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

const GAMMA: AgentDefinition = {
	id: "gamma",
	description: "Third fixture agent",
	capabilities: ["core", "tasks", "spawning"],
	model: "test-provider/gamma-model",
	tools: "none",
	extensions: ["orchestration"],
	subagents: ["alpha", "beta"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
};

const FIXTURES = [ALPHA, BETA, GAMMA];

// Fixtures with domain set
const DOMAIN_ALPHA: AgentDefinition = {
	...ALPHA,
	domain: "testing",
};

const DOMAIN_BETA: AgentDefinition = {
	...BETA,
	domain: "testing",
};

const DOMAIN_GAMMA: AgentDefinition = {
	...GAMMA,
	domain: "other",
};

// Ambiguous: same ID in two domains
const AMBIGUOUS_ALPHA: AgentDefinition = {
	...ALPHA,
	domain: "other",
	model: "test-provider/other-alpha-model",
};

describe("AgentRegistry", () => {
	describe("constructor", () => {
		it("loads provided definitions", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.listIds()).toHaveLength(3);
			for (const def of FIXTURES) {
				expect(registry.has(def.id)).toBe(true);
			}
		});

		it("works with empty array", () => {
			const registry = new AgentRegistry([]);
			expect(registry.listIds()).toEqual([]);
			expect(registry.listAll()).toEqual([]);
		});

		it("uses qualified keys when definitions have domain set", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_BETA]);
			expect(registry.listIds()).toContain("testing/alpha");
			expect(registry.listIds()).toContain("testing/beta");
			expect(registry.listIds()).not.toContain("alpha");
			expect(registry.listIds()).not.toContain("beta");
		});
	});

	describe("get", () => {
		it("returns definition for known ID", () => {
			const registry = new AgentRegistry(FIXTURES);
			const def = registry.get("alpha");
			expect(def).toBeDefined();
			expect(def?.id).toBe("alpha");
			expect(def?.model).toBe("test-provider/alpha-model");
		});

		it("returns undefined for unknown ID", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.get("nonexistent")).toBeUndefined();
		});

		it("returns definition via qualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_BETA]);
			const def = registry.get("testing/alpha");
			expect(def).toBeDefined();
			expect(def?.id).toBe("alpha");
		});

		it("returns definition via unqualified scan when unique", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_GAMMA]);
			const def = registry.get("alpha");
			expect(def).toBeDefined();
			expect(def?.id).toBe("alpha");
		});

		it("returns definition via domain context", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_GAMMA]);
			const def = registry.get("alpha", "testing");
			expect(def).toBeDefined();
			expect(def?.id).toBe("alpha");
		});

		it("returns undefined for ambiguous unqualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, AMBIGUOUS_ALPHA]);
			expect(registry.get("alpha")).toBeUndefined();
		});

		it("resolves ambiguous ID with domain context", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, AMBIGUOUS_ALPHA]);
			const def = registry.get("alpha", "other");
			expect(def).toBeDefined();
			expect(def?.model).toBe("test-provider/other-alpha-model");
		});
	});

	describe("resolve", () => {
		it("returns definition for known ID", () => {
			const registry = new AgentRegistry(FIXTURES);
			const def = registry.resolve("beta");
			expect(def.id).toBe("beta");
			expect(def.tools).toBe("readonly");
		});

		it("throws for unknown ID with available agents listed", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(() => registry.resolve("unknown")).toThrow(
				/Unknown agent ID "unknown"/,
			);
			expect(() => registry.resolve("unknown")).toThrow(/Available agents:/);
			expect(() => registry.resolve("unknown")).toThrow(/alpha/);
		});

		it("throws with empty available list for empty registry", () => {
			const registry = new AgentRegistry([]);
			expect(() => registry.resolve("any")).toThrow(
				'Unknown agent ID "any". Available agents: ',
			);
		});

		it("resolves qualified ID directly", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_BETA]);
			const def = registry.resolve("testing/alpha");
			expect(def.id).toBe("alpha");
		});

		it("resolves unqualified ID with domain context", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_GAMMA]);
			const def = registry.resolve("alpha", "testing");
			expect(def.id).toBe("alpha");
		});

		it("throws for ambiguous unqualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, AMBIGUOUS_ALPHA]);
			expect(() => registry.resolve("alpha")).toThrow(
				/Unknown agent ID "alpha"/,
			);
		});

		it("returns undefined for unknown qualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA]);
			expect(() => registry.resolve("nonexistent/alpha")).toThrow(
				/Unknown agent ID "nonexistent\/alpha"/,
			);
		});
	});

	describe("has", () => {
		it("returns true for registered ID", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.has("gamma")).toBe(true);
		});

		it("returns false for unregistered ID", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.has("ghost")).toBe(false);
		});

		it("returns true for qualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA]);
			expect(registry.has("testing/alpha")).toBe(true);
		});

		it("returns true for unqualified ID with domain context", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA]);
			expect(registry.has("alpha", "testing")).toBe(true);
		});

		it("returns false for ambiguous unqualified ID", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, AMBIGUOUS_ALPHA]);
			expect(registry.has("alpha")).toBe(false);
		});
	});

	describe("resolveInDomain", () => {
		it("returns all definitions for a given domain", () => {
			const registry = new AgentRegistry([
				DOMAIN_ALPHA,
				DOMAIN_BETA,
				DOMAIN_GAMMA,
			]);
			const testing = registry.resolveInDomain("testing");
			expect(testing).toHaveLength(2);
			expect(testing.map((d) => d.id).sort()).toEqual(["alpha", "beta"]);
		});

		it("returns empty array for unknown domain", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA]);
			expect(registry.resolveInDomain("nonexistent")).toEqual([]);
		});

		it("returns empty array for unqualified keys", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.resolveInDomain("testing")).toEqual([]);
		});
	});

	describe("listIds", () => {
		it("returns all registered IDs", () => {
			const registry = new AgentRegistry(FIXTURES);
			const ids = registry.listIds();
			expect(ids).toContain("alpha");
			expect(ids).toContain("beta");
			expect(ids).toContain("gamma");
			expect(ids).toHaveLength(3);
		});

		it("returns qualified IDs for domain definitions", () => {
			const registry = new AgentRegistry([DOMAIN_ALPHA, DOMAIN_GAMMA]);
			const ids = registry.listIds();
			expect(ids).toContain("testing/alpha");
			expect(ids).toContain("other/gamma");
		});
	});

	describe("listAll", () => {
		it("returns all registered definitions", () => {
			const registry = new AgentRegistry(FIXTURES);
			const all = registry.listAll();
			expect(all).toHaveLength(3);
			for (const def of all) {
				expect(def.id).toBeTruthy();
			}
		});
	});

	describe("register", () => {
		it("adds a new definition", () => {
			const registry = new AgentRegistry(FIXTURES);
			const custom: AgentDefinition = {
				id: "delta",
				description: "A dynamically registered agent",
				capabilities: ["core"],
				model: "test-provider/delta-model",
				tools: "readonly",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
			};
			registry.register(custom);
			expect(registry.has("delta")).toBe(true);
			expect(registry.get("delta")).toEqual(custom);
			expect(registry.listIds()).toContain("delta");
		});

		it("overwrites an existing definition", () => {
			const registry = new AgentRegistry(FIXTURES);
			const original = registry.resolve("alpha");
			const override: AgentDefinition = {
				...original,
				model: "test-provider/alpha-v2-model",
			};
			registry.register(override);
			expect(registry.get("alpha")?.model).toBe("test-provider/alpha-v2-model");
			// Count should not change
			expect(registry.listIds()).toHaveLength(FIXTURES.length);
		});

		it("uses qualified key when definition has domain", () => {
			const registry = new AgentRegistry([]);
			registry.register(DOMAIN_ALPHA);
			expect(registry.listIds()).toContain("testing/alpha");
			expect(registry.has("testing/alpha")).toBe(true);
		});
	});
});

describe("createRegistryFromDomains", () => {
	it("creates a registry from loaded domains", () => {
		const workerDef: AgentDefinition = {
			id: "worker",
			description: "Test worker",
			capabilities: ["core"],
			model: "test-provider/worker-model",
			tools: "coding",
			extensions: [],
			projectContext: true,
			session: "ephemeral",
			loop: false,
			domain: "coding",
		};

		const plannerDef: AgentDefinition = {
			id: "planner",
			description: "Test planner",
			capabilities: ["core"],
			model: "test-provider/planner-model",
			tools: "readonly",
			extensions: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
			domain: "coding",
		};

		const domains: LoadedDomain[] = [
			{
				manifest: { id: "coding", description: "Coding domain" },
				agents: new Map([
					["worker", workerDef],
					["planner", plannerDef],
				]),
				capabilities: new Set(["core"]),
				prompts: new Set(["worker", "planner"]),
				skills: new Set([]),
				extensions: new Set(["tasks"]),
				workflows: [],
				rootDir: "/tmp/domains/coding",
			},
		];

		const registry = createRegistryFromDomains(domains);
		expect(registry.listIds()).toHaveLength(2);
		expect(registry.has("coding/worker")).toBe(true);
		expect(registry.has("coding/planner")).toBe(true);
		// Unqualified scan should also work
		expect(registry.has("worker")).toBe(true);
	});

	it("handles multiple domains", () => {
		const codingWorker: AgentDefinition = {
			id: "worker",
			description: "Coding worker",
			capabilities: ["core"],
			model: "test-provider/coding-worker",
			tools: "coding",
			extensions: [],
			projectContext: true,
			session: "ephemeral",
			loop: false,
			domain: "coding",
		};

		const docsWorker: AgentDefinition = {
			id: "writer",
			description: "Docs writer",
			capabilities: ["core"],
			model: "test-provider/docs-writer",
			tools: "coding",
			extensions: [],
			projectContext: true,
			session: "ephemeral",
			loop: false,
			domain: "docs",
		};

		const domains: LoadedDomain[] = [
			{
				manifest: { id: "coding", description: "Coding domain" },
				agents: new Map([["worker", codingWorker]]),
				capabilities: new Set(),
				prompts: new Set(),
				skills: new Set(),
				extensions: new Set(),
				workflows: [],
				rootDir: "/tmp/domains/coding",
			},
			{
				manifest: { id: "docs", description: "Docs domain" },
				agents: new Map([["writer", docsWorker]]),
				capabilities: new Set(),
				prompts: new Set(),
				skills: new Set(),
				extensions: new Set(),
				workflows: [],
				rootDir: "/tmp/domains/docs",
			},
		];

		const registry = createRegistryFromDomains(domains);
		expect(registry.listIds()).toHaveLength(2);
		expect(registry.has("coding/worker")).toBe(true);
		expect(registry.has("docs/writer")).toBe(true);
		expect(registry.resolveInDomain("coding")).toHaveLength(1);
		expect(registry.resolveInDomain("docs")).toHaveLength(1);
	});

	it("returns empty registry for empty domains", () => {
		const registry = createRegistryFromDomains([]);
		expect(registry.listIds()).toEqual([]);
	});
});
