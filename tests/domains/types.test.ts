import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { manifest as codingManifest } from "../../domains/coding/domain.ts";
import { manifest as sharedManifest } from "../../domains/shared/domain.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { DomainManifest, LoadedDomain } from "../../lib/domains/types.ts";
import type { WorkflowDefinition } from "../../lib/workflows/types.ts";

const DOMAINS_ROOT = resolve(import.meta.dirname, "../../domains");

describe("DomainManifest type", () => {
	it("accepts a minimal manifest with only required fields", () => {
		const minimal: DomainManifest = {
			id: "test",
			description: "A test domain",
		};
		expectTypeOf(minimal.id).toBeString();
		expectTypeOf(minimal.description).toBeString();
		expectTypeOf(minimal.lead).toEqualTypeOf<string | undefined>();
		expectTypeOf(minimal.defaultModel).toEqualTypeOf<string | undefined>();
	});

	it("accepts a full manifest with all optional fields", () => {
		const full: DomainManifest = {
			id: "test",
			description: "A test domain",
			lead: "cosmo",
			defaultModel: "anthropic/claude-sonnet-4-20250514",
		};
		expect(full.lead).toBe("cosmo");
		expect(full.defaultModel).toBe("anthropic/claude-sonnet-4-20250514");
	});
});

describe("LoadedDomain type", () => {
	it("has all required fields with correct types", () => {
		const loaded: LoadedDomain = {
			manifest: { id: "test", description: "Test" },
			agents: new Map<string, AgentDefinition>(),
			capabilities: new Set<string>(),
			prompts: new Set<string>(),
			skills: new Set<string>(),
			extensions: new Set<string>(),
			workflows: [] as WorkflowDefinition[],
			rootDir: "/tmp/test",
		};
		expectTypeOf(loaded.manifest).toEqualTypeOf<DomainManifest>();
		expectTypeOf(loaded.agents).toEqualTypeOf<Map<string, AgentDefinition>>();
		expectTypeOf(loaded.capabilities).toEqualTypeOf<Set<string>>();
		expectTypeOf(loaded.prompts).toEqualTypeOf<Set<string>>();
		expectTypeOf(loaded.skills).toEqualTypeOf<Set<string>>();
		expectTypeOf(loaded.extensions).toEqualTypeOf<Set<string>>();
		expectTypeOf(loaded.workflows).toEqualTypeOf<WorkflowDefinition[]>();
		expectTypeOf(loaded.rootDir).toBeString();
	});
});

describe("shared domain manifest", () => {
	it("has id 'shared'", () => {
		expect(sharedManifest.id).toBe("shared");
	});

	it("has a non-empty description", () => {
		expect(sharedManifest.description.length).toBeGreaterThan(0);
	});

	it("does not specify a lead agent", () => {
		expect(sharedManifest.lead).toBeUndefined();
	});

	it("satisfies DomainManifest interface", () => {
		expectTypeOf(sharedManifest).toMatchTypeOf<DomainManifest>();
	});
});

describe("coding domain manifest", () => {
	it("has id 'coding'", () => {
		expect(codingManifest.id).toBe("coding");
	});

	it("has a non-empty description", () => {
		expect(codingManifest.description.length).toBeGreaterThan(0);
	});

	it("has 'cosmo' as lead agent", () => {
		expect(codingManifest.lead).toBe("cosmo");
	});

	it("satisfies DomainManifest interface", () => {
		expectTypeOf(codingManifest).toMatchTypeOf<DomainManifest>();
	});
});

describe("domain directory structure", () => {
	const sharedDirs = ["prompts", "capabilities", "skills", "extensions"];
	const codingDirs = ["agents", "prompts", "capabilities", "skills"];

	it.each(sharedDirs)("domains/shared/%s directory exists", (subdir) => {
		expect(existsSync(resolve(DOMAINS_ROOT, "shared", subdir))).toBe(true);
	});

	it.each(codingDirs)("domains/coding/%s directory exists", (subdir) => {
		expect(existsSync(resolve(DOMAINS_ROOT, "coding", subdir))).toBe(true);
	});
});
