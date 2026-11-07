import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	REVIEW_REVISION_REPORT_TOKEN,
} from "../../lib/orchestration/review-revision.ts";
import type {
	ChainConfig,
	ChainEvent,
	ChainStep,
	SpawnConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const host = vi.hoisted(() => ({
	spawn: vi.fn<(config: SpawnConfig) => Promise<SpawnResult>>(),
	dispose: vi.fn(),
}));
vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => host,
}));
const tmp = useTempDir("neutral-chain-");
const actors = ["scribe", "critic", "translator", "dispatcher"];
const registry = new AgentRegistry(
	actors.map(
		(id) =>
			({
				id,
				domain: "studio",
				description: id,
				model: "test/model",
				capabilities: [],
				tools: "none",
				extensions: [],
				skills: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
				memory: {},
			}) satisfies AgentDefinition,
	),
);
const runners = [
	{ name: "inline", run: runChain },
	{ name: "durable", run: runDurableChain },
];

beforeEach(() => {
	vi.clearAllMocks();
});
async function fixture(projectRoot: string): Promise<void> {
	const directory = join(projectRoot, "missions", "plans", "sample");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "plan.md"),
		"---\ntitle: Consumer plan\nstatus: active\n---\n\n## Decision Log\n",
	);
	await writeFile(
		join(directory, "review.md"),
		"# Plan Review\n\n## Findings\n\n## Assessment\n\nComplete.\n",
	);
}
function stages(producers: readonly string[]): ChainStep[] {
	return [
		{ name: "scribe", stageId: "author/draft" },
		{
			name: "critic",
			stageId: "critique",
			purpose: { kind: "plan-review", targetStageIds: ["author/draft"] },
		},
		{
			name: "translator",
			stageId: "revise/final",
			purpose: { kind: "plan-revision", targetStageIds: ["author/draft"] },
		},
		{
			name: "dispatcher",
			stageId: "dispatch",
			requiresPlanReviewTarget: true,
			reviewTarget: {
				source: "active-plan-review",
				producerStageIds: producers,
			},
		},
	];
}
function configureSpawn(): void {
	host.spawn.mockImplementation(async (config) => {
		const text =
			config.role === "critic"
				? `${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"sample","reviewRound":1}`
				: config.role === "translator"
					? `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"sample","reviewRound":1,"status":"addressed"}`
					: "complete";
		return {
			success: true,
			sessionId: `session-${config.role}`,
			messages: [{ role: "assistant", content: [{ type: "text", text }] }],
		};
	});
}
function options(projectRoot: string, steps: ChainStep[]): ChainConfig {
	return {
		projectRoot,
		registry,
		domainContext: "studio",
		planSlug: "sample",
		steps,
		chainAdapter: {
			buildStagePrompt: ({ stage }) => `Instruction for ${stage.stageId}.`,
		},
	};
}
describe.each(runners)("neutral $name execution", ({ name, run }) => {
	test("uses explicit semantics and mapped producer identities for arbitrary actors", async () => {
		const root = join(tmp.path, name);
		await fixture(root);
		configureSpawn();
		const result = await run(options(root, stages(["revise/final"])));
		expect(result.success, JSON.stringify(result.errors)).toBe(true);
		expect(host.spawn.mock.calls.map(([config]) => config.role)).toEqual(
			actors,
		);
		expect(host.spawn.mock.calls[2]?.[0].prompt).toContain(
			'Bound plan-review target: {"planSlug":"sample","reviewRound":1}.',
		);
		expect(result.stageResults.map((result) => result.stage.stageId)).toEqual([
			"author/draft",
			"critique",
			"revise/final",
			"dispatch",
		]);
		if (result.run) {
			const store = new FileRunStore({
				rootDir: join(root, "missions", "sessions"),
			});
			const { graph } = await store.readRunGraph(result.run);
			expect(graph.steps.map((step) => step.id)).toEqual([
				"chain-1-scribe",
				"chain-2-critic",
				"chain-3-translator",
				"chain-4-dispatcher",
			]);
			expect(graph.steps[3]?.backend.options?.reviewProducerStepIds).toEqual([
				"chain-3-translator",
			]);
			expect(graph.steps[3]?.backend.options?.stage).toMatchObject({
				reviewTarget: { producerStageIds: ["revise/final"] },
				expectedPlanSlug: "sample",
			});
		}
	});
	test("requires addressed evidence from an eligible declared occurrence", async () => {
		const root = join(tmp.path, name);
		await fixture(root);
		configureSpawn();
		const events: ChainEvent[] = [];
		const result = await run({
			...options(root, stages([])),
			onEvent: (event) => events.push(event),
		});
		expect(result.success).toBe(false);
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "unaddressed_review_round",
					block: expect.objectContaining({
						reason: "mismatched-addressed-evidence",
					}),
				}),
			]),
		);
		expect(host.spawn.mock.calls.map(([config]) => config.role)).not.toContain(
			"dispatcher",
		);
	});
	test("terminal executors receive raw overrides and retain their stats in either runner", async () => {
		const root = join(tmp.path, name);
		await mkdir(root, { recursive: true });
		const stats = {
			tokens: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, total: 5 },
			cost: 0.25,
			durationMs: 7,
			turns: 1,
			toolCalls: 0,
		};
		const gate = vi.fn().mockResolvedValue({
			success: true,
			iterations: 1,
			durationMs: 7,
			summary: "approved",
			stats,
		});
		const result = await run({
			...options(root, [
				{
					name: "scribe",
					stageId: "approval/final",
					terminalGate: "approval",
					prompt: "Operator note",
				},
			]),
			chainAdapter: {
				buildStagePrompt: () => "Built instruction",
				terminalGates: { approval: gate },
			},
		});
		expect(result.success).toBe(true);
		expect(gate).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Operator note",
				stage: expect.objectContaining({ instruction: "Built instruction" }),
			}),
		);
		expect(result.stageResults[0]?.stats).toEqual(stats);
		expect(result.stats).toMatchObject({ totalCost: 0.25, totalTokens: 5 });
		expect(host.spawn).not.toHaveBeenCalled();
	});
	test.each([
		false,
		true,
	])("chain-owned capture is explicitly %s without an actor episode grant", async (episodes) => {
		const root = join(tmp.path, name);
		await mkdir(join(root, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(root, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
		);
		configureSpawn();
		const result = await run({
			...options(root, [{ name: "scribe" }]),
			episodes,
		});
		expect(result.success).toBe(true);
		const records = (
			await createMarkdownMemoryStore({ projectRoot: root }).retrieve(
				{ projectRoot: root, scopes: ["project"] },
				{ text: "", recordTypes: ["episode"] },
			)
		).records;
		expect(records).toHaveLength(episodes ? 2 : 0);
		for (const record of records) expect(record.source).toBe("studio/scribe");
		expect(registry.get("studio/scribe")?.memory?.episodes).toBeUndefined();
	});
});
