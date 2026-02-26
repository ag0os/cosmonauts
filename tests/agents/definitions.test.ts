import { describe, expect, it } from "vitest";
import { BUILTIN_DEFINITIONS } from "../../lib/agents/definitions.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

describe("BUILTIN_DEFINITIONS", () => {
	it("contains all five built-in agents", () => {
		expect(BUILTIN_DEFINITIONS).toHaveLength(5);
		const ids = BUILTIN_DEFINITIONS.map((d) => d.id);
		expect(ids).toContain("cosmo");
		expect(ids).toContain("planner");
		expect(ids).toContain("task-manager");
		expect(ids).toContain("coordinator");
		expect(ids).toContain("worker");
	});

	it("has unique IDs across all definitions", () => {
		const ids = BUILTIN_DEFINITIONS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has non-empty descriptions for all definitions", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.description.length).toBeGreaterThan(0);
		}
	});

	it("uses valid tool set values", () => {
		const validTools = new Set(["coding", "readonly", "none"]);
		for (const def of BUILTIN_DEFINITIONS) {
			expect(validTools.has(def.tools)).toBe(true);
		}
	});

	it("uses valid session mode values", () => {
		const validSessions = new Set(["ephemeral", "persistent"]);
		for (const def of BUILTIN_DEFINITIONS) {
			expect(validSessions.has(def.session)).toBe(true);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.model).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
		}
	});

	it("has subagent references that point to existing definition IDs", () => {
		const allIds = new Set(BUILTIN_DEFINITIONS.map((d) => d.id));
		for (const def of BUILTIN_DEFINITIONS) {
			if (def.subagents) {
				for (const sub of def.subagents) {
					expect(allIds.has(sub)).toBe(true);
				}
			}
		}
	});

	it("has non-empty prompts arrays for all definitions", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.prompts.length).toBeGreaterThan(0);
		}
	});

	it("only coordinator has loop: true", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			if (def.id === "coordinator") {
				expect(def.loop).toBe(true);
			} else {
				expect(def.loop).toBe(false);
			}
		}
	});

	it("sets namespace to 'coding' on all built-in definitions", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.namespace).toBe("coding");
		}
	});

	it("starts all prompt arrays with 'cosmonauts' (Layer 0 base)", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.prompts[0]).toBe("cosmonauts");
		}
	});

	it("ends all prompt arrays with the persona file matching agents/coding/<id>", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			const lastPrompt = def.prompts[def.prompts.length - 1];
			expect(lastPrompt).toBe(`agents/coding/${def.id}`);
		}
	});

	it("does not give readonly agents coding-readwrite capability", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			if (def.tools === "readonly") {
				expect(def.prompts).not.toContain("capabilities/coding-readwrite");
			}
		}
	});

	it("does not give agents with tools 'none' any coding capability prompts", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			if (def.tools === "none") {
				expect(def.prompts).not.toContain("capabilities/coding-readwrite");
				expect(def.prompts).not.toContain("capabilities/coding-readonly");
			}
		}
	});
});

describe("structural invariants (parameterized)", () => {
	it.each(BUILTIN_DEFINITIONS)("$id has all required fields", (def) => {
		expect(typeof def.id).toBe("string");
		expect(def.id.length).toBeGreaterThan(0);
		expect(typeof def.description).toBe("string");
		expect(typeof def.model).toBe("string");
		expect(typeof def.tools).toBe("string");
		expect(typeof def.projectContext).toBe("boolean");
		expect(typeof def.session).toBe("string");
		expect(typeof def.loop).toBe("boolean");
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has non-empty extensions array of strings", (def) => {
		expect(Array.isArray(def.extensions)).toBe(true);
		for (const ext of def.extensions) {
			expect(typeof ext).toBe("string");
			expect(ext.length).toBeGreaterThan(0);
		}
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has non-empty prompts array of strings", (def) => {
		expect(Array.isArray(def.prompts)).toBe(true);
		expect(def.prompts.length).toBeGreaterThan(0);
		for (const p of def.prompts) {
			expect(typeof p).toBe("string");
			expect(p.length).toBeGreaterThan(0);
		}
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has subagents as string array when defined", (def) => {
		if (def.subagents !== undefined) {
			expect(Array.isArray(def.subagents)).toBe(true);
			for (const sub of def.subagents) {
				expect(typeof sub).toBe("string");
			}
		}
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has skills as string array when defined", (def) => {
		if (def.skills !== undefined) {
			expect(Array.isArray(def.skills)).toBe(true);
			for (const skill of def.skills) {
				expect(typeof skill).toBe("string");
			}
		}
	});
});

describe("type conformance", () => {
	it("namespace is optional for external definitions", () => {
		const external: AgentDefinition = {
			id: "custom-agent",
			description: "An external agent without namespace",
			prompts: ["custom/prompt"],
			model: "test-provider/test-model",
			tools: "coding",
			extensions: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
		};
		expect(external.namespace).toBeUndefined();
	});
});
