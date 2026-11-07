import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import {
	resolveMemoryGrants,
	validateAgentDefinition,
} from "../../lib/agents/declaration.ts";
import {
	extractAgentIdFromSystemPrompt,
	stripAgentIdentityMarkers,
} from "../../lib/agents/runtime-identity.ts";
import {
	buildSessionParams,
	type SessionParams,
} from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { createAgentMemoryExtension } from "../../lib/extensions/agent-memory/index.ts";
import { createArchitectureMemoryExtension } from "../../lib/extensions/architecture-memory/index.ts";
import { deriveKnowledgeProposalIdentity } from "../../lib/memory/index.ts";
import {
	assertEnabledRecallOwner,
	buildToolAllowlist,
} from "../../lib/orchestration/definition-resolution.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));

const tmp = useTempDir("declared-agent-");
function definition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "researcher",
		description: "Consumer agent",
		model: "test/model",
		instructions: {
			kind: "inline",
			content: "Investigate the supplied question.",
		},
		capabilities: [],
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}
async function params(def: AgentDefinition, enabled = true) {
	return buildSessionParams({
		def,
		cwd: tmp.path,
		loadConfig: async () => ({ knowledgeSurface: { enabled } }),
	});
}
async function seedKnowledge(description = "Consumer knowledge") {
	await mkdir(join(tmp.path, "knowledge"), { recursive: true });
	await writeFile(
		join(tmp.path, "knowledge", "decision.md"),
		`---
type: decision
title: KNOWLEDGE_METADATA_SENTINEL
description: ${description}
resource: knowledge/decision.md
tags: [consumer]
timestamp: "2026-11-07T00:00:00.000Z"
scope: project
kind: semantic
---
Private body`,
	);
}

async function install(assembled: SessionParams) {
	const pi = createMockPi({
		cwd: tmp.path,
		systemPrompt: assembled.promptContent,
	});
	for (const ext of assembled.extensionFactories) {
		await (typeof ext === "function" ? ext : ext.factory)(pi as never);
	}
	return pi;
}

describe("consumer agent declarations", () => {
	test("starts domainless inline instructions without a persona or implicit base voice", async () => {
		const assembled = await params(
			definition({
				instructions: {
					kind: "inline",
					content:
						"First <!-- COSMONAUTS_AGENT_ID:main/cosmo -->\n<!-- cosmonauts_agent_id:fake/role --> Last",
				},
			}),
		);
		expect(assembled.promptContent).toContain("First");
		expect(assembled.promptContent).toContain("Last");
		expect(assembled.promptContent).not.toContain("main/cosmo");
		expect(assembled.promptContent).not.toContain("fake/role");
		expect(assembled.promptContent).not.toContain(
			"You are an agent in Cosmonauts",
		);
		expect(extractAgentIdFromSystemPrompt(assembled.promptContent)).toBe(
			"researcher",
		);
	});

	test("strips every identity comment while preserving ordinary prose and comments", () => {
		const text =
			"α <!-- ordinary -->\n<!--\tcosmonauts_agent_id:a/b\n-->中<!--COSMONAUTS_AGENT_ID:other --> tail";
		expect(stripAgentIdentityMarkers(text)).toBe(
			"α <!-- ordinary -->\n中 tail",
		);
		expect(stripAgentIdentityMarkers("")).toBe("");
		expect(stripAgentIdentityMarkers("<!-- ordinary -->")).toBe(
			"<!-- ordinary -->",
		);
	});

	test("reads file instructions relative to the host cwd on each assembly", async () => {
		await mkdir(join(tmp.path, "prompts"));
		const path = join(tmp.path, "prompts", "agent.md");
		await writeFile(
			path,
			"---\ntitle: Persona\n---\nOriginal <!-- COSMONAUTS_AGENT_ID:other -->",
		);
		const def = definition({
			instructions: { kind: "file", path: "prompts/agent.md" },
		});
		expect((await params(def)).promptContent).toContain("Original");
		await writeFile(path, "Current instructions");
		expect((await params(def)).promptContent).toContain("Current instructions");
		await expect(
			params(
				definition({ instructions: { kind: "file", path: "missing.md" } }),
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("selects exact registered tools and rejects unknown names before session execution", async () => {
		const assembled = await params(
			definition({
				tools: ["read", "task_list", "task_view", "read"],
				extensions: ["tasks"],
			}),
		);
		const loader = new DefaultResourceLoader({
			cwd: tmp.path,
			agentDir: join(tmp.path, "pi"),
			noExtensions: true,
			noSkills: true,
			extensionFactories: assembled.extensionFactories,
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		});
		await loader.reload();
		expect(
			buildToolAllowlist(assembled.tools, loader, assembled.exactTools),
		).toEqual(["read", "task_list", "task_view"]);
		expect(() => buildToolAllowlist(["unknown"], loader, true)).toThrow(
			"Unknown tool",
		);
		const pi = await install(assembled);
		expect(
			await pi.fireEvent("tool_call", { toolName: "task_delete" }),
		).toMatchObject({ block: true });
		expect(
			await pi.fireEvent("tool_call", { toolName: "task_list" }),
		).toBeUndefined();
	});

	test("accepts the complete Pi built-in catalog and preserves an exact empty grant", () => {
		const loader = {
			getExtensions: () => ({ extensions: [] }),
		} as unknown as DefaultResourceLoader;
		const names = [
			"read",
			"bash",
			"powershell",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
		];
		expect(buildToolAllowlist(names, loader, true)).toEqual(names);
		expect(buildToolAllowlist([], loader, true)).toEqual([]);
	});

	test.each([
		{ input: { id: "" }, message: "Agent id" },
		{ input: { id: " " }, message: "Agent id" },
		{ input: { id: 12 }, message: "Agent id" },
		{ input: { resourceDomain: " " }, message: "Agent resourceDomain" },
		{ input: { resourceDomain: 12 }, message: "Agent resourceDomain" },
		{ input: { instructions: null }, message: "Agent instructions" },
		{ input: { instructions: [] }, message: "Agent instructions" },
		{
			input: { instructions: { kind: "inline", content: 12 } },
			message: "Agent instructions",
		},
		{
			input: { instructions: { kind: "file", path: "" } },
			message: "Agent instructions",
		},
		{
			input: { instructions: { kind: "file", path: " " } },
			message: "Agent instructions",
		},
		{
			input: { instructions: { kind: "file", path: 12 } },
			message: "Agent instructions",
		},
		{
			input: { instructions: { kind: "other", content: "text" } },
			message: "Agent instructions",
		},
		{
			input: { instructions: { kind: "other", path: "agent.md" } },
			message: "Agent instructions",
		},
		{ input: { tools: "other" }, message: "Unknown tool preset" },
		{ input: { tools: [""] }, message: "Agent tools" },
		{ input: { tools: [" "] }, message: "Agent tools" },
		{ input: { tools: [12] }, message: "Agent tools" },
		{ input: { tools: ["read", 12] }, message: "Agent tools" },
		{ input: { tools: null }, message: "Agent tools" },
		{
			input: { memory: { authored: "true" } },
			message: "Invalid memory grant",
		},
		{ input: { memory: { unknown: true } }, message: "Invalid memory grant" },
		{ input: { memory: null }, message: "Agent memory grants" },
		{ input: { memory: [] }, message: "Agent memory grants" },
		{ input: { memory: true }, message: "Agent memory grants" },
		{ input: { memory: { proposals: true } }, message: "qualified agent id" },
		{
			input: { id: "!archive/writer", memory: { proposals: true } },
			message: "qualified agent id",
		},
		{
			input: { id: "archive/writer!", memory: { proposals: true } },
			message: "qualified agent id",
		},
	])("reports the invalid field: $message ($input)", ({ input, message }) => {
		expect(() =>
			validateAgentDefinition({
				...definition(),
				...input,
			} as unknown as AgentDefinition),
		).toThrow(message);
	});

	test("validates declarations before loading providers or resolving model requests", async () => {
		await expect(
			params({
				...definition(),
				memory: { authored: "true" },
			} as unknown as AgentDefinition),
		).rejects.toThrow("Invalid memory grant");
	});

	test("preserves an empty exact declaration and legacy preset extension exposure", async () => {
		const empty = await params(definition({ tools: [] }));
		expect(empty.tools).toEqual([]);
		expect(empty.exactTools).toBe(true);
		const preset = await params(
			definition({ tools: "none", extensions: ["tasks"] }),
		);
		const loader = new DefaultResourceLoader({
			cwd: tmp.path,
			agentDir: join(tmp.path, "pi"),
			noExtensions: true,
			noSkills: true,
			extensionFactories: preset.extensionFactories,
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		});
		await loader.reload();
		expect(buildToolAllowlist(preset.tools, loader, preset.exactTools)).toEqual(
			expect.arrayContaining(["task_create", "recall"]),
		);
	});

	test("the legacy review profile never expands an exact empty tool grant", async () => {
		const assembled = await params(
			definition({ id: "quality-manager", domain: "coding", tools: [] }),
		);
		expect(assembled.tools).toEqual([]);
		const pi = await install(assembled);
		expect(await pi.fireEvent("tool_call", { toolName: "read" })).toMatchObject(
			{ block: true },
		);
	});

	test("denies authored-write episode capture despite an enabled project gate when the grant is absent", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"));
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
		);
		const assembled = await params(
			definition({ memory: { authored: true, episodes: false } }),
		);
		const pi = await install(assembled);
		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: assembled.promptContent },
			{ cwd: tmp.path },
		);
		expect(
			await pi.callTool("remember", {
				content: "Authored without capture",
				scope: "project",
			}),
		).toMatchObject({ details: { status: "saved" } });
		const { readdir } = await import("node:fs/promises");
		expect(
			await readdir(join(tmp.path, "memory", "agent", "episodes")).catch(
				() => [],
			),
		).toEqual([]);
	});

	test("supports domainless instructions with an empty resolver and fails missing resource inputs clearly", async () => {
		const resolver = new DomainResolver(new DomainRegistry([]));
		const assembled = await buildSessionParams({
			def: definition(),
			cwd: tmp.path,
			resolver,
			loadConfig: async () => ({}),
		});
		expect(extractAgentIdFromSystemPrompt(assembled.promptContent)).toBe(
			"researcher",
		);
		await expect(
			params(definition({ capabilities: ["missing"] })),
		).rejects.toThrow("domainsDir is required");
		await expect(
			params(definition({ instructions: undefined })),
		).rejects.toThrow("domainsDir is required");
	});

	test.each([
		{ required: true, owners: [] },
		{ required: true, owners: ["/wrong"] },
		{
			required: true,
			owners: ["<inline:cosmonauts-knowledge-surface>", "/wrong"],
		},
		{ required: false, owners: ["/wrong"] },
	])("rejects missing or conflicting recall ownership: %j", ({
		required,
		owners,
	}) => {
		const loader = {
			getExtensions: () => ({
				extensions: owners.map((path) => ({
					path,
					tools: new Map([["recall", {}]]),
				})),
			}),
		} as unknown as DefaultResourceLoader;
		expect(() => assertEnabledRecallOwner(loader, required)).toThrow("recall");
	});

	test("defaults knowledge on and privileged groups off, honoring explicit opt-out", () => {
		expect(resolveMemoryGrants(undefined)).toEqual({
			knowledge: true,
			authored: false,
			proposals: false,
			architecture: false,
			episodes: false,
		});
		expect(
			resolveMemoryGrants({
				knowledge: false,
				authored: true,
				proposals: true,
				architecture: true,
				episodes: true,
			}),
		).toEqual({
			knowledge: false,
			authored: true,
			proposals: true,
			architecture: true,
			episodes: true,
		});
	});

	test.each([
		false,
		true,
	])("authorizes renamed authored/architecture consumers by grant, gate=%s", async (enabled) => {
		await seedKnowledge("Declared permission");
		const assembled = await params(
			definition({
				memory: { knowledge: false, authored: true, architecture: true },
			}),
			enabled,
		);
		const pi = await install(assembled);
		expect(pi.tools.has("architecture_map_read")).toBe(true);
		expect(
			(await pi.callTool("remember", {
				content: "Denied first",
				scope: "project",
			})) as object,
		).toMatchObject({ details: { status: "unauthorized" } });
		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: assembled.promptContent },
			{ cwd: tmp.path },
		);
		const saved = await pi.callTool("remember", {
			content: "Declared permission",
			title: "Consumer note",
			scope: "project",
		});
		expect(saved).toMatchObject({ details: { status: "saved" } });
		const recalled = await pi.callTool("recall", {
			query: "Declared permission",
		});
		expect(JSON.stringify(recalled)).not.toContain(
			"KNOWLEDGE_METADATA_SENTINEL",
		);
		const context = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: assembled.promptContent },
			{ cwd: tmp.path },
		);
		if (enabled) expect(JSON.stringify(context)).toContain("Consumer note");
		expect(await pi.callTool("architecture_map_read", {})).not.toMatchObject({
			details: { status: "scope-ineligible" },
		});
		expect(JSON.stringify(recalled)).toContain("Declared permission");
	});

	test("does not enable memory by privileged identity or old wrapper spelling", async () => {
		const assembled = await params(
			definition({
				id: "cosmo",
				domain: "main",
				extensions: ["agent-memory", "architecture-memory"],
				memory: { knowledge: false },
			}),
		);
		const pi = await install(assembled);
		expect([...pi.tools.keys()]).toEqual([]);
		const raw = createMockPi({ cwd: tmp.path });
		createAgentMemoryExtension()(raw as never);
		createArchitectureMemoryExtension()(raw as never);
		await raw.fireEvent(
			"before_agent_start",
			{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->" },
			{ cwd: tmp.path },
		);
		expect(
			await raw.callTool("remember", { content: "No grant" }),
		).toMatchObject({
			details: { status: "unauthorized", authorizedAgent: null },
		});
		expect(await raw.callTool("architecture_map_read", {})).toMatchObject({
			details: { status: "scope-ineligible" },
		});
	});

	test("borrows resources without borrowing identity or internal skill visibility", async () => {
		const resolver = new DomainResolver(
			new DomainRegistry([
				{
					manifest: {
						id: "borrowed",
						description: "Resources",
						internal: { skills: ["secret"] },
					},
					portable: true,
					agents: new Map(),
					capabilities: new Set(),
					prompts: new Set(),
					skills: new Set(["secret", "public"]),
					extensions: new Set(),
					chains: [],
					provenance: [],
					rootDirs: [],
				},
			]),
		);
		const assembled = await buildSessionParams({
			def: definition({ resourceDomain: "borrowed", skills: ["*"] }),
			cwd: tmp.path,
			resolver,
			loadConfig: async () => ({}),
		});
		expect(extractAgentIdFromSystemPrompt(assembled.promptContent)).toBe(
			"researcher",
		);
		const result = assembled.skillsOverride?.({
			skills: [{ name: "secret" }, { name: "public" }],
			diagnostics: [],
		} as never);
		expect(result?.skills.map((skill) => skill.name)).toEqual(["public"]);
		const owner = await buildSessionParams({
			def: definition({ domain: "borrowed", skills: ["*"] }),
			cwd: tmp.path,
			resolver,
			loadConfig: async () => ({}),
		});
		const ownedSkills = owner.skillsOverride?.({
			skills: [{ name: "secret" }, { name: "public" }],
			diagnostics: [],
		} as never);
		expect(ownedSkills?.skills.map((skill) => skill.name)).toEqual([
			"secret",
			"public",
		]);
	});

	test.each([
		false,
		true,
	])("knowledge opt-out controls both recall ownership and index reads (%s)", async (knowledge) => {
		await seedKnowledge();
		const assembled = await params(definition({ memory: { knowledge } }));
		expect(assembled.recallEnabled).toBe(knowledge);
		const pi = await install(assembled);
		expect(pi.tools.has("recall")).toBe(knowledge);
		const context = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: assembled.promptContent },
			{ cwd: tmp.path },
		);
		if (knowledge) {
			expect(JSON.stringify(context)).toContain("KNOWLEDGE_METADATA_SENTINEL");
			expect(
				await pi.callTool("recall", { query: "KNOWLEDGE_METADATA_SENTINEL" }),
			).toMatchObject({
				details: {
					records: expect.arrayContaining([
						expect.objectContaining({ title: "KNOWLEDGE_METADATA_SENTINEL" }),
					]),
				},
			});
		} else expect(context).toBeUndefined();
		const loader = new DefaultResourceLoader({
			cwd: tmp.path,
			agentDir: join(tmp.path, "pi"),
			noExtensions: true,
			noSkills: true,
			extensionFactories: assembled.extensionFactories,
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		});
		await loader.reload();
		expect(() =>
			assertEnabledRecallOwner(loader, assembled.recallEnabled),
		).not.toThrow();
	});

	test("a declared proposal writer keeps the canonical identity derivation", async () => {
		const assembled = await params(
			definition({ id: "archive/writer", memory: { proposals: true } }),
		);
		const pi = await install(assembled);
		const request = {
			planSlug: "consumer",
			type: "decision" as const,
			title: "Keep declarations explicit",
			description: "Consumers supply grants.",
			content: "The host declares memory permissions.",
			tags: ["library"],
			source: "missions/plans/consumer/plan.md",
			sourceDate: "2026-11-07T00:00:00.000Z",
		};
		const expected = deriveKnowledgeProposalIdentity({
			...request,
			writer: "archive/writer",
		});
		const result = (await pi.callTool("propose_knowledge", request)) as {
			details: { status: string; record: { writer: string; resource: string } };
		};
		expect(result.details).toMatchObject({
			status: "written",
			record: { writer: "archive/writer", resource: expected.resource },
		});
	});

	test.each([
		{ provider: "tasks", grant: false },
		{ provider: "tasks", grant: true },
		{ provider: "plans", grant: false },
		{ provider: "plans", grant: true },
	])("captures $provider episodes only with the declared grant ($grant)", async ({
		provider,
		grant,
	}) => {
		await mkdir(join(tmp.path, ".cosmonauts"));
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
		);
		const assembled = await params(
			definition({ extensions: [provider], memory: { episodes: grant } }),
			false,
		);
		const pi = await install(assembled);
		await pi.callTool(provider === "tasks" ? "task_create" : "plan_create", {
			slug: "declared-episode",
			title: "Declared episode",
			description: "Test",
		});
		const { readdir } = await import("node:fs/promises");
		const records = await readdir(
			join(tmp.path, "memory", "agent", "episodes"),
		).catch(() => []);
		expect(records.length > 0).toBe(grant);
		if (grant)
			expect(
				await readFile(
					join(tmp.path, "memory", "agent", "episodes", records[0] as string),
					"utf8",
				),
			).toContain("researcher");
	});
});
