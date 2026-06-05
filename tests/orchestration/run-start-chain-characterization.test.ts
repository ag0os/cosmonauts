import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import type { SpawnConfig } from "../../lib/orchestration/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	dispose: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

const temp = useTempDir("run-start-chain-characterization-");
const registry = new AgentRegistry([
	agent("planner"),
	agent("reviewer"),
	agent("quality-manager"),
]);

describe("runStart durable chain characterization", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-002
	test("preserves durable chain run files and ChainResult through runStart", async () => {
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => {
			config.onEvent?.({
				type: "turn_start",
				sessionId: `session-${config.role}`,
			});
			return {
				success: true,
				sessionId: `session-${config.role}`,
				messages: [
					{
						role: "assistant",
						content: [
							{
								type: "text",
								text: `${config.role} durable summary`,
							},
						],
					},
				],
			};
		});
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: spawnerMocks.dispose,
		});
		const projectRoot = join(temp.path, "project");

		const result = await runDurableChain({
			steps: parseChain("planner -> reviewer -> quality-manager", registry),
			projectRoot,
			registry,
		});

		expect(result).toMatchObject({
			success: true,
			errors: [],
			stageResults: [
				expect.objectContaining({
					stage: { name: "planner", loop: false },
					summary: "planner durable summary",
				}),
				expect.objectContaining({
					stage: { name: "reviewer", loop: false },
					summary: "reviewer durable summary",
				}),
				expect.objectContaining({
					stage: { name: "quality-manager", loop: false },
					summary: "quality-manager durable summary",
				}),
			],
		});

		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		const runs = await store.listRecentRuns({ scope: "chain", limit: 1 });
		expect(runs).toHaveLength(1);
		const run = runs[0];
		if (!run) {
			throw new Error("Expected a persisted chain run.");
		}
		expect(run.metadata).toEqual({ source: "chain_run", stageCount: 3 });
		const graph = await store.readRunGraph(run);
		const steps = await store.listStepRecords(run);
		const events = await store.readEvents(run);
		expect(graph.graph.steps.map((step) => step.id)).toEqual([
			"chain-1-planner",
			"chain-2-reviewer",
			"chain-3-quality-manager",
		]);
		expect(steps.map((step) => [step.id, step.status])).toEqual([
			["chain-1-planner", "completed"],
			["chain-2-reviewer", "completed"],
			["chain-3-quality-manager", "completed"],
		]);
		expect(events.events.at(0)?.event).toEqual({
			type: "run_started",
			runId: run.runId,
		});
		expect(events.events.map((stored) => stored.event.type)).toEqual(
			expect.arrayContaining([
				"step_ready",
				"step_started",
				"step_tool_activity",
				"step_completed",
				"run_completed",
			]),
		);
		expect(spawnerMocks.dispose).toHaveBeenCalledTimes(1);
	});
});

function agent(id: string): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain: "coding",
	};
}
