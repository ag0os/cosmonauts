import { describe, expect, expectTypeOf, it } from "vitest";
import coordinator from "../../domains/coding/agents/coordinator.ts";
import cosmo from "../../domains/coding/agents/cosmo.ts";
import fixer from "../../domains/coding/agents/fixer.ts";
import planner from "../../domains/coding/agents/planner.ts";
import qualityManager from "../../domains/coding/agents/quality-manager.ts";
import reviewer from "../../domains/coding/agents/reviewer.ts";
import taskManager from "../../domains/coding/agents/task-manager.ts";
import worker from "../../domains/coding/agents/worker.ts";
import type {
	AgentDefinition,
	AgentSessionMode,
	AgentToolSet,
} from "../../lib/agents/types.ts";

const ALL_DEFINITIONS: AgentDefinition[] = [
	cosmo,
	planner,
	taskManager,
	coordinator,
	worker,
	qualityManager,
	reviewer,
	fixer,
];

const VALID_THINKING_LEVELS = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

describe("domain agent definitions", () => {
	it("exports exactly 8 agent definitions", () => {
		expect(ALL_DEFINITIONS).toHaveLength(8);
	});

	it("has unique IDs across all definitions", () => {
		const ids = ALL_DEFINITIONS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has the expected agent IDs", () => {
		const ids = new Set(ALL_DEFINITIONS.map((d) => d.id));
		expect(ids).toEqual(
			new Set([
				"cosmo",
				"planner",
				"task-manager",
				"coordinator",
				"worker",
				"quality-manager",
				"reviewer",
				"fixer",
			]),
		);
	});

	it("uses capabilities array instead of prompts", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.capabilities).toBeDefined();
			expect(Array.isArray(def.capabilities)).toBe(true);
			expect(def.capabilities.length).toBeGreaterThan(0);
			// Must not have a prompts field
			expect("prompts" in def).toBe(false);
		}
	});

	it("has no namespace field on any definition", () => {
		for (const def of ALL_DEFINITIONS) {
			expect("namespace" in def).toBe(false);
		}
	});

	it("has non-empty descriptions for all definitions", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.description.length).toBeGreaterThan(0);
		}
	});

	it.each`
		field        | validValues
		${"tools"}   | ${["coding", "readonly", "none"]}
		${"session"} | ${["ephemeral", "persistent"]}
	`("uses valid $field values", ({ field, validValues }) => {
		const valid = new Set(validValues as string[]);
		for (const def of ALL_DEFINITIONS) {
			expect(valid.has(def[field as keyof AgentDefinition] as string)).toBe(
				true,
			);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.model).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/);
		}
	});

	it("has subagent references that point to existing definition IDs", () => {
		const allIds = new Set(ALL_DEFINITIONS.map((d) => d.id));
		for (const def of ALL_DEFINITIONS) {
			if (def.subagents) {
				for (const sub of def.subagents) {
					expect(allIds.has(sub)).toBe(true);
				}
			}
		}
	});

	it("does not give readonly agents coding-readwrite capability", () => {
		for (const def of ALL_DEFINITIONS) {
			if (def.tools === "readonly") {
				expect(def.capabilities).not.toContain("coding-readwrite");
			}
		}
	});

	it("does not give agents with tools 'none' any coding capability", () => {
		for (const def of ALL_DEFINITIONS) {
			if (def.tools === "none") {
				expect(def.capabilities).not.toContain("coding-readwrite");
				expect(def.capabilities).not.toContain("coding-readonly");
			}
		}
	});

	it("has thinkingLevel that is either a valid ThinkingLevel or undefined", () => {
		for (const def of ALL_DEFINITIONS) {
			if (def.thinkingLevel !== undefined) {
				expect(VALID_THINKING_LEVELS.has(def.thinkingLevel)).toBe(true);
			}
		}
	});
});

describe("individual agent values", () => {
	it("cosmo has correct values", () => {
		expect(cosmo.id).toBe("cosmo");
		expect(cosmo.capabilities).toEqual([
			"core",
			"coding-readwrite",
			"tasks",
			"spawning",
			"todo",
		]);
		expect(cosmo.model).toBe("anthropic/claude-opus-4-6");
		expect(cosmo.tools).toBe("coding");
		expect(cosmo.extensions).toEqual([
			"tasks",
			"plans",
			"orchestration",
			"todo",
			"init",
		]);
		expect(cosmo.skills).toBeUndefined();
		expect(cosmo.subagents).toEqual([
			"planner",
			"task-manager",
			"coordinator",
			"worker",
			"quality-manager",
			"reviewer",
			"fixer",
		]);
		expect(cosmo.projectContext).toBe(true);
		expect(cosmo.session).toBe("persistent");
		expect(cosmo.loop).toBe(false);
		expect(cosmo.thinkingLevel).toBeUndefined();
	});

	it("planner has correct values", () => {
		expect(planner.id).toBe("planner");
		expect(planner.capabilities).toEqual([
			"core",
			"coding-readonly",
			"spawning",
		]);
		expect(planner.model).toBe("anthropic/claude-opus-4-6");
		expect(planner.tools).toBe("readonly");
		expect(planner.extensions).toEqual(["plans", "orchestration"]);
		expect(planner.skills).toEqual(["pi"]);
		expect(planner.subagents).toEqual([
			"task-manager",
			"coordinator",
			"worker",
		]);
		expect(planner.projectContext).toBe(true);
		expect(planner.session).toBe("ephemeral");
		expect(planner.loop).toBe(false);
		expect(planner.thinkingLevel).toBe("high");
	});

	it("task-manager has correct values", () => {
		expect(taskManager.id).toBe("task-manager");
		expect(taskManager.capabilities).toEqual([
			"core",
			"coding-readonly",
			"tasks",
		]);
		expect(taskManager.model).toBe("anthropic/claude-opus-4-6");
		expect(taskManager.tools).toBe("readonly");
		expect(taskManager.extensions).toEqual(["tasks", "plans"]);
		expect(taskManager.skills).toEqual([]);
		expect(taskManager.subagents).toEqual([]);
		expect(taskManager.projectContext).toBe(false);
		expect(taskManager.session).toBe("ephemeral");
		expect(taskManager.loop).toBe(false);
		expect(taskManager.thinkingLevel).toBe("high");
	});

	it("coordinator has correct values", () => {
		expect(coordinator.id).toBe("coordinator");
		expect(coordinator.capabilities).toEqual(["core", "tasks", "spawning"]);
		expect(coordinator.model).toBe("anthropic/claude-opus-4-6");
		expect(coordinator.tools).toBe("none");
		expect(coordinator.extensions).toEqual(["tasks", "orchestration"]);
		expect(coordinator.skills).toEqual([]);
		expect(coordinator.subagents).toEqual(["worker"]);
		expect(coordinator.projectContext).toBe(false);
		expect(coordinator.session).toBe("ephemeral");
		expect(coordinator.loop).toBe(true);
	});

	it("worker has correct values", () => {
		expect(worker.id).toBe("worker");
		expect(worker.capabilities).toEqual(["core", "coding-readwrite", "tasks"]);
		expect(worker.model).toBe("anthropic/claude-opus-4-6");
		expect(worker.tools).toBe("coding");
		expect(worker.extensions).toEqual(["tasks"]);
		expect(worker.skills).toBeUndefined();
		expect(worker.subagents).toEqual([]);
		expect(worker.projectContext).toBe(true);
		expect(worker.session).toBe("ephemeral");
		expect(worker.loop).toBe(false);
	});

	it("quality-manager has correct values", () => {
		expect(qualityManager.id).toBe("quality-manager");
		expect(qualityManager.capabilities).toEqual([
			"core",
			"coding-readwrite",
			"tasks",
			"spawning",
		]);
		expect(qualityManager.model).toBe("openai-codex/gpt-5.3-codex");
		expect(qualityManager.tools).toBe("coding");
		expect(qualityManager.extensions).toEqual(["tasks", "orchestration"]);
		expect(qualityManager.skills).toBeUndefined();
		expect(qualityManager.subagents).toEqual([
			"reviewer",
			"fixer",
			"coordinator",
		]);
		expect(qualityManager.projectContext).toBe(true);
		expect(qualityManager.session).toBe("ephemeral");
		expect(qualityManager.loop).toBe(false);
	});

	it("reviewer has correct values", () => {
		expect(reviewer.id).toBe("reviewer");
		expect(reviewer.capabilities).toEqual(["core", "coding-readwrite"]);
		expect(reviewer.model).toBe("openai-codex/gpt-5.3-codex");
		expect(reviewer.tools).toBe("coding");
		expect(reviewer.extensions).toEqual([]);
		expect(reviewer.skills).toBeUndefined();
		expect(reviewer.subagents).toEqual([]);
		expect(reviewer.projectContext).toBe(true);
		expect(reviewer.session).toBe("ephemeral");
		expect(reviewer.loop).toBe(false);
	});

	it("fixer has correct values", () => {
		expect(fixer.id).toBe("fixer");
		expect(fixer.capabilities).toEqual(["core", "coding-readwrite"]);
		expect(fixer.model).toBe("openai-codex/gpt-5.3-codex");
		expect(fixer.tools).toBe("coding");
		expect(fixer.extensions).toEqual([]);
		expect(fixer.skills).toBeUndefined();
		expect(fixer.subagents).toEqual([]);
		expect(fixer.projectContext).toBe(true);
		expect(fixer.session).toBe("ephemeral");
		expect(fixer.loop).toBe(false);
	});
});

describe("structural invariants", () => {
	it.each(ALL_DEFINITIONS)("$id has all required fields", (def) => {
		expectTypeOf(def.id).toBeString();
		expect(def.id.length).toBeGreaterThan(0);
		expectTypeOf(def.description).toBeString();
		expectTypeOf(def.model).toBeString();
		expectTypeOf(def.tools).toEqualTypeOf<AgentToolSet>();
		expectTypeOf(def.projectContext).toBeBoolean();
		expectTypeOf(def.session).toEqualTypeOf<AgentSessionMode>();
		expectTypeOf(def.loop).toBeBoolean();
	});

	it.each(ALL_DEFINITIONS)("$id has extensions array of strings", (def) => {
		expectTypeOf(def.extensions).toEqualTypeOf<readonly string[]>();
		for (const ext of def.extensions) {
			expect(ext.length).toBeGreaterThan(0);
		}
	});

	it.each(
		ALL_DEFINITIONS,
	)("$id has non-empty capabilities array of strings", (def) => {
		expectTypeOf(def.capabilities).toEqualTypeOf<readonly string[]>();
		expect(def.capabilities.length).toBeGreaterThan(0);
		for (const c of def.capabilities) {
			expect(c.length).toBeGreaterThan(0);
		}
	});

	it.each(
		ALL_DEFINITIONS,
	)("$id has subagents as string array when defined", (def) => {
		expectTypeOf(def.subagents).toEqualTypeOf<readonly string[] | undefined>();
	});

	it.each(
		ALL_DEFINITIONS,
	)("$id has skills as string array when defined", (def) => {
		expectTypeOf(def.skills).toEqualTypeOf<readonly string[] | undefined>();
	});
});
