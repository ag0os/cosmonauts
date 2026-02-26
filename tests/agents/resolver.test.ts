import { describe, expect, it } from "vitest";
import { BUILTIN_DEFINITIONS } from "../../lib/agents/definitions.ts";
import {
	AgentRegistry,
	createDefaultRegistry,
	resolveAgent,
} from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

describe("AgentRegistry", () => {
	describe("constructor", () => {
		it("loads all builtins by default", () => {
			const registry = new AgentRegistry();
			expect(registry.listIds()).toHaveLength(BUILTIN_DEFINITIONS.length);
			for (const def of BUILTIN_DEFINITIONS) {
				expect(registry.has(def.id)).toBe(true);
			}
		});

		it("accepts custom builtins", () => {
			const custom: AgentDefinition = {
				id: "test-agent",
				description: "A test agent",
				prompts: ["capabilities/core"],
				model: "anthropic/claude-opus-4-6",
				tools: "coding",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
			};
			const registry = new AgentRegistry([custom]);
			expect(registry.listIds()).toEqual(["test-agent"]);
		});

		it("works with empty builtins", () => {
			const registry = new AgentRegistry([]);
			expect(registry.listIds()).toEqual([]);
			expect(registry.listAll()).toEqual([]);
		});
	});

	describe("get", () => {
		it("returns definition for known ID", () => {
			const registry = new AgentRegistry();
			const def = registry.get("cosmo");
			expect(def).toBeDefined();
			expect(def?.id).toBe("cosmo");
		});

		it("returns undefined for unknown ID", () => {
			const registry = new AgentRegistry();
			expect(registry.get("nonexistent")).toBeUndefined();
		});
	});

	describe("resolve", () => {
		it("returns definition for known ID", () => {
			const registry = new AgentRegistry();
			const def = registry.resolve("planner");
			expect(def.id).toBe("planner");
		});

		it("throws for unknown ID with available agents listed", () => {
			const registry = new AgentRegistry();
			expect(() => registry.resolve("unknown")).toThrow(
				/Unknown agent ID "unknown"/,
			);
			expect(() => registry.resolve("unknown")).toThrow(/Available agents:/);
			expect(() => registry.resolve("unknown")).toThrow(/cosmo/);
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
			const registry = new AgentRegistry();
			expect(registry.has("worker")).toBe(true);
		});

		it("returns false for unregistered ID", () => {
			const registry = new AgentRegistry();
			expect(registry.has("ghost")).toBe(false);
		});
	});

	describe("listIds", () => {
		it("returns all registered IDs", () => {
			const registry = new AgentRegistry();
			const ids = registry.listIds();
			expect(ids).toContain("cosmo");
			expect(ids).toContain("planner");
			expect(ids).toContain("task-manager");
			expect(ids).toContain("coordinator");
			expect(ids).toContain("worker");
		});
	});

	describe("listAll", () => {
		it("returns all registered definitions", () => {
			const registry = new AgentRegistry();
			const all = registry.listAll();
			expect(all).toHaveLength(BUILTIN_DEFINITIONS.length);
			for (const def of all) {
				expect(def.id).toBeTruthy();
			}
		});
	});

	describe("register", () => {
		it("adds a new definition", () => {
			const registry = new AgentRegistry();
			const custom: AgentDefinition = {
				id: "scout",
				description: "A lightweight exploration agent",
				prompts: ["capabilities/core"],
				model: "anthropic/claude-haiku-3-5",
				tools: "readonly",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
			};
			registry.register(custom);
			expect(registry.has("scout")).toBe(true);
			expect(registry.get("scout")).toEqual(custom);
			expect(registry.listIds()).toContain("scout");
		});

		it("supports definitions without namespace (backward compatibility)", () => {
			const registry = new AgentRegistry([]);
			const custom: AgentDefinition = {
				id: "external-tool",
				description: "An external agent without namespace",
				prompts: ["custom/prompt"],
				model: "anthropic/claude-opus-4-6",
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
			const registry = new AgentRegistry();
			const original = registry.resolve("worker");
			const override: AgentDefinition = {
				...original,
				model: "anthropic/claude-opus-4-6",
			};
			registry.register(override);
			expect(registry.get("worker")?.model).toBe("anthropic/claude-opus-4-6");
			// Count should not change
			expect(registry.listIds()).toHaveLength(BUILTIN_DEFINITIONS.length);
		});
	});
});

describe("createDefaultRegistry", () => {
	it("returns a registry with all builtins", () => {
		const registry = createDefaultRegistry();
		expect(registry.listIds()).toHaveLength(BUILTIN_DEFINITIONS.length);
		expect(registry.has("cosmo")).toBe(true);
	});
});

describe("resolveAgent", () => {
	it("resolves a known agent by ID", () => {
		const def = resolveAgent("coordinator");
		expect(def.id).toBe("coordinator");
		expect(def.loop).toBe(true);
	});

	it("throws for unknown agent ID", () => {
		expect(() => resolveAgent("nonexistent")).toThrow(
			/Unknown agent ID "nonexistent"/,
		);
	});
});
