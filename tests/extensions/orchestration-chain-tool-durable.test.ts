import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { registerChainTool } from "../../domains/shared/extensions/orchestration/chain-tool.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import type { SpawnConfig } from "../../lib/orchestration/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const chainRunnerMocks = vi.hoisted(() => ({
	runChain: vi.fn(),
}));

const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	dispose: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("../../lib/orchestration/chain-runner.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/orchestration/chain-runner.ts")
		>();
	return {
		...actual,
		runChain: chainRunnerMocks.runChain,
	};
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

const temp = useTempDir("chain-tool-durable-");
const registry = new AgentRegistry([
	agent("planner", false),
	agent("task-manager", false),
	agent("reviewer", false),
	agent("quality-manager", false),
	agent("coordinator", true),
]);

describe("chain_run durable tool routing", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-007
	test("routes loop-free chain_run through the durable graph and loop chains inline", async () => {
		const durableExpressions = [
			{
				expression: "planner -> reviewer -> quality-manager",
				expectedStepCount: 3,
			},
			{
				expression: "planner -> [task-manager, reviewer] -> quality-manager",
				expectedStepCount: 4,
			},
			{
				expression: "planner -> reviewer[2] -> quality-manager",
				expectedStepCount: 4,
			},
		];

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
								text: `${config.role} persisted from durable records`,
							},
						],
					},
				],
				stats: {
					tokens: {
						input: 1,
						output: 2,
						cacheRead: 0,
						cacheWrite: 0,
						total: 3,
					},
					cost: 0.01,
					durationMs: 5,
					turns: 1,
					toolCalls: 0,
				},
			};
		});
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: spawnerMocks.dispose,
		});
		chainRunnerMocks.runChain.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 1,
			errors: [],
		});

		const { pi } = createChainTool(temp.path);
		const progressUpdates: Array<{
			content: Array<{ type: "text"; text: string }>;
			details: { lines: string[] };
		}> = [];

		for (const { expression } of durableExpressions) {
			const result = await callChainTool(
				pi,
				{
					expression,
					prompt: "Use durable scheduling.",
					thinkingLevel: "low",
				},
				(update) => {
					progressUpdates.push(update);
				},
			);

			expect(result.content[0]?.text).toContain("Chain completed");
			expect(result.details.result.success).toBe(true);
			expect(result.details.result.stageResults).toHaveLength(
				durableExpressions.find((item) => item.expression === expression)
					?.expectedStepCount ?? 0,
			);
			expect(
				result.details.result.stageResults.map((stageResult) => ({
					stage: stageResult.stage.name,
					summary: stageResult.summary,
				})),
			).toEqual(
				expect.arrayContaining([
					{
						stage: "planner",
						summary: "planner persisted from durable records",
					},
					{
						stage: "quality-manager",
						summary: "quality-manager persisted from durable records",
					},
				]),
			);
			expect(result.details.lines.at(-1)).toMatch(/^✓ Chain completed/);
		}

		expect(chainRunnerMocks.runChain).not.toHaveBeenCalled();
		expect(spawnerMocks.spawn).toHaveBeenCalledTimes(11);
		expect(progressUpdates.length).toBeGreaterThan(0);
		expect(progressUpdates[0]).toMatchObject({
			content: [{ type: "text", text: expect.any(String) }],
			details: { lines: expect.any(Array) },
		});

		const store = new FileRunStore({
			rootDir: join(temp.path, "missions", "sessions"),
		});
		const persistedRuns = await store.listRecentRuns({
			scope: "chain",
			limit: 10,
		});
		expect(persistedRuns).toHaveLength(3);
		const persistedStepCounts = await Promise.all(
			persistedRuns.map(async (run) => {
				const { graph } = await store.readRunGraph(run);
				const steps = await store.listStepRecords(run);
				return {
					graphSteps: graph.steps.length,
					completedSteps: steps.filter((step) => step.status === "completed")
						.length,
					summaries: steps.map((step) => step.result?.summary),
				};
			}),
		);
		expect(persistedStepCounts.map((run) => run.graphSteps).sort()).toEqual([
			3, 4, 4,
		]);
		expect(persistedStepCounts.map((run) => run.completedSteps).sort()).toEqual(
			[3, 4, 4],
		);
		expect(persistedStepCounts.flatMap((run) => run.summaries)).toContain(
			"reviewer persisted from durable records",
		);

		await callChainTool(pi, { expression: "planner -> coordinator" });
		await callChainTool(pi, {
			expression: "planner -> reviewer",
			completionLabel: "plan:durable-frontend-migration",
		});

		expect(chainRunnerMocks.runChain).toHaveBeenCalledTimes(2);
		expect(chainRunnerMocks.runChain).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				steps: [
					{ name: "planner", loop: false },
					{ name: "coordinator", loop: true },
				],
			}),
		);
		expect(chainRunnerMocks.runChain).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				completionLabel: "plan:durable-frontend-migration",
				steps: [
					{ name: "planner", loop: false },
					{ name: "reviewer", loop: false },
				],
			}),
		);
	});
});

function createChainTool(cwd: string): {
	pi: ReturnType<typeof createMockPi>;
} {
	const pi = createMockPi(cwd);
	registerChainTool(pi as never, async () => runtime());
	return { pi };
}

function createMockPi(cwd: string) {
	const tools = new Map<string, { execute: (...args: unknown[]) => unknown }>();
	return {
		registerTool(def: {
			name: string;
			execute: (...args: unknown[]) => unknown;
		}) {
			tools.set(def.name, def);
		},
		getTool(name: string) {
			return tools.get(name);
		},
		cwd,
	};
}

async function callChainTool(
	pi: ReturnType<typeof createMockPi>,
	params: Record<string, unknown>,
	onUpdate?: (update: {
		content: Array<{ type: "text"; text: string }>;
		details: { lines: string[] };
	}) => void,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: {
		lines: string[];
		result: {
			success: boolean;
			stageResults: Array<{
				stage: { name: string };
				summary?: string;
			}>;
		};
	};
}> {
	const tool = pi.getTool("chain_run");
	if (!tool) {
		throw new Error("chain_run was not registered");
	}
	return (await tool.execute("call-id", params, undefined, onUpdate, {
		cwd: pi.cwd,
		getSystemPrompt: () => "",
		sessionManager: { getSessionId: () => "parent-session" },
	})) as Awaited<ReturnType<typeof callChainTool>>;
}

function runtime(): CosmonautsRuntime {
	return {
		agentRegistry: registry,
		domainContext: "coding",
		projectSkills: ["testing"],
		skillPaths: ["/tmp/skills"],
		domainRegistry: undefined,
		domainResolver: undefined,
		domainsDir: "/tmp/domains",
	} as unknown as CosmonautsRuntime;
}

function agent(id: string, loop: boolean): AgentDefinition {
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
		loop,
		domain: "coding",
	};
}
