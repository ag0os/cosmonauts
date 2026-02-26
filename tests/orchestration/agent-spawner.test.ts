/**
 * Tests for agent-spawner.ts
 * Covers helper functions: resolveTools, resolveExtensionPaths, getModelForRole.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	getModelForRole,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/agent-spawner.ts";
import { loadPrompt, renderRuntimeTemplate } from "../../lib/prompts/loader.ts";

const EXTENSIONS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"extensions",
);

// ============================================================================
// Fixtures — synthetic definitions for getModelForRole tests
// ============================================================================

const FIXTURE_PLANNER: AgentDefinition = {
	id: "planner",
	description: "Fixture planner",
	prompts: ["base/test"],
	model: "fixture-provider/fixture-planner-model",
	tools: "readonly",
	extensions: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

const FIXTURE_WORKER: AgentDefinition = {
	id: "worker",
	description: "Fixture worker",
	prompts: ["base/test"],
	model: "fixture-provider/fixture-worker-model",
	tools: "coding",
	extensions: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

const FIXTURE_REGISTRY = new AgentRegistry([FIXTURE_PLANNER, FIXTURE_WORKER]);

describe("resolveTools", () => {
	const cwd = "/tmp/test-project";

	test("coding returns an array of tools", () => {
		const tools = resolveTools("coding", cwd);
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);
	});

	test("readonly returns an array of tools", () => {
		const tools = resolveTools("readonly", cwd);
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);
	});

	test("none returns empty array", () => {
		const tools = resolveTools("none", cwd);
		expect(tools).toEqual([]);
	});

	test("coding and readonly return different tool sets", () => {
		const coding = resolveTools("coding", cwd);
		const readonly = resolveTools("readonly", cwd);
		const codingNames = coding.map((t) => t.name).sort();
		const readonlyNames = readonly.map((t) => t.name).sort();
		expect(codingNames).not.toEqual(readonlyNames);
	});
});

describe("resolveExtensionPaths", () => {
	test("resolves known extensions to absolute paths", () => {
		const paths = resolveExtensionPaths(["tasks", "orchestration"]);
		expect(paths).toHaveLength(2);
		expect(paths[0]).toBe(join(EXTENSIONS_DIR, "tasks"));
		expect(paths[1]).toBe(join(EXTENSIONS_DIR, "orchestration"));
	});

	test("filters out unknown extensions", () => {
		const paths = resolveExtensionPaths(["nonexistent"]);
		expect(paths).toEqual([]);
	});

	test("returns empty for empty input", () => {
		const paths = resolveExtensionPaths([]);
		expect(paths).toEqual([]);
	});

	test("filters mixed known and unknown extensions", () => {
		const paths = resolveExtensionPaths(["tasks", "nonexistent", "todo"]);
		expect(paths).toHaveLength(2);
		expect(paths[0]).toBe(join(EXTENSIONS_DIR, "tasks"));
		expect(paths[1]).toBe(join(EXTENSIONS_DIR, "todo"));
	});

	test("resolves all known extensions", () => {
		const paths = resolveExtensionPaths([
			"tasks",
			"plans",
			"orchestration",
			"todo",
			"init",
		]);
		expect(paths).toHaveLength(5);
	});
});

describe("getModelForRole", () => {
	test("returns definition model for known role (tier 2)", () => {
		const model = getModelForRole("planner", undefined, FIXTURE_REGISTRY);
		expect(model).toBe("fixture-provider/fixture-planner-model");
	});

	test("returns definition model for worker (tier 2)", () => {
		const model = getModelForRole("worker", undefined, FIXTURE_REGISTRY);
		expect(model).toBe("fixture-provider/fixture-worker-model");
	});

	test("returns fallback for unknown role (tier 4)", () => {
		const model = getModelForRole("unknown-role", undefined, FIXTURE_REGISTRY);
		expect(model).toBe("anthropic/claude-opus-4-6");
	});

	test("explicit override takes precedence over definition model (tier 1 > tier 2)", () => {
		const model = getModelForRole(
			"planner",
			{ planner: "override-provider/override-model" },
			FIXTURE_REGISTRY,
		);
		expect(model).toBe("override-provider/override-model");
	});

	test("models.default used when role has no definition and no override (tier 3)", () => {
		const model = getModelForRole(
			"unknown-role",
			{ default: "default-provider/default-model" },
			FIXTURE_REGISTRY,
		);
		expect(model).toBe("default-provider/default-model");
	});

	test("definition model beats models.default (tier 2 > tier 3)", () => {
		const model = getModelForRole(
			"planner",
			{ default: "default-provider/default-model" },
			FIXTURE_REGISTRY,
		);
		expect(model).toBe("fixture-provider/fixture-planner-model");
	});
});

describe("runtime sub-agent layer", () => {
	test("runtime/sub-agent.md template loads successfully", async () => {
		const template = await loadPrompt("runtime/sub-agent");
		expect(template).toContain("{{parentRole}}");
		expect(template).toContain("{{objective}}");
	});

	test("rendered template includes parent role and objective", () => {
		const rendered = renderRuntimeTemplate(
			"Spawned by {{parentRole}}. Goal: {{objective}}. {{#taskId}}Task: {{taskId}}{{/taskId}}",
			{
				parentRole: "coordinator",
				objective: "implement feature",
				taskId: "COSMO-001",
			},
		);
		expect(rendered).toContain("coordinator");
		expect(rendered).toContain("implement feature");
		expect(rendered).toContain("COSMO-001");
	});

	test("rendered template uses defaults when context fields are missing", () => {
		const rendered = renderRuntimeTemplate(
			"Spawned by {{parentRole}}. Goal: {{objective}}.",
			{},
		);
		expect(rendered).toContain("unknown");
		expect(rendered).toContain("Complete the assigned work");
	});

	test("rendered template omits task section when taskId is absent", () => {
		const rendered = renderRuntimeTemplate(
			"Start. {{#taskId}}Task: {{taskId}}{{/taskId}} End.",
			{ parentRole: "coordinator" },
		);
		expect(rendered).not.toContain("Task:");
		expect(rendered).not.toContain("{{");
	});

	test("rendered template includes task section when taskId is present", () => {
		const rendered = renderRuntimeTemplate(
			"Start. {{#taskId}}Task: {{taskId}}{{/taskId}} End.",
			{ parentRole: "coordinator", taskId: "COSMO-042" },
		);
		expect(rendered).toContain("Task: COSMO-042");
	});

	test("no unresolved template tokens remain after rendering", () => {
		const rendered = renderRuntimeTemplate(
			"{{parentRole}} {{objective}} {{#taskId}}{{taskId}}{{/taskId}} {{unknownToken}}",
			{ parentRole: "worker", objective: "fix bug" },
		);
		expect(rendered).not.toMatch(/\{\{.*?\}\}/);
	});
});
