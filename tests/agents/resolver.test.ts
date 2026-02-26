import { describe, expect, it } from "vitest";
import { BUILTIN_DEFINITIONS } from "../../lib/agents/definitions.ts";
import {
	AgentRegistry,
	createDefaultRegistry,
	resolveAgent,
} from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

// ============================================================================
// Fixtures — synthetic definitions with test-provider models
// ============================================================================

const ALPHA: AgentDefinition = {
	id: "alpha",
	description: "First fixture agent",
	namespace: "test",
	prompts: ["base/test", "agents/test/alpha"],
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
	namespace: "test",
	prompts: ["base/test", "agents/test/beta"],
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
	namespace: "test",
	prompts: ["base/test", "agents/test/gamma"],
	model: "test-provider/gamma-model",
	tools: "none",
	extensions: ["orchestration"],
	subagents: ["alpha", "beta"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
};

const FIXTURES = [ALPHA, BETA, GAMMA];

describe("AgentRegistry", () => {
	describe("constructor", () => {
		it("loads provided definitions", () => {
			const registry = new AgentRegistry(FIXTURES);
			expect(registry.listIds()).toHaveLength(3);
			for (const def of FIXTURES) {
				expect(registry.has(def.id)).toBe(true);
			}
		});

		it("defaults to builtins when no argument given", () => {
			const registry = new AgentRegistry();
			expect(registry.listIds()).toHaveLength(BUILTIN_DEFINITIONS.length);
		});

		it("works with empty array", () => {
			const registry = new AgentRegistry([]);
			expect(registry.listIds()).toEqual([]);
			expect(registry.listAll()).toEqual([]);
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
				prompts: ["base/test", "agents/test/delta"],
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

		it("supports definitions without namespace", () => {
			const registry = new AgentRegistry([]);
			const custom: AgentDefinition = {
				id: "external-tool",
				description: "An external agent without namespace",
				prompts: ["custom/prompt"],
				model: "test-provider/external-model",
				tools: "coding",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
			};
			registry.register(custom);
			expect(registry.has("external-tool")).toBe(true);
			const resolved = registry.resolve("external-tool");
			expect(resolved.id).toBe("external-tool");
			expect(resolved.namespace).toBeUndefined();
			const got = registry.get("external-tool");
			expect(got).toBeDefined();
			expect(got?.namespace).toBeUndefined();
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
	});
});

describe("createDefaultRegistry", () => {
	it("returns a registry with all builtins", () => {
		const registry = createDefaultRegistry();
		expect(registry.listIds()).toHaveLength(BUILTIN_DEFINITIONS.length);
	});
});

describe("resolveAgent", () => {
	it("resolves a known agent by ID", () => {
		const def = resolveAgent("coordinator");
		expect(def.id).toBe("coordinator");
	});

	it("throws for unknown agent ID", () => {
		expect(() => resolveAgent("nonexistent")).toThrow(
			/Unknown agent ID "nonexistent"/,
		);
	});
});
