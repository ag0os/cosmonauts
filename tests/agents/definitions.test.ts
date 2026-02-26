import { describe, expect, it } from "vitest";
import {
	BUILTIN_DEFINITIONS,
	COORDINATOR_DEFINITION,
	COSMO_DEFINITION,
	PLANNER_DEFINITION,
	TASK_MANAGER_DEFINITION,
	WORKER_DEFINITION,
} from "../../lib/agents/definitions.ts";
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

describe("COSMO_DEFINITION", () => {
	it("matches DESIGN.md spec", () => {
		expect(COSMO_DEFINITION.id).toBe("cosmo");
		expect(COSMO_DEFINITION.namespace).toBe("coding");
		expect(COSMO_DEFINITION.prompts).toEqual([
			"cosmonauts",
			"capabilities/core",
			"capabilities/coding-readwrite",
			"capabilities/tasks",
			"capabilities/spawning",
			"capabilities/todo",
			"agents/coding/cosmo",
		]);
		expect(COSMO_DEFINITION.model).toBe("anthropic/claude-opus-4-6");
		expect(COSMO_DEFINITION.tools).toBe("coding");
		expect(COSMO_DEFINITION.extensions).toEqual([
			"tasks",
			"plans",
			"orchestration",
			"todo",
			"init",
		]);
		expect(COSMO_DEFINITION.skills).toBeUndefined();
		expect(COSMO_DEFINITION.subagents).toEqual([
			"planner",
			"task-manager",
			"coordinator",
			"worker",
		]);
		expect(COSMO_DEFINITION.projectContext).toBe(true);
		expect(COSMO_DEFINITION.session).toBe("persistent");
		expect(COSMO_DEFINITION.loop).toBe(false);
	});
});

describe("PLANNER_DEFINITION", () => {
	it("matches DESIGN.md spec", () => {
		expect(PLANNER_DEFINITION.id).toBe("planner");
		expect(PLANNER_DEFINITION.namespace).toBe("coding");
		expect(PLANNER_DEFINITION.prompts).toEqual([
			"cosmonauts",
			"capabilities/core",
			"capabilities/coding-readonly",
			"agents/coding/planner",
		]);
		expect(PLANNER_DEFINITION.model).toBe("anthropic/claude-opus-4-6");
		expect(PLANNER_DEFINITION.tools).toBe("readonly");
		expect(PLANNER_DEFINITION.extensions).toEqual(["plans"]);
		expect(PLANNER_DEFINITION.skills).toBeUndefined();
		expect(PLANNER_DEFINITION.subagents).toEqual([]);
		expect(PLANNER_DEFINITION.projectContext).toBe(true);
		expect(PLANNER_DEFINITION.session).toBe("ephemeral");
		expect(PLANNER_DEFINITION.loop).toBe(false);
	});
});

describe("TASK_MANAGER_DEFINITION", () => {
	it("matches DESIGN.md spec", () => {
		expect(TASK_MANAGER_DEFINITION.id).toBe("task-manager");
		expect(TASK_MANAGER_DEFINITION.namespace).toBe("coding");
		expect(TASK_MANAGER_DEFINITION.prompts).toEqual([
			"cosmonauts",
			"capabilities/core",
			"capabilities/tasks",
			"agents/coding/task-manager",
		]);
		expect(TASK_MANAGER_DEFINITION.model).toBe("anthropic/claude-opus-4-6");
		expect(TASK_MANAGER_DEFINITION.tools).toBe("readonly");
		expect(TASK_MANAGER_DEFINITION.extensions).toEqual(["tasks"]);
		expect(TASK_MANAGER_DEFINITION.skills).toEqual([]);
		expect(TASK_MANAGER_DEFINITION.subagents).toEqual([]);
		expect(TASK_MANAGER_DEFINITION.projectContext).toBe(false);
		expect(TASK_MANAGER_DEFINITION.session).toBe("ephemeral");
		expect(TASK_MANAGER_DEFINITION.loop).toBe(false);
	});
});

describe("COORDINATOR_DEFINITION", () => {
	it("matches DESIGN.md spec", () => {
		expect(COORDINATOR_DEFINITION.id).toBe("coordinator");
		expect(COORDINATOR_DEFINITION.namespace).toBe("coding");
		expect(COORDINATOR_DEFINITION.prompts).toEqual([
			"cosmonauts",
			"capabilities/core",
			"capabilities/tasks",
			"capabilities/spawning",
			"agents/coding/coordinator",
		]);
		expect(COORDINATOR_DEFINITION.model).toBe("anthropic/claude-opus-4-6");
		expect(COORDINATOR_DEFINITION.tools).toBe("none");
		expect(COORDINATOR_DEFINITION.extensions).toEqual([
			"tasks",
			"orchestration",
		]);
		expect(COORDINATOR_DEFINITION.skills).toEqual([]);
		expect(COORDINATOR_DEFINITION.subagents).toEqual(["worker"]);
		expect(COORDINATOR_DEFINITION.projectContext).toBe(false);
		expect(COORDINATOR_DEFINITION.session).toBe("ephemeral");
		expect(COORDINATOR_DEFINITION.loop).toBe(true);
	});
});

describe("WORKER_DEFINITION", () => {
	it("matches DESIGN.md spec", () => {
		expect(WORKER_DEFINITION.id).toBe("worker");
		expect(WORKER_DEFINITION.namespace).toBe("coding");
		expect(WORKER_DEFINITION.prompts).toEqual([
			"cosmonauts",
			"capabilities/core",
			"capabilities/coding-readwrite",
			"capabilities/tasks",
			"capabilities/todo",
			"agents/coding/worker",
		]);
		expect(WORKER_DEFINITION.model).toBe("anthropic/claude-opus-4-6");
		expect(WORKER_DEFINITION.tools).toBe("coding");
		expect(WORKER_DEFINITION.extensions).toEqual(["tasks", "todo"]);
		expect(WORKER_DEFINITION.skills).toBeUndefined();
		expect(WORKER_DEFINITION.subagents).toEqual([]);
		expect(WORKER_DEFINITION.projectContext).toBe(true);
		expect(WORKER_DEFINITION.session).toBe("ephemeral");
		expect(WORKER_DEFINITION.loop).toBe(false);
	});
});

describe("type conformance", () => {
	it("all named exports satisfy AgentDefinition", () => {
		const defs: AgentDefinition[] = [
			COSMO_DEFINITION,
			PLANNER_DEFINITION,
			TASK_MANAGER_DEFINITION,
			COORDINATOR_DEFINITION,
			WORKER_DEFINITION,
		];
		expect(defs).toHaveLength(5);
	});

	it("namespace is optional for external definitions", () => {
		const external: AgentDefinition = {
			id: "custom-agent",
			description: "An external agent without namespace",
			prompts: ["custom/prompt"],
			model: "anthropic/claude-opus-4-6",
			tools: "coding",
			extensions: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
		};
		expect(external.namespace).toBeUndefined();
	});
});
