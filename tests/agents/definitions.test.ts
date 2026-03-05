import { describe, expect, expectTypeOf, it } from "vitest";
import {
	BUILTIN_DEFINITIONS,
	PLANNER_DEFINITION,
	TASK_MANAGER_DEFINITION,
} from "../../lib/agents/definitions.ts";
import type {
	AgentDefinition,
	AgentSessionMode,
	AgentToolSet,
} from "../../lib/agents/types.ts";

const VALID_THINKING_LEVELS = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

describe("BUILTIN_DEFINITIONS", () => {
	it("contains at least one built-in agent", () => {
		expect(BUILTIN_DEFINITIONS.length).toBeGreaterThan(0);
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

	it.each`
		field        | validValues
		${"tools"}   | ${["coding", "readonly", "none"]}
		${"session"} | ${["ephemeral", "persistent"]}
	`("uses valid $field values", ({ field, validValues }) => {
		const valid = new Set(validValues as string[]);
		for (const def of BUILTIN_DEFINITIONS) {
			expect(valid.has(def[field as keyof AgentDefinition] as string)).toBe(
				true,
			);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			expect(def.model).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/);
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

	it("has thinkingLevel that is either a valid ThinkingLevel or undefined", () => {
		for (const def of BUILTIN_DEFINITIONS) {
			if (def.thinkingLevel !== undefined) {
				expect(VALID_THINKING_LEVELS.has(def.thinkingLevel)).toBe(true);
			}
		}
	});

	it("has thinkingLevel 'high' for planner and task-manager", () => {
		expect(PLANNER_DEFINITION.thinkingLevel).toBe("high");
		expect(TASK_MANAGER_DEFINITION.thinkingLevel).toBe("high");
	});

	it("has thinkingLevel undefined for definitions other than planner and task-manager", () => {
		const highThinkingIds = new Set(["planner", "task-manager"]);
		for (const def of BUILTIN_DEFINITIONS) {
			if (!highThinkingIds.has(def.id)) {
				expect(def.thinkingLevel).toBeUndefined();
			}
		}
	});
});

describe("structural invariants (parameterized)", () => {
	it.each(BUILTIN_DEFINITIONS)("$id has all required fields", (def) => {
		expectTypeOf(def.id).toBeString();
		expect(def.id.length).toBeGreaterThan(0);
		expectTypeOf(def.description).toBeString();
		expectTypeOf(def.model).toBeString();
		expectTypeOf(def.tools).toEqualTypeOf<AgentToolSet>();
		expectTypeOf(def.projectContext).toBeBoolean();
		expectTypeOf(def.session).toEqualTypeOf<AgentSessionMode>();
		expectTypeOf(def.loop).toBeBoolean();
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has non-empty extensions array of strings", (def) => {
		expectTypeOf(def.extensions).toEqualTypeOf<readonly string[]>();
		for (const ext of def.extensions) {
			expect(ext.length).toBeGreaterThan(0);
		}
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has non-empty prompts array of strings", (def) => {
		expectTypeOf(def.prompts).toEqualTypeOf<readonly string[]>();
		expect(def.prompts.length).toBeGreaterThan(0);
		for (const p of def.prompts) {
			expect(p.length).toBeGreaterThan(0);
		}
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has subagents as string array when defined", (def) => {
		expectTypeOf(def.subagents).toEqualTypeOf<readonly string[] | undefined>();
	});

	it.each(
		BUILTIN_DEFINITIONS,
	)("$id has skills as string array when defined", (def) => {
		expectTypeOf(def.skills).toEqualTypeOf<readonly string[] | undefined>();
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
		expectTypeOf(external.namespace).toEqualTypeOf<string | undefined>();
		expect(external.namespace).toBeUndefined();
	});
});
