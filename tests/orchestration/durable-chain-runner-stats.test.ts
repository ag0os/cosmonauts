import { withCodingChain } from "../helpers/coding-chain.ts";
/**
 * Tests for per-stage stats on the durable chain path (durable-chain-runner.ts):
 * spawn stats are persisted in the run's event log and come back as stage
 * results, stage_stats events, and ChainStats.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import type {
	ChainEvent,
	ChainResult,
	SpawnConfig,
	SpawnResult,
	SpawnStats,
} from "../../lib/orchestration/types.ts";
import { useTempDir } from "../helpers/fs.ts";

// The durable runner builds its spawner internally; replace it so stages run
// without Pi and report deterministic stats.
const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

const temp = useTempDir("durable-chain-runner-stats-");
const registry = new AgentRegistry([
	agent("planner"),
	agent("plan-reviewer"),
	agent("reviewer"),
	agent("task-manager"),
]);
// Differs from every sum of the mocked spawn durations, so a total built from
// stage wall time cannot pass for one built from agent time.
const STAGE_WALL_MS = 100_000;

function statsFor(role: string): SpawnStats {
	const seed = role === "planner" ? 1 : 2;
	return {
		tokens: {
			input: seed * 1000,
			output: seed * 100,
			cacheRead: seed * 5000,
			cacheWrite: seed * 50,
			total: seed * 6150,
		},
		cost: seed * 0.1,
		durationMs: seed * 30_000,
		turns: seed,
		toolCalls: seed * 4,
	};
}

function succeedWithStats(config: SpawnConfig): SpawnResult {
	vi.setSystemTime(Date.now() + STAGE_WALL_MS);
	return {
		success: true,
		sessionId: `session-${config.role}`,
		messages: [
			{ role: "assistant", content: [{ type: "text", text: "done" }] },
		],
		stats: statsFor(config.role),
	};
}

async function runExpression(
	expression: string,
	options: { planSlug?: string } = {},
): Promise<ChainResult> {
	return runDurableChain(
		withCodingChain({
			steps: parseChain(expression),
			projectRoot: join(temp.path, "project"),
			registry,
			...options,
		}),
	);
}

async function writePlanFixture(planSlug: string): Promise<void> {
	const planDirectory = join(
		temp.path,
		"project",
		"missions",
		"plans",
		planSlug,
	);
	await mkdir(planDirectory, { recursive: true });
	await writeFile(
		join(planDirectory, "plan.md"),
		"---\ntitle: Stats review\nstatus: active\n---\n\n## Decision Log\n",
		"utf-8",
	);
	await writeFile(
		join(planDirectory, "review.md"),
		"# Plan Review\n\n## Findings\n\n## Assessment\n\nComplete.\n",
		"utf-8",
	);
}

async function runPlannerThenReviewer(
	events: ChainEvent[] = [],
): Promise<ChainResult> {
	return runDurableChain(
		withCodingChain({
			steps: parseChain("planner -> reviewer"),
			projectRoot: join(temp.path, "project"),
			registry,
			onEvent: (event) => events.push(event),
		}),
	);
}

describe("runDurableChain stage stats", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) =>
			succeedWithStats(config),
		);
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: vi.fn(),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test.each([
		[undefined, { kind: "default" }],
		[
			{ kind: "plan-review", targetStageIds: ["author", 42] },
			{ kind: "plan-review", targetStageIds: ["author"] },
		],
		[
			{ kind: "plan-revision", targetStageIds: ["author", false] },
			{ kind: "plan-revision", targetStageIds: ["author"] },
		],
		[
			{ kind: "revision", reviewKind: "plan" },
			{ kind: "plan-revision", targetStageIds: [] },
		],
		[{ kind: "revision", reviewKind: "code" }, { kind: "default" }],
		[{ kind: "unknown" }, { kind: "default" }],
	])("projects stage purpose %j and sanitizes persisted selectors without reexecution", async (purpose, expected) => {
		let projecting = false;
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: () => {
				projecting = true;
			},
		});
		const original = FileRunStore.prototype.readRunGraph;
		const read = vi
			.spyOn(FileRunStore.prototype, "readRunGraph")
			.mockImplementation(async function (this: FileRunStore, ref) {
				const persisted = await original.call(this, ref);
				if (!projecting) return persisted;
				return {
					...persisted,
					graph: {
						...persisted.graph,
						steps: persisted.graph.steps.map((step, index) => ({
							...step,
							backend: {
								...step.backend,
								options: {
									...step.backend.options,
									stage: {
										name: index === 0 ? "planner" : "reviewer",
										loop: false,
										purpose,
										requiresPlanReviewTarget: index === 0,
										reviewTarget: {
											source: "active-plan-review",
											producerStageIds: ["producer", 17],
										},
									},
								},
							},
						})),
					},
				};
			});
		try {
			const result = await runPlannerThenReviewer();
			expect(result.success).toBe(true);
			expect(result.stageResults.map((r) => r.stage)).toMatchObject(
				[true, false].map((requiresPlanReviewTarget) => ({
					purpose: expected,
					requiresPlanReviewTarget,
					completionPolicy: { kind: "once" },
					reviewTarget: {
						source: "active-plan-review",
						producerStageIds: ["producer"],
					},
				})),
			);
			expect(spawnerMocks.spawn).toHaveBeenCalledTimes(2);
		} finally {
			read.mockRestore();
		}
	});

	test("projects completed legacy graphs without new stage fields and accepts old purposes", async () => {
		let projection = false;
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: () => {
				projection = true;
			},
		});
		const readGraph = FileRunStore.prototype.readRunGraph;
		const read = vi
			.spyOn(FileRunStore.prototype, "readRunGraph")
			.mockImplementation(async function (this: FileRunStore, ref) {
				const persisted = await readGraph.call(this, ref);
				if (!projection) return persisted;
				return {
					...persisted,
					graph: {
						...persisted.graph,
						steps: persisted.graph.steps.map((step, index) => ({
							...step,
							backend: {
								...step.backend,
								options: {
									...step.backend.options,
									stage: {
										name: index === 0 ? "planner" : "reviewer",
										loop: false,
									},
									purpose:
										index === 0
											? undefined
											: {
													kind: "revision",
													reviewKind: "plan",
													authorIdentity: "planner",
												},
									topologyIndex: undefined,
									requiresPlanReviewTarget: undefined,
									expectedPlanSlug: undefined,
								},
							},
						})),
					},
				};
			});
		try {
			const result = await runPlannerThenReviewer();
			expect(result.success).toBe(true);
			expect(
				result.stageResults.map(({ stage, success }) => ({ stage, success })),
			).toMatchObject([
				{
					stage: { name: "planner", purpose: { kind: "default" } },
					success: true,
				},
				{
					stage: { name: "reviewer", purpose: { kind: "default" } },
					success: true,
				},
			]);
			expect(spawnerMocks.spawn).toHaveBeenCalledTimes(2);
		} finally {
			read.mockRestore();
		}
	});

	test("stage results carry the spawn stats and the step wall time", async () => {
		const result = await runPlannerThenReviewer();

		expect(
			result.stageResults.map((stage) => [
				stage.stage.name,
				stage.durationMs,
				stage.stats,
			]),
		).toEqual([
			["planner", STAGE_WALL_MS, statsFor("planner")],
			["reviewer", STAGE_WALL_MS, statsFor("reviewer")],
		]);
	});

	test("result carries ChainStats totals across stages", async () => {
		const result = await runPlannerThenReviewer();

		expect(result.stats).toEqual({
			stages: [
				{ stageName: "planner", iterations: 1, stats: statsFor("planner") },
				{ stageName: "reviewer", iterations: 1, stats: statsFor("reviewer") },
			],
			totalCost: expect.closeTo(0.3, 10),
			totalTokens: 18_450,
			totalDurationMs: 90_000,
		});
	});

	test("emits stage_stats for every stage before its stage_end", async () => {
		const events: ChainEvent[] = [];
		await runPlannerThenReviewer(events);

		const stageEvents = events.flatMap((event) =>
			event.type === "stage_stats" || event.type === "stage_end"
				? [[event.type, event.stage.name]]
				: [],
		);
		expect(stageEvents).toEqual([
			["stage_stats", "planner"],
			["stage_end", "planner"],
			["stage_stats", "reviewer"],
			["stage_end", "reviewer"],
		]);
	});

	test("persists each stage's stats in the run event log", async () => {
		const result = await runPlannerThenReviewer();
		const store = new FileRunStore({
			rootDir: join(temp.path, "project", "missions", "sessions"),
		});
		if (!result.run) throw new Error("Expected a durable run identity.");

		const { events } = await store.readEvents(result.run);
		const persisted = events.flatMap((stored) =>
			stored.event.type === "step_tool_activity" &&
			(stored.event.details as { kind?: string }).kind === "chain_stage_stats"
				? [[stored.event.stepId, stored.event.details]]
				: [],
		);
		expect(persisted).toEqual([
			[
				"chain-1-planner",
				{
					source: "chain",
					kind: "chain_stage_stats",
					role: "planner",
					stats: statsFor("planner"),
				},
			],
			[
				"chain-2-reviewer",
				{
					source: "chain",
					kind: "chain_stage_stats",
					role: "reviewer",
					stats: statsFor("reviewer"),
				},
			],
		]);
	});

	test("loads stats whose Pi token object carries an extra field", async () => {
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => {
			const result = succeedWithStats(config);
			const stats = result.stats as SpawnStats;
			return {
				...result,
				stats: { ...stats, tokens: { ...stats.tokens, reasoning: 5 } },
			};
		});

		const result = await runPlannerThenReviewer();

		expect(result.stageResults.map((stage) => stage.stats)).toEqual([
			statsFor("planner"),
			statsFor("reviewer"),
		]);
	});

	test("keeps and counts the stats of a stage blocked after its spawn", async () => {
		await writePlanFixture("stats-review");
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => ({
			...succeedWithStats(config),
			...(config.role === "plan-reviewer" && {
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "review saved without a report" }],
					},
				],
			}),
		}));

		const result = await runExpression(
			"planner -> plan-reviewer -> task-manager",
			{
				planSlug: "stats-review",
			},
		);

		expect(
			result.stageResults.map((stage) => [
				stage.stage.name,
				stage.success,
				stage.stats,
			]),
		).toEqual([
			["planner", true, statsFor("planner")],
			["plan-reviewer", false, statsFor("plan-reviewer")],
		]);
		expect(result.stats?.totalTokens).toBe(18_450);
	});

	test("keeps one stats entry per fan-out member sharing a stage name", async () => {
		const result = await runExpression("reviewer[3]");

		expect(result.stats?.stages).toEqual([
			{ stageName: "reviewer", iterations: 1, stats: statsFor("reviewer") },
			{ stageName: "reviewer", iterations: 1, stats: statsFor("reviewer") },
			{ stageName: "reviewer", iterations: 1, stats: statsFor("reviewer") },
		]);
	});

	test("a malformed stats record leaves the chain successful", async () => {
		vi.spyOn(process.stderr, "write").mockReturnValue(true);
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => ({
			...succeedWithStats(config),
			stats: { ...statsFor(config.role), cost: -1 },
		}));

		const result = await runPlannerThenReviewer();

		expect(result.success).toBe(true);
	});

	test("warns on stderr when it drops a malformed stats record", async () => {
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => ({
			...succeedWithStats(config),
			stats: { ...statsFor(config.role), cost: -1 },
		}));

		await runExpression("planner");

		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Durable chain stage stats evidence is invalid."),
		);
	});

	test("omits stats when the spawner reports none", async () => {
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => {
			const { stats: _omitted, ...rest } = succeedWithStats(config);
			return rest;
		});

		const result = await runPlannerThenReviewer();

		expect(result.stats).toBeUndefined();
		expect(result.stageResults.every((stage) => !stage.stats)).toBe(true);
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
