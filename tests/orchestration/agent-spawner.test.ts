/**
 * Tests for agent-spawner.ts
 * Covers helper functions: resolveTools, resolveExtensionPaths, getModelForRole.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	getModelForRole,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/agent-spawner.ts";
import {
	loadPrompt,
	renderRuntimeTemplate,
} from "../../lib/prompts/loader.ts";

const EXTENSIONS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"extensions",
);

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
	test("returns definition model for known role", () => {
		const model = getModelForRole("planner");
		expect(model).toBe("anthropic/claude-opus-4-0");
	});

	test("returns definition model for worker", () => {
		const model = getModelForRole("worker");
		expect(model).toBe("anthropic/claude-sonnet-4-5");
	});

	test("returns fallback for unknown role", () => {
		const model = getModelForRole("unknown-role");
		expect(model).toBe("anthropic/claude-sonnet-4-5");
	});

	test("explicit override takes precedence over definition model", () => {
		const model = getModelForRole("planner", {
			planner: "anthropic/claude-haiku-3-5",
		});
		expect(model).toBe("anthropic/claude-haiku-3-5");
	});

	test("models.default used when role has no definition and no override", () => {
		const model = getModelForRole("unknown-role", {
			default: "anthropic/claude-haiku-3-5",
		});
		expect(model).toBe("anthropic/claude-haiku-3-5");
	});

	test("definition model used when role has no override but has definition", () => {
		const model = getModelForRole("planner", {
			default: "anthropic/claude-haiku-3-5",
		});
		expect(model).toBe("anthropic/claude-opus-4-0");
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
			{ parentRole: "coordinator", objective: "implement feature", taskId: "COSMO-001" },
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
