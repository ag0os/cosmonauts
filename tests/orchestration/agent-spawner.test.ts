/**
 * Tests for agent-spawner.ts
 * Covers helper functions: resolveTools, resolveExtensionPaths, getModelForRole.
 */

import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	getModelForRole,
	getThinkingForRole,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/agent-spawner.ts";
import { loadPrompt, renderRuntimeTemplate } from "../../lib/prompts/loader.ts";

const DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

const SHARED_EXTENSIONS_DIR = join(DOMAINS_DIR, "shared", "extensions");

// ============================================================================
// Fixtures — synthetic definitions for getModelForRole tests
// ============================================================================

const FIXTURE_PLANNER: AgentDefinition = {
	id: "planner",
	description: "Fixture planner",
	capabilities: ["core"],
	model: "fixture-provider/fixture-planner-model",
	tools: "readonly",
	extensions: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

const FIXTURE_WORKER: AgentDefinition = {
	id: "worker",
	description: "Fixture worker",
	capabilities: ["core"],
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

	test("verification returns an array of tools", () => {
		const tools = resolveTools("verification", cwd);
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

	test("verification includes bash but excludes edit and write", () => {
		const verification = resolveTools("verification", cwd);
		const verificationNames = verification.map((t) => t.name).sort();
		expect(verificationNames).toContain("bash");
		expect(verificationNames).toContain("read");
		expect(verificationNames).not.toContain("edit");
		expect(verificationNames).not.toContain("write");
	});
});

describe("resolveExtensionPaths", () => {
	const sharedOpts = { domain: "shared", domainsDir: DOMAINS_DIR };
	const codingOpts = { domain: "coding", domainsDir: DOMAINS_DIR };

	// ---- Shared fallback ----

	test("resolves shared extensions to absolute paths", () => {
		const paths = resolveExtensionPaths(["tasks", "orchestration"], sharedOpts);
		expect(paths).toHaveLength(2);
		expect(paths[0]).toBe(join(SHARED_EXTENSIONS_DIR, "tasks"));
		expect(paths[1]).toBe(join(SHARED_EXTENSIONS_DIR, "orchestration"));
	});

	test("non-shared domain falls back to shared extensions", () => {
		const paths = resolveExtensionPaths(["tasks", "todo"], codingOpts);
		expect(paths).toHaveLength(2);
		expect(paths[0]).toBe(join(SHARED_EXTENSIONS_DIR, "tasks"));
		expect(paths[1]).toBe(join(SHARED_EXTENSIONS_DIR, "todo"));
	});

	test("returns empty for empty input", () => {
		const paths = resolveExtensionPaths([], sharedOpts);
		expect(paths).toEqual([]);
	});

	test("resolves all shared extensions", () => {
		const paths = resolveExtensionPaths(
			["tasks", "plans", "orchestration", "todo", "init"],
			sharedOpts,
		);
		expect(paths).toHaveLength(5);
	});

	// ---- Error on unknown extensions ----

	test("throws for unknown extension in shared domain", () => {
		expect(() =>
			resolveExtensionPaths(["nonexistent"], sharedOpts),
		).toThrowError(/Unknown extension "nonexistent"/);
	});

	test("throws for unknown extension in non-shared domain", () => {
		expect(() =>
			resolveExtensionPaths(["nonexistent"], codingOpts),
		).toThrowError(/Unknown extension "nonexistent"/);
	});

	test("error message includes searched paths", () => {
		expect(() => resolveExtensionPaths(["bad-ext"], codingOpts)).toThrowError(
			/domains\/coding\/extensions\/bad-ext.*domains\/shared\/extensions\/bad-ext/,
		);
	});

	test("error message for shared domain only lists shared path", () => {
		expect(() => resolveExtensionPaths(["bad-ext"], sharedOpts)).toThrowError(
			/domains\/shared\/extensions\/bad-ext/,
		);
	});

	test("throws on first unknown in mixed list", () => {
		expect(() =>
			resolveExtensionPaths(["tasks", "nonexistent", "todo"], sharedOpts),
		).toThrowError(/Unknown extension "nonexistent"/);
	});

	// ---- Domain-specific extension loading ----

	let tmpDomainsDir: string;

	beforeEach(() => {
		tmpDomainsDir = join(
			import.meta.dirname ?? ".",
			`.tmp-test-domains-${Date.now()}`,
		);
		// Create shared extension
		mkdirSync(join(tmpDomainsDir, "shared", "extensions", "common-ext"), {
			recursive: true,
		});
		// Create domain-specific extension
		mkdirSync(join(tmpDomainsDir, "custom", "extensions", "custom-ext"), {
			recursive: true,
		});
		// Create override: same name in both domain and shared
		mkdirSync(join(tmpDomainsDir, "custom", "extensions", "common-ext"), {
			recursive: true,
		});
	});

	afterEach(() => {
		rmSync(tmpDomainsDir, { recursive: true, force: true });
	});

	test("domain-specific extension takes precedence over shared", () => {
		const paths = resolveExtensionPaths(["common-ext"], {
			domain: "custom",
			domainsDir: tmpDomainsDir,
		});
		expect(paths).toHaveLength(1);
		expect(paths[0]).toBe(
			join(tmpDomainsDir, "custom", "extensions", "common-ext"),
		);
	});

	test("falls back to shared when domain does not have extension", () => {
		// custom-ext only exists in custom domain, common-ext in both
		// Request an extension that only exists in shared
		const paths = resolveExtensionPaths(["common-ext"], {
			domain: "shared",
			domainsDir: tmpDomainsDir,
		});
		expect(paths).toHaveLength(1);
		expect(paths[0]).toBe(
			join(tmpDomainsDir, "shared", "extensions", "common-ext"),
		);
	});

	test("resolves domain-only extension that does not exist in shared", () => {
		const paths = resolveExtensionPaths(["custom-ext"], {
			domain: "custom",
			domainsDir: tmpDomainsDir,
		});
		expect(paths).toHaveLength(1);
		expect(paths[0]).toBe(
			join(tmpDomainsDir, "custom", "extensions", "custom-ext"),
		);
	});

	test("throws when extension not found in domain or shared", () => {
		expect(() =>
			resolveExtensionPaths(["missing"], {
				domain: "custom",
				domainsDir: tmpDomainsDir,
			}),
		).toThrowError(/Unknown extension "missing"/);
	});
});

describe("getModelForRole", () => {
	test("returns definition model for known role (tier 2)", () => {
		const model = getModelForRole("planner", undefined, FIXTURE_REGISTRY);
		expect(model).toBe("fixture-provider/fixture-planner-model");
	});

	test("uses domainContext when resolving an ambiguous unqualified role", () => {
		const registry = new AgentRegistry([
			{
				...FIXTURE_PLANNER,
				domain: "coding",
			},
			{
				...FIXTURE_PLANNER,
				model: "fixture-provider/docs-planner-model",
				domain: "docs",
			},
		]);

		const model = getModelForRole("planner", undefined, registry, "docs");
		expect(model).toBe("fixture-provider/docs-planner-model");
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
			"docs/planner",
			{ planner: "override-provider/override-model" },
			FIXTURE_REGISTRY,
		);
		expect(model).toBe("override-provider/override-model");
	});

	test("supports model override keys for new roles", () => {
		const model = getModelForRole("quality-manager", {
			qualityManager: "override-provider/quality-model",
		});
		expect(model).toBe("override-provider/quality-model");
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

describe("getThinkingForRole", () => {
	test("returns definition thinkingLevel for known role (tier 2)", () => {
		const thinking = getThinkingForRole("planner", undefined, FIXTURE_REGISTRY);
		expect(thinking).toBe("high");
	});

	test("uses domainContext when resolving an ambiguous unqualified role", () => {
		const registry = new AgentRegistry([
			{
				...FIXTURE_PLANNER,
				thinkingLevel: "minimal",
				domain: "coding",
			},
			{
				...FIXTURE_PLANNER,
				thinkingLevel: "low",
				domain: "docs",
			},
		]);

		const thinking = getThinkingForRole("planner", undefined, registry, "docs");
		expect(thinking).toBe("low");
	});

	test("returns undefined for role with no thinkingLevel on definition (tier 4)", () => {
		const thinking = getThinkingForRole("worker", undefined, FIXTURE_REGISTRY);
		expect(thinking).toBeUndefined();
	});

	test("returns undefined when nothing is configured (tier 4)", () => {
		const thinking = getThinkingForRole(
			"unknown-role",
			undefined,
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBeUndefined();
	});

	test("explicit override takes precedence over definition thinkingLevel (tier 1 > tier 2)", () => {
		const thinking = getThinkingForRole(
			"docs/planner",
			{ planner: "low" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("low");
	});

	test("thinking.default used when role has no definition and no override (tier 3)", () => {
		const thinking = getThinkingForRole(
			"unknown-role",
			{ default: "medium" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("medium");
	});

	test("definition thinkingLevel beats thinking.default (tier 2 > tier 3)", () => {
		const thinking = getThinkingForRole(
			"planner",
			{ default: "low" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("high");
	});

	test("explicit override beats thinking.default (tier 1 > tier 3)", () => {
		const thinking = getThinkingForRole(
			"worker",
			{ worker: "xhigh", default: "low" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("xhigh");
	});

	test("thinking.default beats undefined when definition has no thinkingLevel (tier 3 > tier 4)", () => {
		const thinking = getThinkingForRole(
			"worker",
			{ default: "medium" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("medium");
	});

	test("explicit override beats definition and default (tier 1 > tier 2 > tier 3)", () => {
		const thinking = getThinkingForRole(
			"planner",
			{ planner: "minimal", default: "low" },
			FIXTURE_REGISTRY,
		);
		expect(thinking).toBe("minimal");
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
