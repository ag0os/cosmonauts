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
} from "../../lib/architecture-map/index.ts";
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
	test("injects one non-accumulating architecture index context with current stale and missing freshness banners @cosmo-behavior plan:code-structure-map#B-012", async () => {
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

	test("architecture_map_read returns the full index by default and reads module shards by resource @cosmo-behavior plan:code-structure-map#B-013", async () => {
		await writeArchitectureMap(tmp.path);
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
			resource: "lib/agents",
		})) as ToolResult;
		expect(resultText(shard)).toContain("# lib/agents");
		expect(shard.details).toMatchObject({
			resource: "lib/agents",
			path: "memory/architecture/modules/lib/agents.md",
		});
	});

	test("architecture_map_read lists available modules for unknown resources and rejects traversal @cosmo-behavior plan:code-structure-map#B-013", async () => {
		await writeArchitectureMap(tmp.path);
		const pi = await enabledPi(tmp.path);

		const unknown = (await pi.callTool("architecture_map_read", {
			resource: "lib/missing",
		})) as ToolResult;
		expect(resultText(unknown)).toContain(
			"Unknown architecture map module: lib/missing",
		);
		expect(resultText(unknown)).toContain(
			"Available modules: lib/agents, lib/tasks",
		);

		const traversal = (await pi.callTool("architecture_map_read", {
			resource: "../outside",
		})) as ToolResult;
		expect(resultText(traversal)).toContain(
			"Rejected unsafe architecture map resource",
		);
	});

	test("oversized index injection respects injectionMaxBytes and tells agents to use architecture_map_read @cosmo-behavior plan:code-structure-map#B-019", async () => {
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
		expect(pi.tools.has("architecture_map_read")).toBe(false);
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
}): Parameters<typeof createArchitectureMemoryExtension>[0] {
	return {
		loadConfig: async () => options.config ?? BASE_CONFIG,
		analyzer: { getConfigInputs: async () => [] },
		checkFreshness: async () =>
			options.freshness ?? { kind: "current", hash: "stat-current" },
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
		"---\ntype: code-structure-module\nresource: modules/lib/agents.md\n---\n\n# lib/agents\n",
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
