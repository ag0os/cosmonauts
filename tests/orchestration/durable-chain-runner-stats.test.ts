/**
 * Tests for per-stage stats on the durable chain path (durable-chain-runner.ts):
 * spawn stats are persisted in the run's event log and come back as stage
 * results, stage_stats events, and ChainStats.
 */

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
const registry = new AgentRegistry([agent("planner"), agent("reviewer")]);
const STAGE_WALL_MS = 90_000;

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

async function runPlannerThenReviewer(
	events: ChainEvent[] = [],
): Promise<ChainResult> {
	return runDurableChain({
		steps: parseChain("planner -> reviewer", registry),
		projectRoot: join(temp.path, "project"),
		registry,
		onEvent: (event) => events.push(event),
	});
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
