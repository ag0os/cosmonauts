/**
 * Tests for coding domain agent definition invariants.
 *
 * These tests verify structural consistency rules that prevent
 * misconfiguration bugs — NOT the specific values of each definition.
 * Individual field values (model, capabilities, extensions, etc.) are
 * configuration, not behavior, and should not be snapshot-tested.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import architectureMemoryExtension from "../../domains/shared/extensions/architecture-memory/index.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	DomainRegistry,
	DomainResolver,
	loadDomainsFromSources,
} from "../../lib/domains/index.ts";
import {
	buildToolAllowlist,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/definition-resolution.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);
const BUNDLED_CODING_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"bundled",
	"coding",
);

const tmp = useTempDir("coding-agents-");
let allDefinitions: AgentDefinition[] = [];
let resolver: DomainResolver;

beforeAll(async () => {
	const domains = await loadDomainsFromSources([
		{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
		{
			domainsDir: BUNDLED_CODING_DIR,
			sourceType: "domain-root",
			origin: "bundled",
			precedence: 2,
		},
	]);
	const codingDomain = domains.find(
		(domain) => domain.manifest.id === "coding",
	);
	if (!codingDomain) {
		throw new Error("Coding domain not loaded");
	}

	allDefinitions = [...codingDomain.agents.values()];
	resolver = new DomainResolver(new DomainRegistry(domains));
});

describe("coding domain agent invariants", () => {
	it("has unique IDs across all definitions", () => {
		const ids = allDefinitions.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("uses valid tools values", () => {
		const valid = new Set(["coding", "readonly", "verification", "none"]);
		for (const def of allDefinitions) {
			expect(valid.has(def.tools)).toBe(true);
		}
	});

	it("uses valid session values", () => {
		const valid = new Set(["ephemeral", "persistent"]);
		for (const def of allDefinitions) {
			expect(valid.has(def.session)).toBe(true);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of allDefinitions) {
			expect(def.model).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/);
		}
	});

	it("has subagent references that point to existing definition IDs", () => {
		const allIds = new Set(allDefinitions.map((d) => d.id));
		for (const def of allDefinitions) {
			if (def.subagents) {
				for (const sub of def.subagents) {
					expect(allIds.has(sub)).toBe(true);
				}
			}
		}
	});

	it("allows quality-manager to spawn integration-verifier and coordinator", () => {
		const qualityManager = allDefinitions.find(
			(def) => def.id === "quality-manager",
		);

		expect(qualityManager).toBeDefined();
		expect(qualityManager?.subagents).toContain("integration-verifier");
		expect(qualityManager?.subagents).toContain("coordinator");
		expect(qualityManager?.subagents).not.toContain("tdd-coordinator");
	});

	it("does not give readonly agents coding-readwrite capability", () => {
		for (const def of allDefinitions) {
			if (def.tools === "readonly" || def.tools === "verification") {
				expect(def.capabilities).not.toContain("coding-readwrite");
			}
		}
	});

	it("does not give agents with tools 'none' any coding capability", () => {
		for (const def of allDefinitions) {
			if (def.tools === "none") {
				expect(def.capabilities).not.toContain("coding-readwrite");
				expect(def.capabilities).not.toContain("coding-readonly");
			}
		}
	});

	it("has at least one capability per definition", () => {
		for (const def of allDefinitions) {
			expect(def.capabilities.length).toBeGreaterThan(0);
		}
	});

	it("shares the healthy codebase harness across all coding agents", () => {
		for (const def of allDefinitions) {
			expect(def.capabilities).toContain("healthy-codebase-harness");
		}
	});

	it("has non-empty ID and description for all definitions", () => {
		for (const def of allDefinitions) {
			expect(def.id.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
		}
	});

	it("registers architecture_map_read at extension factory load for architecture-consuming agents @cosmo-behavior plan:memory-interface#B-015", async () => {
		const consumers = allDefinitions
			.filter((definition) =>
				definition.extensions.includes("architecture-memory"),
			)
			.sort((a, b) => a.id.localeCompare(b.id));
		expect(consumers.map((definition) => definition.id)).toEqual([
			"coordinator",
			"plan-reviewer",
			"planner",
			"quality-manager",
			"worker",
		]);

		for (const definition of consumers) {
			const extensionPaths = resolveExtensionPaths(definition.extensions, {
				domain: definition.domain ?? "coding",
				resolver,
			});
			const extensionToolGroups =
				await collectExtensionToolGroups(extensionPaths);
			const allowlist = buildToolAllowlist(
				resolveTools(definition.tools, tmp.path),
				fakeLoader(extensionToolGroups),
			);

			expect(allowlist, definition.id).toContain("architecture_map_read");
		}

		const unmappedPi = createMockPi({ cwd: tmp.path });
		architectureMemoryExtension(unmappedPi as never);
		expect(unmappedPi.tools.has("architecture_map_read")).toBe(true);
		const missing = (await unmappedPi.callTool(
			"architecture_map_read",
			{},
		)) as {
			content: { type: "text"; text: string }[];
			details: unknown;
		};
		expect(resultText(missing)).toContain(
			"`memory/architecture/index.md` is missing.",
		);
		expect(missing.details).toMatchObject({
			status: "missing-map",
			resource: "memory/architecture/index.md",
		});

		await mkdir(join(tmp.path, "memory", "architecture"), { recursive: true });
		await writeFile(
			join(tmp.path, "memory", "architecture", "index.md"),
			"---\ntype: code-structure-index\nresource: memory/architecture/index.md\n---\n\n# Architecture Map\n",
			"utf-8",
		);
		const mapped = (await unmappedPi.callTool("architecture_map_read", {})) as {
			content: { type: "text"; text: string }[];
			details: unknown;
		};
		expect(resultText(mapped)).toContain("# Architecture Map");
		expect(mapped.details).toMatchObject({
			status: "found",
			resource: "memory/architecture/index.md",
		});
	});
});

type ExtensionFactory = (api: unknown) => void;

async function collectExtensionToolGroups(
	extensionPaths: readonly string[],
): Promise<string[][]> {
	const groups: string[][] = [];

	for (const extensionPath of extensionPaths) {
		const names: string[] = [];
		const extension = await loadExtension(extensionPath);
		extension(createToolCollector(names));
		groups.push(names);
	}

	return groups;
}

async function loadExtension(extensionPath: string): Promise<ExtensionFactory> {
	const mod = (await import(join(extensionPath, "index.ts"))) as {
		default?: unknown;
	};
	if (typeof mod.default !== "function") {
		throw new Error(`Extension has no default export: ${extensionPath}`);
	}
	return mod.default as ExtensionFactory;
}

function createToolCollector(names: string[]): unknown {
	return {
		registerTool(tool: { name: string }): void {
			names.push(tool.name);
		},
		registerCommand(): void {},
		registerMessageRenderer(): void {},
		on(): void {},
		appendEntry(): void {},
		sendMessage(): void {},
		sendUserMessage(): void {},
	};
}

function fakeLoader(
	extensionToolGroups: readonly (readonly string[])[],
): Parameters<typeof buildToolAllowlist>[1] {
	const extensions = extensionToolGroups.map((names) => ({
		tools: new Map(names.map((name) => [name, { name }])),
	}));

	return {
		getExtensions: () => ({ extensions, errors: [], runtime: {} }),
	} as unknown as Parameters<typeof buildToolAllowlist>[1];
}

function resultText(result: {
	content: { type: "text"; text: string }[];
}): string {
	return result.content.map((entry) => entry.text).join("\n");
}
