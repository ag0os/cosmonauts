import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { summarizeAssistantText } from "../../lib/orchestration/assistant-text.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	parseTerminalReviewReport,
	REVIEW_REVISION_REPORT_TOKEN,
	validatePlanReviewReport,
	validateReviewRevisionReport,
} from "../../lib/orchestration/review-revision.ts";
import {
	appendBoundReviewTarget,
	buildStagePrompt,
	deriveStagePromptPurpose,
} from "../../lib/orchestration/stage-prompts.ts";
import type {
	ChainEvent,
	ChainResult,
	SpawnConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	dispose: vi.fn(),
	spawn: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
	randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

vi.mock("node:crypto", async () => {
	const actual =
		await vi.importActual<typeof import("node:crypto")>("node:crypto");
	return { ...actual, randomUUID: cryptoMocks.randomUUID };
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

const temp = useTempDir("run-start-chain-characterization-");
const registry = new AgentRegistry([
	agent("planner"),
	agent("plan-reviewer"),
	agent("task-manager"),
	agent("reviewer"),
	agent("quality-manager"),
]);

describe("runStart durable chain characterization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cryptoMocks.randomUUID.mockReturnValue(
			"00000000-0000-4000-8000-000000000001",
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-002
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-005
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
		expect(Object.keys(result).sort()).toEqual([
			"errors",
			"run",
			"stageResults",
			"success",
			"totalDurationMs",
		]);

		expect(result).toMatchObject({
			run: {
				runId: expect.stringMatching(/^chain-/),
				scope: "chain",
			},
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
		expect(result.run).toEqual({ runId: run.runId, scope: "chain" });
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
		await expect(stat(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("resolves a reviewer-established target at durable step start after prompt compilation", async () => {
		const projectRoot = join(temp.path, "runtime-bound-target");
		const target = {
			planSlug: "runtime-bound-target",
			reviewRound: 1,
		} as const;
		await writePlanReviewFixture(projectRoot, target.planSlug);
		const steps = parseChain(
			"planner -> plan-reviewer -> planner -> task-manager",
			registry,
		);
		const prompts: string[] = [];
		configureSpawner(async (config) => {
			prompts.push(config.prompt);
			return reviewGateSpawn(config, target.planSlug);
		});

		const result = await runDurableChain({
			steps,
			projectRoot,
			registry,
		});

		expect(result.success).toBe(true);
		expect(prompts).toHaveLength(4);
		expect(prompts[0]).not.toContain("Bound plan-review target:");
		expect(prompts[1]).not.toContain("Bound plan-review target:");
		const revisionStage = steps[2];
		if (!revisionStage || "kind" in revisionStage) {
			throw new Error("Expected a terminal revision stage.");
		}
		const inlinePurposePrompt = buildStagePrompt(revisionStage, {
			completionLabel: undefined,
			purpose: deriveStagePromptPurpose(steps, 2, revisionStage),
		});
		expect(prompts[2]).toBe(
			appendBoundReviewTarget(inlinePurposePrompt, target),
		);
		expect(prompts[3]).toBe(
			appendBoundReviewTarget(
				"Review the plan and create atomic implementation tasks.",
				target,
			),
		);
	});

	// @cosmo-behavior plan:chain-stage-context#B-010
	test("gates durable task decomposition on earlier reviewer-bound addressed activity", async () => {
		const successfulRoot = join(temp.path, "durable-review-gate-success");
		await writePlanReviewFixture(successfulRoot, "durable-review-gate-success");
		const successfulSpawns: string[] = [];
		configureSpawner(async (config) => {
			successfulSpawns.push(config.role);
			return reviewGateSpawn(config, "durable-review-gate-success");
		});

		const successful = await runDurableChain({
			steps: parseChain(
				"planner -> plan-reviewer -> planner -> task-manager",
				registry,
			),
			projectRoot: successfulRoot,
			planSlug: "durable-review-gate-success",
			registry,
		});

		expect(successful.success).toBe(true);
		expect(successfulSpawns).toEqual([
			"planner",
			"plan-reviewer",
			"planner",
			"task-manager",
		]);
		const successfulActivity = await readRunActivity(successfulRoot);
		expect(successfulActivity).toEqual(
			expect.arrayContaining([
				{
					source: "chain",
					kind: "plan_review_target",
					target: {
						planSlug: "durable-review-gate-success",
						reviewRound: 1,
					},
				},
				{
					source: "chain",
					kind: "plan_review_addressed",
					target: {
						planSlug: "durable-review-gate-success",
						reviewRound: 1,
					},
					topologyIndex: 2,
					producerStepId: "chain-3-planner",
					producerRole: "coding/planner",
				},
			]),
		);
		const successfulStore = await latestChainStore(successfulRoot);
		const successfulEvents = (
			await successfulStore.store.readEvents(successfulStore.run)
		).events;
		const targetActivityIndex = successfulEvents.findIndex(
			({ event }) =>
				event.type === "run_activity" &&
				activityKind(event.details) === "plan_review_target",
		);
		const reviewerSuccessIndex = successfulEvents.findIndex(
			({ event }) =>
				event.type === "step_completed" &&
				event.stepId === "chain-2-plan-reviewer",
		);
		const addressedActivityIndex = successfulEvents.findIndex(
			({ event }) =>
				event.type === "run_activity" &&
				activityKind(event.details) === "plan_review_addressed",
		);
		const revisionSuccessIndex = successfulEvents.findIndex(
			({ event }) =>
				event.type === "step_completed" && event.stepId === "chain-3-planner",
		);
		expect(targetActivityIndex).toBeGreaterThan(-1);
		expect(targetActivityIndex).toBeLessThan(reviewerSuccessIndex);
		expect(addressedActivityIndex).toBeGreaterThan(-1);
		expect(addressedActivityIndex).toBeLessThan(revisionSuccessIndex);
		expect(
			successfulEvents.some(
				({ event }) =>
					event.type === "step_tool_activity" &&
					activityKind(event.details)?.startsWith("plan_review") === true,
			),
		).toBe(false);

		for (const [name, expression] of [
			["sequential", "planner -> plan-reviewer -> task-manager"],
			["missing-target", "planner -> [task-manager, plan-reviewer]"],
			["revision-first", "planner -> plan-reviewer -> [planner, task-manager]"],
			["task-first", "planner -> plan-reviewer -> [task-manager, planner]"],
		] as const) {
			const projectRoot = join(temp.path, `durable-review-gate-${name}`);
			const slug = `durable-review-gate-${name}`;
			await writePlanReviewFixture(projectRoot, slug);
			const spawns: string[] = [];
			configureSpawner(async (config) => {
				spawns.push(config.role);
				return reviewGateSpawn(config, slug);
			});

			const result = await runDurableChain({
				steps: parseChain(expression, registry),
				projectRoot,
				planSlug: slug,
				registry,
			});

			expect(result.success, name).toBe(false);
			expect(result.errors[0], name).toMatch(/Plan review target/u);
			expect(spawns, name).not.toContain("task-manager");
			const expectedReason = {
				sequential: "missing-addressed-evidence",
				"missing-target": "missing-review-target",
				"revision-first": "nonpreceding-addressed-evidence",
				"task-first": "missing-addressed-evidence",
			}[name];
			expect(await readRunActivity(projectRoot), name).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						source: "chain",
						kind: "unaddressed_review_round",
						role: "task-manager",
						block: expect.objectContaining({
							reason: expectedReason,
							taskManagerTopologyIndex: name === "missing-target" ? 1 : 2,
						}),
					}),
				]),
			);
			const persisted = await latestChainStore(projectRoot);
			expect(persisted.run.status, name).toBe("blocked");
		}

		for (const unaddressed of ["reviewer", "revision"] as const) {
			const slug = `durable-unaddressed-${unaddressed}`;
			const projectRoot = join(temp.path, slug);
			await writePlanReviewFixture(projectRoot, slug);
			const spawns: string[] = [];
			configureSpawner(async (config) => {
				spawns.push(config.role);
				if (unaddressed === "reviewer" && config.role === "plan-reviewer") {
					return spawnWithText(config, "review saved without a report");
				}
				if (
					unaddressed === "revision" &&
					config.prompt.includes("Revision purpose:")
				) {
					return spawnWithText(
						config,
						`${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"${slug}","reviewRound":1,"status":"unaddressed","reason":"still open"}`,
					);
				}
				return reviewGateSpawn(config, slug);
			});
			const result = await runDurableChain({
				steps: parseChain(
					"planner -> plan-reviewer -> planner -> task-manager",
					registry,
				),
				projectRoot,
				planSlug: slug,
				registry,
			});
			expect(result.success, unaddressed).toBe(false);
			expect(spawns, unaddressed).not.toContain("task-manager");
			const persisted = await latestChainStore(projectRoot);
			const records = await persisted.store.listStepRecords(persisted.run);
			const blocked = records.find((record) => record.status === "blocked");
			expect(blocked?.result, unaddressed).toEqual(
				expect.objectContaining({
					outcome: "blocked",
					nextAction: "wait_for_human",
					summary: expect.stringContaining("Plan review target"),
				}),
			);
			expect(await readRunActivity(projectRoot), unaddressed).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "unaddressed_review_round",
						role: unaddressed === "reviewer" ? "plan-reviewer" : "planner",
					}),
				]),
			);
		}

		for (const negative of [
			{
				name: "wrong-producer-step-id",
				expression: "planner -> plan-reviewer -> task-manager",
				details: {
					source: "chain",
					kind: "plan_review_addressed",
					target: { planSlug: "placeholder", reviewRound: 1 },
					topologyIndex: 0,
					producerStepId: "chain-1-not-the-planner",
					producerRole: "coding/planner",
				},
			},
			{
				name: "wrong-producer-index",
				expression: "planner -> plan-reviewer -> task-manager",
				details: {
					source: "chain",
					kind: "plan_review_addressed",
					target: { planSlug: "placeholder", reviewRound: 1 },
					topologyIndex: 1,
					producerStepId: "chain-1-planner",
					producerRole: "coding/planner",
				},
			},
			{
				name: "wrong-producer-purpose",
				expression: "planner -> plan-reviewer -> task-manager",
				details: {
					source: "chain",
					kind: "plan_review_addressed",
					target: { planSlug: "placeholder", reviewRound: 1 },
					topologyIndex: 0,
					producerStepId: "chain-1-planner",
					producerRole: "coding/planner",
				},
			},
			{
				name: "activity-before-producer-terminal-result",
				expression: "planner -> plan-reviewer -> [task-manager, planner]",
				details: {
					source: "chain",
					kind: "plan_review_addressed",
					target: { planSlug: "placeholder", reviewRound: 1 },
					topologyIndex: 2,
					producerStepId: "chain-3-2-planner",
					producerRole: "coding/planner",
				},
			},
			{
				name: "malformed-addressed-details",
				expression: "planner -> plan-reviewer -> task-manager",
				details: {
					source: "chain",
					kind: "plan_review_addressed",
					target: { planSlug: "placeholder", reviewRound: 1 },
					topologyIndex: 0,
					producerStepId: "chain-1-planner",
				},
			},
		] as const) {
			const projectRoot = join(temp.path, negative.name);
			const slug = negative.name;
			await writePlanReviewFixture(projectRoot, slug);
			const details = {
				...negative.details,
				target: { planSlug: slug, reviewRound: 1 },
			};
			const spawns: string[] = [];
			configureSpawner(async (config) => {
				spawns.push(config.role);
				return reviewGateSpawn(config, slug);
			});

			const result = await runWithActivityAfterTarget({
				projectRoot,
				expression: negative.expression,
				details,
			});

			expect(result.success, negative.name).toBe(false);
			expect(spawns, negative.name).not.toContain("task-manager");
			const activity = await readRunActivity(projectRoot);
			expect(activity, negative.name).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "unaddressed_review_round",
						block: expect.objectContaining({
							reason: "mismatched-addressed-evidence",
						}),
					}),
				]),
			);
			if (negative.name === "activity-before-producer-terminal-result") {
				const store = await latestChainStore(projectRoot);
				const { events } = await store.store.readEvents(store.run);
				const addressedIndex = events.findIndex(
					({ event }) =>
						event.type === "run_activity" &&
						activityKind(event.details) === "plan_review_addressed",
				);
				const producerTerminalIndex = events.findIndex(
					({ event }) =>
						(event.type === "step_completed" ||
							event.type === "step_failed" ||
							event.type === "step_blocked") &&
						event.stepId === "chain-3-2-planner",
				);
				expect(addressedIndex).toBeGreaterThan(-1);
				expect(
					producerTerminalIndex === -1 ||
						addressedIndex < producerTerminalIndex,
				).toBe(true);
			}
		}

		const staleRoot = join(temp.path, "stale-addressed-evidence");
		const staleSlug = "stale-addressed-evidence";
		await writePlanReviewFixture(staleRoot, staleSlug);
		const staleSpawns: string[] = [];
		configureSpawner(async (config) => {
			staleSpawns.push(config.role);
			return reviewGateSpawn(config, staleSlug);
		});
		const stale = await runWithActivityHook({
			projectRoot: staleRoot,
			expression: "planner -> plan-reviewer -> planner -> task-manager",
			activityKind: "plan_review_addressed",
			afterActivity: async () => {
				await writeFile(
					join(staleRoot, "missions", "plans", staleSlug, "review-2.md"),
					"# Plan Review\n\n## Findings\n\n## Assessment\n\nNew round.\n",
					"utf-8",
				);
			},
		});
		expect(stale.success).toBe(false);
		expect(staleSpawns).not.toContain("task-manager");
		expect(await readRunActivity(staleRoot)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unaddressed_review_round",
					block: expect.objectContaining({
						reason: "stale-addressed-evidence",
						latestReviewRound: 2,
					}),
				}),
			]),
		);

		// A loop-free durable step executes once, so it may authorize once.
		// Re-presenting a completed revision step's identity against a target it
		// never addressed satisfies producer correlation on its own, so the spent
		// producer is what blocks it.
		const replayedRoot = join(temp.path, "replayed-addressed-producer");
		const replayedSlug = "replayed-addressed-producer";
		await writePlanReviewFixture(replayedRoot, replayedSlug);
		const replayedSpawns: string[] = [];
		configureSpawner(async (config) => {
			replayedSpawns.push(config.role);
			return reviewGateSpawn(config, replayedSlug);
		});
		const replayed = await runWithActivityHook({
			projectRoot: replayedRoot,
			expression: "planner -> plan-reviewer -> planner -> task-manager",
			activityKind: "plan_review_addressed",
			afterActivity: async ({ store, ref }) => {
				await store.appendEvent(ref, {
					type: "run_activity",
					runId: ref.runId,
					details: {
						source: "chain",
						kind: "plan_review_addressed",
						target: { planSlug: replayedSlug, reviewRound: 1 },
						topologyIndex: 2,
						producerStepId: "chain-3-planner",
						producerRole: "coding/planner",
					},
				});
			},
		});
		expect(replayed.success).toBe(false);
		expect(replayedSpawns).not.toContain("task-manager");
		expect(await readRunActivity(replayedRoot)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unaddressed_review_round",
					block: expect.objectContaining({
						reason: "mismatched-addressed-evidence",
					}),
				}),
			]),
		);
	});

	test("validates a terminal plan-review report from full text before summary truncation", async () => {
		const projectRoot = join(temp.path, "full-review-text");
		const planDirectory = join(
			projectRoot,
			"missions",
			"plans",
			"full-review-text",
		);
		await mkdir(planDirectory, { recursive: true });
		await Promise.all([
			writeFile(
				join(planDirectory, "plan.md"),
				"---\ntitle: Full review text\nstatus: active\n---\n\n## Decision Log\n",
				"utf-8",
			),
			writeFile(
				join(planDirectory, "review.md"),
				"# Plan Review\n\n## Findings\n\n## Assessment\n\nComplete.\n",
				"utf-8",
			),
		]);
		const report = `${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1}`;
		const assistantText = `${"Review evidence. ".repeat(30)}\n${report}\n\n`;

		const validation = await validatePlanReviewReport({
			assistantText,
			projectRoot,
		});
		const summary = summarizeAssistantText(assistantText, "plan-reviewer");

		expect(validation).toEqual({
			status: "accepted",
			target: { planSlug: "full-review-text", reviewRound: 1 },
		});
		expect(summary).not.toContain(report);
		expect(
			parseTerminalReviewReport(
				`Revision complete.\n${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1,"status":"addressed"}\n`,
				"review-revision",
			),
		).toEqual({
			status: "accepted",
			report: {
				kind: "review-revision",
				target: { planSlug: "full-review-text", reviewRound: 1 },
				status: "addressed",
			},
		});
		expect(
			await validateReviewRevisionReport({
				assistantText: `Revision complete.\n${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1,"status":"addressed"}`,
				projectRoot,
				expectedTarget: { planSlug: "full-review-text", reviewRound: 1 },
			}),
		).toEqual({
			status: "accepted",
			target: { planSlug: "full-review-text", reviewRound: 1 },
		});
		expect(
			await validateReviewRevisionReport({
				assistantText: `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1,"status":"unaddressed","reason":"One finding remains."}`,
				projectRoot,
				expectedTarget: { planSlug: "full-review-text", reviewRound: 1 },
			}),
		).toEqual({
			status: "unaddressed",
			block: {
				reason: "revision-reported-unaddressed",
				planSlug: "full-review-text",
				reviewRound: 1,
				reportedReason: "One finding remains.",
			},
		});

		for (const malformed of [
			`${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"../escape","reviewRound":1}`,
			`${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":0}`,
			`${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1.5}`,
			`${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"full-review-text","reviewRound":1,"extra":true}`,
		]) {
			expect(
				await validatePlanReviewReport({
					assistantText: malformed,
					projectRoot,
				}),
			).toEqual({
				status: "unaddressed",
				block: { reason: "malformed-review-report" },
			});
		}
	});

	test("records durable chain episodes with the persisted run id and unchanged reconstruction @cosmo-behavior plan:episodic-log#B-016", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const successRoot = join(temp.path, "episode-success");
		await writeEpisodicConfig(successRoot, true);
		configureSpawner(async (config) => successfulSpawn(config));

		const success = await runDurableChain({
			steps: parseChain("[planner, reviewer] -> quality-manager", registry),
			projectRoot: successRoot,
			registry,
		});
		const successEpisodes = await readProjectChainEpisodes(successRoot);
		expect(successEpisodes).toHaveLength(2);
		expect(success.run?.runId).toMatch(/^chain-/u);
		expect(
			new Set(successEpisodes.map((episode) => episode.subject.id)),
		).toEqual(new Set([success.run?.runId]));
		expect(successEpisodes.map((episode) => episode.outcome).sort()).toEqual([
			"started",
			"succeeded",
		]);
		expect(successEpisodes.map((episode) => episode.source)).toEqual([
			"coding/planner",
			"coding/planner",
		]);

		const successStore = new FileRunStore({
			rootDir: join(successRoot, "missions", "sessions"),
		});
		const successRef = success.run;
		if (!successRef) throw new Error("Expected durable success run identity");
		const [{ graph }, steps, events] = await Promise.all([
			successStore.readRunGraph(successRef),
			successStore.listStepRecords(successRef),
			successStore.readEvents(successRef),
		]);
		expect(graph.steps).toHaveLength(3);
		expect(steps.map((step) => step.status)).toEqual([
			"completed",
			"completed",
			"completed",
		]);
		expect(events.events.at(0)?.event).toEqual({
			type: "run_started",
			runId: successRef.runId,
		});
		expect(events.events.at(-1)?.event).toEqual(
			expect.objectContaining({
				type: "run_completed",
				runId: successRef.runId,
			}),
		);
		expect(success).toMatchObject({
			success: true,
			errors: [],
			stageResults: [
				expect.objectContaining({
					stage: expect.objectContaining({ name: "planner" }),
				}),
				expect.objectContaining({
					stage: expect.objectContaining({ name: "reviewer" }),
				}),
				expect.objectContaining({
					stage: expect.objectContaining({ name: "quality-manager" }),
				}),
			],
		});

		const failureRoot = join(temp.path, "episode-failure");
		await writeEpisodicConfig(failureRoot, true);
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);
		const failure = await runDurableChain({
			steps: parseChain("planner -> reviewer", registry),
			projectRoot: failureRoot,
			registry,
		});
		const failureEpisodes = await readProjectChainEpisodes(failureRoot);
		expect(failure.success).toBe(false);
		expect(failure.errors).toEqual(["review failed"]);
		expect(failureEpisodes).toHaveLength(2);
		expect(
			new Set(failureEpisodes.map((episode) => episode.subject.id)),
		).toEqual(new Set([failure.run?.runId]));
		expect(failureEpisodes.map((episode) => episode.outcome).sort()).toEqual([
			"failed",
			"started",
		]);
		expect(failureEpisodes.map((episode) => episode.source)).toEqual([
			"coding/planner",
			"coding/planner",
		]);

		const captureFailureRoot = join(temp.path, "episode-capture-failure");
		await writeEpisodicConfig(captureFailureRoot, true);
		await writeFile(join(captureFailureRoot, "memory"), "path collision");
		const warnings: unknown[] = [];
		configureSpawner(async (config) => successfulSpawn(config));
		const withCaptureFailure = await runDurableChain({
			steps: parseChain("planner -> reviewer", registry),
			projectRoot: captureFailureRoot,
			registry,
			reportEpisodeWarning: async (warning) => {
				await Promise.resolve();
				warnings.push(warning);
			},
		});
		expect(withCaptureFailure.success).toBe(true);
		expect(withCaptureFailure.stageResults).toHaveLength(2);
		expect(withCaptureFailure.errors).toEqual([]);
		expect(warnings).toHaveLength(2);
		expect(warnings).toEqual([
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
		]);
		const captureStore = new FileRunStore({
			rootDir: join(captureFailureRoot, "missions", "sessions"),
		});
		const captureRef = withCaptureFailure.run;
		if (!captureRef) throw new Error("Expected durable capture-failure run");
		const [captureSteps, captureEvents] = await Promise.all([
			captureStore.listStepRecords(captureRef),
			captureStore.readEvents(captureRef),
		]);
		expect(captureSteps.map((step) => step.status)).toEqual([
			"completed",
			"completed",
		]);
		expect(captureEvents.events.at(-1)?.event.type).toBe("run_completed");
	});

	test("keeps disabled inline and durable chain outputs events and files unchanged @cosmo-behavior plan:episodic-log#B-027", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const projectRoot = join(temp.path, "disabled-parity");
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);

		const absent = await captureDisabledBaselines(projectRoot);
		expect(absent.inline.result.success).toBe(false);
		expect(absent.inline.result.errors).toEqual(["review failed"]);
		expect(absent.inline.events.map((event) => event.type)).toEqual([
			"chain_start",
			"stage_start",
			"agent_spawned",
			"agent_turn",
			"agent_completed",
			"stage_end",
			"stage_start",
			"stage_end",
			"chain_end",
		]);
		expect(absent.durable.result.success).toBe(false);
		expect(absent.durable.result.errors).toEqual(["review failed"]);
		expect(absent.durable.events.at(0)?.type).toBe("chain_start");
		expect(absent.durable.events.at(-1)?.type).toBe("chain_end");
		expect(
			Object.keys(absent.files).some((path) => path.startsWith("memory/")),
		).toBe(false);

		await rm(projectRoot, { recursive: true, force: true });
		await writeEpisodicConfig(projectRoot, false);
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);
		const explicitlyDisabled = await captureDisabledBaselines(
			projectRoot,
			true,
		);

		expect(explicitlyDisabled).toEqual(absent);
		expect(
			Object.keys(explicitlyDisabled.files).some((path) =>
				path.startsWith("memory/"),
			),
		).toBe(false);
	});
});

function configureSpawner(
	spawn: (config: SpawnConfig) => Promise<SpawnResult>,
): void {
	spawnerMocks.spawn.mockImplementation(spawn);
	spawnerMocks.createPiSpawner.mockReturnValue({
		spawn: spawnerMocks.spawn,
		dispose: spawnerMocks.dispose,
	});
}

async function successfulSpawn(config: SpawnConfig) {
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
}

async function reviewGateSpawn(
	config: SpawnConfig,
	planSlug: string,
): Promise<SpawnResult> {
	const text =
		config.role === "plan-reviewer"
			? `${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"${planSlug}","reviewRound":1}`
			: config.prompt.includes("Revision purpose:")
				? `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"${planSlug}","reviewRound":1,"status":"addressed"}`
				: `${config.role} durable summary`;
	return spawnWithText(config, text);
}

function spawnWithText(config: SpawnConfig, text: string): SpawnResult {
	return {
		success: true,
		sessionId: `session-${config.role}`,
		messages: [{ role: "assistant", content: [{ type: "text", text }] }],
	};
}

async function writePlanReviewFixture(
	projectRoot: string,
	planSlug: string,
): Promise<void> {
	const planDirectory = join(projectRoot, "missions", "plans", planSlug);
	await mkdir(planDirectory, { recursive: true });
	await Promise.all([
		writeFile(
			join(planDirectory, "plan.md"),
			"---\ntitle: Durable review gate\nstatus: active\n---\n\n## Decision Log\n",
			"utf-8",
		),
		writeFile(
			join(planDirectory, "review.md"),
			"# Plan Review\n\n## Findings\n\n## Assessment\n\nComplete.\n",
			"utf-8",
		),
	]);
}

async function readRunActivity(projectRoot: string): Promise<unknown[]> {
	const latest = await latestChainStore(projectRoot);
	const { events } = await latest.store.readEvents(latest.run);
	return events.flatMap(({ event }) =>
		event.type === "run_activity" ? [event.details] : [],
	);
}

async function latestChainStore(projectRoot: string) {
	const store = new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	const [run] = await store.listRecentRuns({ scope: "chain", limit: 1 });
	if (!run) throw new Error("Expected a persisted chain run.");
	return { store, run };
}

async function runWithActivityAfterTarget(options: {
	projectRoot: string;
	expression: string;
	details: unknown;
}): Promise<ChainResult> {
	return runWithActivityHook({
		...options,
		activityKind: "plan_review_target",
		afterActivity: async ({ store, ref }) => {
			await store.appendEvent(ref, {
				type: "run_activity",
				runId: ref.runId,
				details: options.details,
			});
		},
	});
}

async function runWithActivityHook(options: {
	projectRoot: string;
	expression: string;
	activityKind: string;
	afterActivity: (context: {
		store: FileRunStore;
		ref: { scope: string; runId: string };
	}) => Promise<void>;
}): Promise<ChainResult> {
	const originalAppendEvent = FileRunStore.prototype.appendEvent;
	let injected = false;
	const appendSpy = vi
		.spyOn(FileRunStore.prototype, "appendEvent")
		.mockImplementation(async function (this: FileRunStore, ref, event) {
			const stored = await originalAppendEvent.call(this, ref, event);
			if (
				!injected &&
				event.type === "run_activity" &&
				activityKind(event.details) === options.activityKind
			) {
				injected = true;
				await options.afterActivity({ store: this, ref });
			}
			return stored;
		});
	try {
		return await runDurableChain({
			steps: parseChain(options.expression, registry),
			projectRoot: options.projectRoot,
			planSlug: basename(options.projectRoot),
			registry,
		});
	} finally {
		appendSpy.mockRestore();
	}
}

function activityKind(details: unknown): string | undefined {
	return typeof details === "object" &&
		details !== null &&
		"kind" in details &&
		typeof details.kind === "string"
		? details.kind
		: undefined;
}

async function writeEpisodicConfig(
	projectRoot: string,
	enabled: boolean,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled } }),
		"utf-8",
	);
}

async function readProjectChainEpisodes(projectRoot: string) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;

	return records.map((record) => {
		const metadata = parseEpisodeRecord(record);
		if (!metadata) throw new Error(`Invalid episode record: ${record.path}`);
		return { ...metadata, source: record.source };
	});
}

async function captureDisabledBaselines(
	projectRoot: string,
	skipConfig = false,
): Promise<{
	inline: { result: ChainResult; events: ChainEvent[] };
	durable: { result: ChainResult; events: ChainEvent[] };
	files: Record<string, string>;
}> {
	const inlineEvents: ChainEvent[] = [];
	const inlineResult = await runChain({
		steps: parseChain("planner -> reviewer", registry),
		projectRoot,
		registry,
		onEvent: (event) => inlineEvents.push(event),
	});
	const durableEvents: ChainEvent[] = [];
	const durableResult = await runDurableChain({
		steps: parseChain("planner -> reviewer", registry),
		projectRoot,
		registry,
		onEvent: (event) => durableEvents.push(event),
	});

	return {
		inline: { result: inlineResult, events: inlineEvents },
		durable: { result: durableResult, events: durableEvents },
		files: await readFileTree(projectRoot, skipConfig),
	};
}

async function readFileTree(
	root: string,
	skipConfig: boolean,
): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	await visit(root);
	return files;

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			const relativePath = relative(root, path);
			if (skipConfig && relativePath === ".cosmonauts/config.json") continue;
			files[relativePath] = await readFile(path, "utf-8");
		}
	}
}

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
