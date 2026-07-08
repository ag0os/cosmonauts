import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test, vi } from "vitest";
import {
	default as architectureMemoryExtension,
	createArchitectureMemoryExtension,
} from "../../domains/shared/extensions/architecture-memory/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import * as architectureMap from "../../lib/architecture-map/index.ts";
import {
	ARCHITECTURE_MAP_OUTPUT_DIR,
	type ArchitectureMapConfig,
	type ArchitectureMapFreshness,
	type ArchitectureMapMemoryStoreOptions,
} from "../../lib/architecture-map/index.ts";
import type {
	MemoryRetrieveResult,
	MemoryStore,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("architecture-memory-");

const BASE_CONFIG: ArchitectureMapConfig = {
	outputDir: ARCHITECTURE_MAP_OUTPUT_DIR,
	sourceRoots: ["lib"],
	exclude: [],
	injectionMaxBytes: 24_000,
	narrative: {
		enabled: true,
		maxModulesPerRun: 20,
	},
};

describe("architecture-memory extension", () => {
	test("delegates mapped index injection and tool reads through an injectable MemoryStore @cosmo-behavior plan:memory-interface#B-003", async () => {
		await mkdir(join(tmp.path, "memory", "architecture"), { recursive: true });
		const retrieve = vi.fn(
			async (
				_scope: Parameters<MemoryStore["retrieve"]>[0],
				query: Parameters<MemoryStore["retrieve"]>[1],
			): Promise<MemoryRetrieveResult> => ({
				records: [
					{
						type: query.resource
							? "code-structure-module"
							: "code-structure-index",
						scope: "project",
						kind: "semantic",
						title: query.resource ?? "Architecture Map",
						description: "Spy-backed architecture map.",
						resource: query.resource ?? "memory/architecture/index.md",
						tags: [],
						timestamp: "2026-07-08T14:00:00.000Z",
						content: query.resource
							? "Architecture map freshness: current (spy-stat)\n\n# lib/agents"
							: "Architecture map freshness: current (spy-stat)\n\n# Spy Architecture Map",
						path: query.resource
							? join(
									tmp.path,
									"memory",
									"architecture",
									"modules",
									"lib",
									"agents.md",
								)
							: join(tmp.path, "memory", "architecture", "index.md"),
					},
				],
				searchedScopes: ["project"],
				skippedScopes: [],
				warnings: [],
				details: {
					status: "found",
					freshness: { kind: "current", hash: "spy-stat" },
					resource: query.resource ?? "memory/architecture/index.md",
				},
			}),
		);
		const createStore = vi.fn(() => memoryStore({ retrieve }));
		const pi = createMockPi({ cwd: tmp.path });
		createArchitectureMemoryExtension(deps({ createStore }))(pi as never);

		const injected = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
			{ cwd: tmp.path },
		)) as { message: { content: string } };

		expect(injected.message.content).toContain("# Spy Architecture Map");
		expect(injected.message.content).toContain("architecture_map_read");
		expect(retrieve).toHaveBeenCalledWith(
			{ projectRoot: tmp.path, scopes: ["project"] },
			{
				resource: undefined,
				recordTypes: ["code-structure-index", "code-structure-module"],
				limit: 1,
			},
		);

		const shard = (await pi.callTool("architecture_map_read", {
			module: "lib/agents",
		})) as ToolResult;
		expect(resultText(shard)).toContain("# lib/agents");
		expect(retrieve).toHaveBeenLastCalledWith(
			{ projectRoot: tmp.path, scopes: ["project"] },
			{
				resource: "lib/agents",
				recordTypes: ["code-structure-index", "code-structure-module"],
				limit: 1,
			},
		);
		expect(createStore).toHaveBeenCalledTimes(2);
	});

	test("skips absent-directory injection while registered tool returns honest missing-map details @cosmo-behavior plan:memory-interface#B-003", async () => {
		const retrieve = vi.fn(
			async (): Promise<MemoryRetrieveResult> => ({
				records: [],
				searchedScopes: ["project"],
				skippedScopes: [],
				warnings: [],
				details: {
					status: "missing-map",
					freshness: { kind: "missing" },
					resource: "memory/architecture/index.md",
					path: join(tmp.path, "memory", "architecture", "index.md"),
				},
			}),
		);
		const createStore = vi.fn(() => memoryStore({ retrieve }));
		const pi = createMockPi({ cwd: tmp.path });
		createArchitectureMemoryExtension(deps({ createStore }))(pi as never);

		expect(pi.tools.has("architecture_map_read")).toBe(true);
		await expect(
			pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: buildAgentIdentityMarker("coding/worker") },
				{ cwd: tmp.path },
			),
		).resolves.toBeUndefined();
		expect(retrieve).not.toHaveBeenCalled();

		const missing = (await pi.callTool(
			"architecture_map_read",
			{},
		)) as ToolResult;
		expect(resultText(missing)).toContain(
			"Architecture map freshness: missing",
		);
		expect(resultText(missing)).toContain(
			"`memory/architecture/index.md` is missing.",
		);
		expect(missing.details).toMatchObject({
			status: "missing-map",
			resource: "memory/architecture/index.md",
		});
		expect(retrieve).toHaveBeenCalledTimes(1);
	});

	test("injects one non-accumulating architecture index context with current stale and missing freshness banners @cosmo-behavior plan:code-structure-map#B-012 @cosmo-behavior plan:memory-interface#B-003", async () => {
		await writeArchitectureMap(tmp.path);

		for (const freshness of [
			{ kind: "current", hash: "stat-current" },
			{ kind: "stale", oldHash: "stat-old", newHash: "stat-new" },
			{ kind: "missing" },
		] satisfies ArchitectureMapFreshness[]) {
			const pi = createMockPi({ cwd: tmp.path });
			createArchitectureMemoryExtension(deps({ freshness }))(pi as never);

			const result = (await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
				{ cwd: tmp.path },
			)) as { message: { customType: string; content: string } };

			expect(result.message.customType).toBe("architecture-map-context");
			expect(result.message.content).toContain(
				`Architecture map freshness: ${freshness.kind}`,
			);
			expect(result.message.content).toContain("Architecture Map");

			const filtered = (await pi.fireEvent("context", {
				messages: [
					{ customType: "architecture-map-context", content: "old map" },
					{ role: "user", content: "keep me" },
				],
			})) as { messages: unknown[] };
			expect(filtered.messages).toEqual([{ role: "user", content: "keep me" }]);
		}
	});

	test("architecture_map_read returns the full index by default and reads module shards by module without parsing unrelated shards @cosmo-behavior plan:memory-interface#B-004", async () => {
		await writeArchitectureMap(tmp.path);
		await writeFile(
			join(tmp.path, "memory", "architecture", "modules", "lib", "broken.md"),
			"---\nresource: [lib/broken\n---\n\n# broken\n",
			"utf-8",
		);
		const pi = await enabledPi(tmp.path);

		const index = (await pi.callTool(
			"architecture_map_read",
			{},
		)) as ToolResult;
		expect(resultText(index)).toContain("Architecture map freshness: current");
		expect(resultText(index)).toContain("# Architecture Map");
		expect(index.details).toMatchObject({
			resource: "memory/architecture/index.md",
		});

		const shard = (await pi.callTool("architecture_map_read", {
			module: "lib/agents",
		})) as ToolResult;
		expect(resultText(shard)).toContain("# lib/agents");
		expect(shard.details).toMatchObject({
			resource: "lib/agents",
			path: "memory/architecture/modules/lib/agents.md",
		});

		const alias = (await pi.callTool("architecture_map_read", {
			resource: "lib/tasks",
		})) as ToolResult;
		expect(resultText(alias)).toContain("# lib/tasks");
		expect(alias.details).toMatchObject({
			resource: "lib/tasks",
			path: "memory/architecture/modules/lib/tasks.md",
		});

		await writeFile(
			join(tmp.path, "memory", "architecture", "modules", "root.md"),
			"---\ntype: code-structure-module\nresource: .\n---\n\n# root module\n",
			"utf-8",
		);
		const root = (await pi.callTool("architecture_map_read", {
			module: ".",
		})) as ToolResult;
		expect(resultText(root)).toContain("# root module");
		expect(root.details).toMatchObject({
			resource: ".",
			path: "memory/architecture/modules/root.md",
		});
	});

	test("architecture_map_read lists modules from shard frontmatter and rejects unsafe modules @cosmo-behavior plan:memory-interface#B-004", async () => {
		await writeArchitectureMap(
			tmp.path,
			"- `lib/from-index-only` - stale row.",
		);
		await writeFile(
			join(tmp.path, "memory", "architecture", "modules", "lib", "broken.md"),
			"---\nresource: [lib/broken\n---\n\n# broken\n",
			"utf-8",
		);
		const pi = await enabledPi(tmp.path);

		const unknown = (await pi.callTool("architecture_map_read", {
			module: "lib/missing",
		})) as ToolResult;
		expect(resultText(unknown)).toContain(
			"Unknown architecture map module: lib/missing",
		);
		expect(resultText(unknown)).toContain(
			"Available modules: lib/agents, lib/tasks",
		);
		expect(resultText(unknown)).not.toContain("lib/from-index-only");

		const traversal = (await pi.callTool("architecture_map_read", {
			module: "../outside",
		})) as ToolResult;
		expect(resultText(traversal)).toContain(
			"Rejected unsafe architecture map resource",
		);

		const absolute = (await pi.callTool("architecture_map_read", {
			module: "/tmp/outside",
		})) as ToolResult;
		expect(resultText(absolute)).toContain(
			"Rejected unsafe architecture map resource",
		);
	});

	test("oversized index injection respects injectionMaxBytes and tells agents to use architecture_map_read @cosmo-behavior plan:code-structure-map#B-019 @cosmo-behavior plan:memory-interface#B-003", async () => {
		await writeArchitectureMap(
			tmp.path,
			Array.from(
				{ length: 80 },
				(_, index) => `- \`lib/module-${index}\` - ${"large ".repeat(8)}`,
			).join("\n"),
		);
		const injectionMaxBytes = 700;
		const pi = createMockPi({ cwd: tmp.path });
		createArchitectureMemoryExtension(
			deps({
				config: { ...BASE_CONFIG, injectionMaxBytes },
				freshness: { kind: "stale", oldHash: "old-stat", newHash: "new-stat" },
			}),
		)(pi as never);

		const result = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("coding/worker") },
			{ cwd: tmp.path },
		)) as { message: { content: string } };

		expect(
			Buffer.byteLength(result.message.content, "utf-8"),
		).toBeLessThanOrEqual(injectionMaxBytes);
		expect(result.message.content).toContain(
			"Architecture map freshness: stale",
		);
		expect(result.message.content).toContain("Truncated from");
		expect(result.message.content).toContain("architecture_map_read");
		expect(result.message.content).not.toContain("lib/module-79");
	});

	test("only the five consuming coding agents declare architecture-memory", async () => {
		const agentDefinitions = await loadBundledCodingAgents();
		const consumers = agentDefinitions
			.filter((definition) =>
				definition.extensions.includes("architecture-memory"),
			)
			.map((definition) => definition.id)
			.sort();

		expect(consumers).toEqual([
			"coordinator",
			"plan-reviewer",
			"planner",
			"quality-manager",
			"worker",
		]);
	});

	test("auto-loaded extension stays inert for non-consuming agents @cosmo-behavior plan:code-structure-map#B-012", async () => {
		await writeArchitectureMap(tmp.path);
		const pi = createMockPi({ cwd: tmp.path });
		architectureMemoryExtension(pi as never);

		const result = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("coding/reviewer") },
			{ cwd: tmp.path },
		);

		expect(result).toBeUndefined();
		expect(pi.tools.has("architecture_map_read")).toBe(true);
	});

	test("turn-time injection does not invoke content-hash freshness @cosmo-behavior plan:code-structure-map#B-012", async () => {
		await writeArchitectureMap(tmp.path);
		await mkdir(join(tmp.path, "lib"), { recursive: true });
		await writeFile(
			join(tmp.path, "lib", "alpha.ts"),
			"export const alpha = 1;\n",
		);
		const contentHashFreshness = vi.spyOn(
			architectureMap,
			"checkArchitectureMapFreshness",
		);
		const pi = createMockPi({ cwd: tmp.path });
		architectureMemoryExtension(pi as never);

		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
			{ cwd: tmp.path },
		);

		expect(contentHashFreshness).not.toHaveBeenCalled();
		contentHashFreshness.mockRestore();
	});
});

interface ToolResult {
	content: { type: "text"; text: string }[];
	details: unknown;
}

function resultText(result: ToolResult): string {
	return result.content.map((entry) => entry.text).join("\n");
}

function deps(options: {
	config?: ArchitectureMapConfig;
	freshness?: ArchitectureMapFreshness;
	createStore?: (_options: ArchitectureMapMemoryStoreOptions) => MemoryStore;
}): Parameters<typeof createArchitectureMemoryExtension>[0] {
	return {
		loadConfig: async () => options.config ?? BASE_CONFIG,
		analyzer: { getConfigInputs: async () => [] },
		checkFreshness: async () =>
			options.freshness ?? { kind: "current", hash: "stat-current" },
		...(options.createStore && { createStore: options.createStore }),
	};
}

function memoryStore(options: {
	retrieve: MemoryStore["retrieve"];
}): MemoryStore {
	return {
		write: async () => ({
			kind: "unsupported",
			reason: "test store",
		}),
		retrieve: options.retrieve,
		consolidate: async () => ({
			kind: "noop",
			reason:
				"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
		}),
	};
}

async function enabledPi(cwd: string) {
	const pi = createMockPi({ cwd });
	createArchitectureMemoryExtension(deps({}))(pi as never);
	await pi.fireEvent(
		"before_agent_start",
		{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
		{ cwd },
	);
	return pi;
}

async function writeArchitectureMap(
	projectRoot: string,
	moduleInventory = [
		"- `lib/agents` - Agent definitions.",
		"- `lib/tasks` - Task management.",
	].join("\n"),
): Promise<void> {
	await mkdir(join(projectRoot, "memory", "architecture", "modules", "lib"), {
		recursive: true,
	});
	await writeFile(
		join(projectRoot, "memory", "architecture", "index.md"),
		[
			"---",
			"type: code-structure-index",
			"resource: memory/architecture/index.md",
			"statFingerprint: stat-current",
			"---",
			"",
			"# Architecture Map",
			"",
			"## Module Inventory",
			moduleInventory,
			"",
		].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "memory", "architecture", "modules", "lib", "agents.md"),
		"---\ntype: code-structure-module\nresource: lib/agents\n---\n\n# lib/agents\n",
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "memory", "architecture", "modules", "lib", "tasks.md"),
		"---\ntype: code-structure-module\nresource: lib/tasks\n---\n\n# lib/tasks\n",
		"utf-8",
	);
}

async function loadBundledCodingAgents(): Promise<AgentDefinition[]> {
	const agentsDir = fileURLToPath(
		new URL("../../bundled/coding/agents/", import.meta.url),
	);
	const files = (await readdir(agentsDir))
		.filter((file) => file.endsWith(".ts"))
		.sort();
	const definitions: AgentDefinition[] = [];
	for (const file of files) {
		const module = (await import(
			pathToFileURL(join(agentsDir, file)).href
		)) as { default: AgentDefinition };
		definitions.push(module.default);
	}
	return definitions;
}
