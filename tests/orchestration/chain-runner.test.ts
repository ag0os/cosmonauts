/**
 * Tests for chain-runner.ts
 * Covers runStage (one-shot and loop modes), runChain (with mocked spawner module),
 * createDefaultCompletionCheck (with real task system), and event emission.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import {
	createDefaultCompletionCheck,
	derivePlanSlug,
	getDefaultStagePrompt,
	injectUserPrompt,
	runChain,
	runStage,
} from "../../lib/orchestration/chain-runner.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	parseReviewReportLine,
	REVIEW_REVISION_REPORT_TOKEN,
} from "../../lib/orchestration/review-revision.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainStage,
	ChainStep,
	ParallelGroupStep,
	SpawnResult,
	SpawnStats,
	StageResult,
} from "../../lib/orchestration/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

// ============================================================================
// Mock the agent-spawner module so runChain never creates real Pi sessions.
// Uses vi.hoisted() to make the pre-import mock reference explicit.
// ============================================================================

const spawnerRef = vi.hoisted(() => ({
	current: undefined as AgentSpawner | undefined,
}));

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => spawnerRef.current,
	getModelForRole: () => "test-provider/test-model",
	getThinkingForRole: () => undefined,
}));

// ============================================================================
// Mock Spawner Helper
// ============================================================================

function createMockSpawner(results?: SpawnResult[]): AgentSpawner {
	let callIndex = 0;
	const defaultResult: SpawnResult = {
		success: true,
		sessionId: "mock-session",
		messages: [],
	};
	return {
		spawn: vi.fn(async () => {
			const result = results?.[callIndex] ?? defaultResult;
			callIndex++;
			return result;
		}),
		dispose: vi.fn(),
	};
}

// ============================================================================
// Helpers
// ============================================================================

function makeStage(
	name: string,
	loop: boolean,
	completionCheck?: (projectRoot: string) => Promise<boolean>,
): ChainStage {
	const stage: ChainStage = { name, loop };
	if (completionCheck) stage.completionCheck = completionCheck;
	return stage;
}

/** Build a minimal agent definition for testing. */
function makeCodingDef(id: string, loop: boolean): AgentDefinition {
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

/** Test registry with the coding domain agents used across chain-runner tests. */
const defaultRegistry = new AgentRegistry([
	makeCodingDef("cody", false),
	makeCodingDef("planner", false),
	makeCodingDef("task-manager", false),
	makeCodingDef("coordinator", true),
	makeCodingDef("worker", false),
	makeCodingDef("quality-manager", false),
	makeCodingDef("reviewer", false),
	makeCodingDef("plan-reviewer", false),
	makeCodingDef("fixer", false),
]);

function bindingResolver(bindings: Record<string, string>) {
	return {
		resolveAgentReference(qualifiedId: string) {
			const [role, agentId] = qualifiedId.split("/");
			if (!role || !agentId) throw new Error("Expected qualified reference");
			const domainId = bindings[role] ?? role;
			return {
				requested: { role, agentId, qualifiedId },
				resolved: {
					role: domainId,
					agentId,
					qualifiedId: `${domainId}/${agentId}`,
				},
				binding: {
					role,
					domainId,
					source: bindings[role] ? "project" : "default",
				},
			};
		},
	};
}

function makeConfig(
	steps: ChainStep[],
	overrides?: Partial<ChainConfig>,
): ChainConfig {
	return {
		steps,
		projectRoot: "/tmp/test-project",
		registry: defaultRegistry,
		...overrides,
	};
}

function materializeInstructionReport(prompt: string, token: string): string {
	const reportStart = prompt.indexOf(`${token}: `);
	if (reportStart < 0) throw new Error(`Missing report token ${token}`);
	const reportEnd = prompt.indexOf("}", reportStart);
	if (reportEnd < 0) throw new Error(`Missing report payload for ${token}`);
	return prompt
		.slice(reportStart, reportEnd + 1)
		.replace("<slug>", "example-plan")
		.replace("<positive integer>", "1");
}

function planReviewReport(planSlug: string, reviewRound: number): string {
	return `${PLAN_REVIEW_REPORT_TOKEN}: ${JSON.stringify({ planSlug, reviewRound })}`;
}

function reviewRevisionReport(
	planSlug: string,
	reviewRound: number,
	status: "addressed" | "unaddressed" = "addressed",
): string {
	return `${REVIEW_REVISION_REPORT_TOKEN}: ${JSON.stringify({
		planSlug,
		reviewRound,
		status,
		...(status === "unaddressed" && { reason: "Revision remains incomplete." }),
	})}`;
}

async function writePlanReviewTarget(options: {
	projectRoot: string;
	planSlug: string;
	statusLine?: string;
	rounds?: readonly number[];
	unsafeReviewEntry?: boolean;
}): Promise<void> {
	const planDirectory = join(
		options.projectRoot,
		"missions",
		"plans",
		options.planSlug,
	);
	await mkdir(planDirectory, { recursive: true });
	await writeFile(
		join(planDirectory, "plan.md"),
		`---\ntitle: Review target\n${options.statusLine ?? "status: active"}\n---\n\n## Decision Log\n`,
		"utf-8",
	);
	if (options.unsafeReviewEntry) {
		await mkdir(join(planDirectory, "review.md"));
		return;
	}
	for (const round of options.rounds ?? [1]) {
		const fileName = round === 1 ? "review.md" : `review-${round}.md`;
		await writeFile(
			join(planDirectory, fileName),
			"# Plan Review\n\n## Findings\n\n## Assessment\n\nReview complete.\n",
			"utf-8",
		);
	}
}

function successfulTestSpawn(
	role: string,
	text = `${role} completed`,
): SpawnResult {
	return {
		success: true,
		sessionId: `session-${role}`,
		messages: [
			{
				role: "assistant",
				content: [{ type: "text", text }],
			},
		],
	};
}

function reviewReportSpawner(assistantText: string): AgentSpawner {
	const parsed = parseReviewReportLine(assistantText);
	return {
		spawn: vi.fn(async (config) =>
			successfulTestSpawn(
				config.role,
				config.role === "plan-reviewer"
					? assistantText
					: config.prompt.includes("Revision purpose:") &&
							parsed?.kind === "plan-review"
						? reviewRevisionReport(
								parsed.target.planSlug,
								parsed.target.reviewRound,
							)
						: `${config.role} completed`,
			),
		),
		dispose: vi.fn(),
	};
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

describe("getDefaultStagePrompt", () => {
	test("returns a role-specific prompt for integration-verifier", () => {
		const prompt = getDefaultStagePrompt("integration-verifier");
		expect(prompt).toBe(
			"Read the active plan, verify implementation against declared contracts, and write missions/plans/<slug>/integration-report.md.",
		);
		expect(prompt).not.toBe("Execute your assigned role.");
	});

	test("falls back to the generic prompt for unknown roles", () => {
		expect(getDefaultStagePrompt("adaptation-planner")).toBe(
			"Execute your assigned role.",
		);
		expect(getDefaultStagePrompt("behavior-reviewer")).toBe(
			"Execute your assigned role.",
		);
	});
});

describe("derivePlanSlug", () => {
	test("extracts slug from plan completion labels", () => {
		expect(derivePlanSlug("plan:session-lineage")).toBe("session-lineage");
	});

	test("throws for path traversal slugs", () => {
		expect(() => derivePlanSlug("plan:../../etc/passwd")).toThrow(
			"Invalid plan slug",
		);
	});
});

// ============================================================================
// runStage Tests
// ============================================================================

describe("runStage", () => {
	describe("one-shot (loop=false)", () => {
		test("fails unknown stage role before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("unknown-role", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown agent role "unknown-role"');
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("runs a resolved chain stage without rebinding the final target", async () => {
			const registry = new AgentRegistry([makeCodingDef("worker", false)], {
				bindingResolver: bindingResolver({ a: "coding", coding: "c" }) as never,
			});
			const [stage] = parseChain("a/worker", registry);
			if (!stage || "kind" in stage) {
				expect.unreachable("Expected one resolved chain stage");
			}
			expect(stage.agentReference?.resolved.qualifiedId).toBe("coding/worker");
			const spawner = createMockSpawner();
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					role: "a/worker",
					agentReference: expect.objectContaining({
						resolved: expect.objectContaining({
							qualifiedId: "coding/worker",
						}),
					}),
				}),
			);
		});

		test("rejects invalid derived planSlug before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				completionLabel: "plan:../../escape",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid plan slug");
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("rejects invalid explicit planSlug before spawn", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				planSlug: "..\\escape",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid plan slug");
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("spawns agent once and returns success with iterations=1", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(1);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("records duration >= 0", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		test("summary reflects the agent's final assistant message", async () => {
			const spawner = createMockSpawner([
				{
					success: true,
					sessionId: "mock-session",
					messages: [
						{
							role: "assistant",
							content: [
								{ type: "text", text: "Created 7 tasks under the plan." },
							],
						},
					],
				},
			]);
			const stage = makeStage("task-manager", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.summary).toBe("Created 7 tasks under the plan.");
		});

		test("summary falls back to '<role> completed' when the agent ends on a tool call", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.summary).toBe("planner completed");
		});

		test("uses custom stage prompt when provided", async () => {
			const spawner = createMockSpawner();
			const stage: ChainStage = {
				name: "planner",
				loop: false,
				prompt: "Custom prompt for this stage",
			};
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({ prompt: "Custom prompt for this stage" }),
			);
		});

		test("uses default prompt when stage has no custom prompt", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: "Analyze the project and design an implementation plan.",
				}),
			);
		});

		test("returns failure with error when spawner fails", async () => {
			const spawner = createMockSpawner([
				{ success: false, sessionId: "", messages: [], error: "boom" },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toBe("boom");
			expect(result.iterations).toBe(1);
		});

		test("forwards compaction config from ChainConfig to spawn call", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				compaction: { enabled: true, keepRecentTokens: 8000 },
			});

			await runStage(stage, config, spawner);

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					compaction: { enabled: true, keepRecentTokens: 8000 },
				}),
			);
		});

		test("does not include compaction when not set in ChainConfig", async () => {
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			await runStage(stage, config, spawner);

			const spawnArgs = (spawner.spawn as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[0];
			expect(spawnArgs?.compaction).toBeUndefined();
		});
	});

	describe("registry via config", () => {
		function makeDef(
			id: string,
			loop: boolean,
			domain?: string,
		): AgentDefinition {
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
				domain,
			};
		}

		test("uses config.registry to validate agent roles", async () => {
			const registry = new AgentRegistry([
				makeDef("custom-agent", false, "ops"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("custom-agent", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("rejects unknown agent when config.registry is provided", async () => {
			const registry = new AgentRegistry([
				makeDef("custom-agent", false, "ops"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("nonexistent", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown agent role "nonexistent"');
			expect(spawner.spawn).not.toHaveBeenCalled();
		});

		test("resolves qualified names via config.registry", async () => {
			const registry = new AgentRegistry([makeDef("runner", false, "ops")]);
			const spawner = createMockSpawner();
			const stage = makeStage("ops/runner", false);
			const config = makeConfig([stage], { registry });

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("uses domainContext to resolve ambiguous unqualified names", async () => {
			const registry = new AgentRegistry([
				makeDef("planner", false, "coding"),
				makeDef("planner", false, "docs"),
			]);
			const spawner = createMockSpawner();
			const stage = makeStage("planner", false);
			const config = makeConfig([stage], {
				registry,
				domainContext: "docs",
			});

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					role: "planner",
					domainContext: "docs",
				}),
			);
		});
	});

	describe("loop (loop=true)", () => {
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();

		test("iterates until completion check returns true", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner();
			let callCount = 0;
			const completionCheck = vi.fn(async () => {
				callCount++;
				return callCount >= 2;
			});
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 10,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(true);
			// completion check runs once before first spawn, then after iteration 1
			expect(result.iterations).toBe(1);
			expect(spawner.spawn).toHaveBeenCalledTimes(1);
		});

		test("exhausts iteration budget when completion never passes", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner();
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("reached max iterations");
			expect(result.iterations).toBe(3);
			expect(spawner.spawn).toHaveBeenCalledTimes(3);
			// one pre-check + once per iteration
			expect(completionCheck).toHaveBeenCalledTimes(4);
		});

		test("respects abort signal between iterations", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const controller = new AbortController();
			let spawnCallCount = 0;

			const spawner: AgentSpawner = {
				spawn: vi.fn(async () => {
					spawnCallCount++;
					// Abort after the first iteration completes
					if (spawnCallCount === 1) {
						controller.abort();
					}
					return {
						success: true,
						sessionId: `session-${spawnCallCount}`,
						messages: [],
					};
				}),
				dispose: vi.fn(),
			};

			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("worker", true, completionCheck);
			const config = makeConfig([stage], { signal: controller.signal });

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 10,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.iterations).toBeLessThan(10);
			expect(result.success).toBe(true);
		});

		test("stops on spawner failure", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
				{
					success: false,
					sessionId: "",
					messages: [],
					error: "agent crashed",
				},
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("agent crashed");
			expect(result.iterations).toBe(2);
			expect(spawner.spawn).toHaveBeenCalledTimes(2);
		});

		test("fails fast when default completion scope has no tasks", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(join(tmpdir(), "chain-runner-stage-empty-"));
			const spawner = createMockSpawner();
			const stage = makeStage("coordinator", true);
			const config = makeConfig([stage], {
				projectRoot: tmpDir,
				completionLabel: "plan:missing",
			});

			try {
				const result = await runStage(stage, config, spawner, {
					maxTotalIterations: 10,
					deadlineMs: FIXED_NOW + 60_000,
				});

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("No tasks found");
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("fails fast when all scoped tasks are blocked", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-blocked-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({
				title: "A",
				labels: ["plan:alpha"],
			});
			const taskB = await tm.createTask({
				title: "B",
				labels: ["plan:alpha"],
			});
			await tm.updateTask(taskA.id, { status: "Blocked" });
			await tm.updateTask(taskB.id, { status: "Blocked" });

			const spawner = createMockSpawner();
			const stage = makeStage("coordinator", true);
			const config = makeConfig([stage], {
				projectRoot: tmpDir,
				completionLabel: "plan:alpha",
			});

			try {
				const result = await runStage(stage, config, spawner, {
					maxTotalIterations: 10,
					deadlineMs: FIXED_NOW + 60_000,
				});

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("Blocked");
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("forwards compaction config to spawn call in loop stage", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
			]);
			const completionCheck = vi
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage], {
				compaction: { enabled: true, keepRecentTokens: 4000 },
			});

			await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					compaction: { enabled: true, keepRecentTokens: 4000 },
				}),
			);
		});

		test("adds label-scoping instructions to coordinator prompt", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "session-1", messages: [] },
			]);
			const completionCheck = vi
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage], {
				completionLabel: "review-round:1",
			});

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: Date.now() + 60_000,
			});

			expect(result.success).toBe(true);
			expect(spawner.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining(
						'Scope constraint: Operate only on tasks labeled "review-round:1"',
					),
				}),
			);
		});
	});
});

// ============================================================================
// createDefaultCompletionCheck Tests
// ============================================================================

describe("createDefaultCompletionCheck", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "chain-runner-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns false for empty project", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns false when tasks not all Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		await tm.createTask({ title: "Task A" });
		await tm.createTask({ title: "Task B" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns true when all tasks Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const taskA = await tm.createTask({ title: "Task A" });
		const taskB = await tm.createTask({ title: "Task B" });

		await tm.updateTask(taskA.id, { status: "Done" });
		await tm.updateTask(taskB.id, { status: "Done" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(true);
	});

	test("returns true when every task is Done or Cancelled, with the Cancelled criteria left unchecked", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const done = await tm.createTask({ title: "Task A" });
		const cancelled = await tm.createTask({
			title: "Superseded",
			acceptanceCriteria: ["Will not be completed"],
		});

		await tm.updateTask(done.id, { status: "Done" });
		await tm.updateTask(cancelled.id, { status: "Cancelled" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(true);
	});

	test("returns false when Done tasks still have unchecked acceptance criteria", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const task = await tm.createTask({
			title: "Task with ACs",
			acceptanceCriteria: ["Ship the behavior"],
		});

		await tm.updateTask(task.id, { status: "Done" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("returns true when Done tasks have all acceptance criteria checked", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const task = await tm.createTask({
			title: "Task with checked ACs",
			acceptanceCriteria: ["Ship the behavior"],
		});

		await tm.updateTask(task.id, {
			status: "Done",
			acceptanceCriteria: [
				{ index: 1, text: "Ship the behavior", checked: true },
			],
		});

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(true);
	});

	test("returns false when only some Done", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const taskA = await tm.createTask({ title: "Task A" });
		await tm.createTask({ title: "Task B" });

		await tm.updateTask(taskA.id, { status: "Done" });

		const check = createDefaultCompletionCheck(tmpDir);
		const result = await check();

		expect(result).toBe(false);
	});

	test("label scope ignores unrelated incomplete tasks", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		const scopedDone = await tm.createTask({
			title: "Scoped done task",
			labels: ["plan:alpha"],
		});
		await tm.createTask({
			title: "Scoped pending task in another plan",
			labels: ["plan:beta"],
		});

		await tm.updateTask(scopedDone.id, { status: "Done" });

		const scopedCheck = createDefaultCompletionCheck(tmpDir, "plan:alpha");
		const unscopedCheck = createDefaultCompletionCheck(tmpDir);

		expect(await scopedCheck()).toBe(true);
		expect(await unscopedCheck()).toBe(false);
	});

	test("label scope returns false when matching set is empty", async () => {
		const tm = new TaskManager(tmpDir);
		await tm.init();
		await tm.createTask({ title: "General task", labels: ["backend"] });

		const scopedCheck = createDefaultCompletionCheck(tmpDir, "plan:missing");
		expect(await scopedCheck()).toBe(false);
	});
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe("event emission", () => {
	test("emits agent_spawned and agent_completed for one-shot stage", async () => {
		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes).toContain("agent_spawned");
		expect(eventTypes).toContain("agent_completed");
	});

	test("emits stage_iteration events for loop stages", async () => {
		vi.useFakeTimers();
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(FIXED_NOW);

		const events: ChainEvent[] = [];
		const spawner = createMockSpawner();
		const completionCheck = vi.fn(async () => false);
		const stage = makeStage("coordinator", true, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner, {
			maxTotalIterations: 3,
			deadlineMs: FIXED_NOW + 60_000,
		});

		const iterationEvents = events.filter((e) => e.type === "stage_iteration");
		expect(iterationEvents).toHaveLength(3);
	});

	test("forwards agent_turn and agent_tool_use events from spawner onEvent", async () => {
		const events: ChainEvent[] = [];
		const sessionId = "mock-session";
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				// Simulate events from the spawner's onEvent callback
				config.onEvent?.({ type: "turn_start", sessionId });
				config.onEvent?.({
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tc-1",
					sessionId,
				});
				config.onEvent?.({
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "tc-1",
					isError: false,
					sessionId,
				});
				config.onEvent?.({ type: "turn_end", sessionId });
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const turnEvents = events.filter((e) => e.type === "agent_turn");
		const toolEvents = events.filter((e) => e.type === "agent_tool_use");
		expect(turnEvents).toHaveLength(2);
		expect(toolEvents).toHaveLength(2);

		// Verify structure of forwarded events
		const firstTurn = turnEvents[0] as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>;
		expect(firstTurn.role).toBe("planner");
		expect(firstTurn.sessionId).toBe(sessionId);
		expect(firstTurn.event.type).toBe("turn_start");

		const firstTool = toolEvents[0] as Extract<
			ChainEvent,
			{ type: "agent_tool_use" }
		>;
		expect(firstTool.role).toBe("planner");
		expect(firstTool.sessionId).toBe(sessionId);
		expect(firstTool.event.type).toBe("tool_execution_start");
	});

	test("emits agent_spawned before forwarded tool events and agent_completed after spawn settles", async () => {
		const events: ChainEvent[] = [];
		const sessionId = "parallel-session";
		let resolveSpawn!: () => void;

		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				config.onEvent?.({
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tc-early",
					sessionId,
				});
				await new Promise<void>((resolve) => {
					resolveSpawn = resolve;
				});
				config.onEvent?.({
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "tc-early",
					isError: false,
					sessionId,
				});
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});
		const runPromise = runStage(stage, config, spawner);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		const earlyTypes = events.map((event) => event.type);
		expect(earlyTypes).toContain("agent_spawned");
		expect(earlyTypes).not.toContain("agent_completed");
		resolveSpawn();
		await runPromise;

		const types = events.map((event) => event.type);
		const spawnedIndex = types.indexOf("agent_spawned");
		const firstToolIndex = types.indexOf("agent_tool_use");
		const completedIndex = types.indexOf("agent_completed");
		expect(spawnedIndex).toBeGreaterThan(-1);
		expect(firstToolIndex).toBeGreaterThan(-1);
		expect(completedIndex).toBeGreaterThan(-1);
		expect(spawnedIndex).toBeLessThan(firstToolIndex);
		expect(firstToolIndex).toBeLessThan(completedIndex);
	});

	test("uses each loop spawn sessionId when forwarding events", async () => {
		const events: ChainEvent[] = [];
		let spawnCount = 0;
		const completionCheck = vi.fn(async () => spawnCount >= 2);
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				spawnCount++;
				const sessionId = `loop-session-${spawnCount}`;
				config.onEvent?.({ type: "turn_start", sessionId });
				config.onEvent?.({ type: "turn_end", sessionId });
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("coordinator", true, completionCheck);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner, {
			maxTotalIterations: 3,
			deadlineMs: Date.now() + 60_000,
		});

		const turnEvents = events.filter((e) => e.type === "agent_turn") as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>[];
		expect(turnEvents.map((event) => event.sessionId)).toEqual([
			"loop-session-1",
			"loop-session-1",
			"loop-session-2",
			"loop-session-2",
		]);
	});

	test("forwards compaction events as agent_turn", async () => {
		const events: ChainEvent[] = [];
		const sessionId = "mock-session";
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				config.onEvent?.({
					type: "compaction_start",
					reason: "threshold",
					sessionId,
				});
				config.onEvent?.({
					type: "compaction_end",
					reason: "threshold",
					aborted: false,
					willRetry: false,
					sessionId,
				});
				return {
					success: true,
					sessionId,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: (event) => events.push(event),
		});

		await runStage(stage, config, spawner);

		const turnEvents = events.filter((e) => e.type === "agent_turn") as Extract<
			ChainEvent,
			{ type: "agent_turn" }
		>[];
		expect(turnEvents).toHaveLength(2);
		expect(turnEvents[0]?.sessionId).toBe(sessionId);
		expect(turnEvents[0]?.event.type).toBe("compaction_start");
		expect(turnEvents[1]?.sessionId).toBe(sessionId);
		expect(turnEvents[1]?.event.type).toBe("compaction_end");
	});

	test("does not pass onEvent to spawner when chain has no onEvent", async () => {
		const spawner: AgentSpawner = {
			spawn: vi.fn(async (config) => {
				expect(config.onEvent).toBeUndefined();
				return {
					success: true,
					sessionId: "mock-session",
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};
		const stage = makeStage("planner", false);
		const config = makeConfig([stage]); // no onEvent

		await runStage(stage, config, spawner);

		expect(spawner.spawn).toHaveBeenCalledTimes(1);
	});

	test("onEvent errors are swallowed", async () => {
		const spawner = createMockSpawner();
		const stage = makeStage("planner", false);
		const config = makeConfig([stage], {
			onEvent: () => {
				throw new Error("listener error");
			},
		});

		// Should not reject even though the listener throws
		const result = await runStage(stage, config, spawner);
		expect(result.success).toBe(true);
	});
});

// ============================================================================
// runChain Tests (module-level mock of agent-spawner)
// ============================================================================

describe("runChain", () => {
	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("sequential one-shot stages succeed", async () => {
		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
		expect(result.errors).toHaveLength(0);
	});

	test("freezes the absent-config inline chain result, events, and empty file set", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "chain-pre-w3-baseline-"));
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const events: ChainEvent[] = [];
		const stage = makeStage("planner", false);

		try {
			const result = await runChain(
				makeConfig([stage], {
					projectRoot,
					onEvent: (event) => events.push(event),
				}),
			);

			expect(result).toEqual({
				success: true,
				stageResults: [
					{
						stage: {
							...stage,
							agentReference: {
								requested: {
									role: "coding",
									agentId: "planner",
									qualifiedId: "coding/planner",
								},
								resolved: {
									role: "coding",
									agentId: "planner",
									qualifiedId: "coding/planner",
								},
								binding: {
									role: "coding",
									domainId: "coding",
									source: "default",
								},
							},
						},
						success: true,
						iterations: 1,
						durationMs: 0,
						error: undefined,
						stats: undefined,
						summary: "planner completed",
					},
				],
				totalDurationMs: 0,
				errors: [],
				stats: {
					stages: [],
					totalCost: 0,
					totalTokens: 0,
					totalDurationMs: 0,
				},
			});
			expect(events.map((event) => event.type)).toEqual([
				"chain_start",
				"stage_start",
				"agent_spawned",
				"agent_completed",
				"stage_end",
				"chain_end",
			]);
			expect(await readdir(projectRoot)).toEqual([]);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("records exactly one fail-soft inline chain start and terminal episode across exit paths", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const subjects = new Set<string>();
		const cases = [
			{
				name: "success",
				expectedOutcome: "succeeded",
				spawner: (_controller: AbortController) => createMockSpawner(),
			},
			{
				name: "failure",
				expectedOutcome: "failed",
				spawner: (_controller: AbortController) =>
					createMockSpawner([
						{
							success: false,
							sessionId: "failed-session",
							messages: [],
							error: "stage failed",
						},
					]),
			},
			{
				name: "abort",
				expectedOutcome: "aborted",
				spawner: (controller: AbortController) => ({
					spawn: vi.fn(async () => {
						controller.abort();
						return {
							success: true,
							sessionId: "aborted-session",
							messages: [],
						};
					}),
					dispose: vi.fn(),
				}),
			},
			{
				name: "throw",
				expectedOutcome: "failed",
				spawner: (_controller: AbortController) => ({
					...createMockSpawner(),
					dispose: vi.fn(() => {
						throw new Error("dispose exploded");
					}),
				}),
			},
		] as const;

		for (const testCase of cases) {
			const projectRoot = await mkdtemp(
				join(tmpdir(), `chain-episode-${testCase.name}-`),
			);
			const controller = new AbortController();
			await writeEpisodicConfig(projectRoot, true);
			spawnerRef.current = testCase.spawner(controller);

			try {
				const execution = runChain(
					makeConfig([makeStage("planner", false)], {
						projectRoot,
						signal: controller.signal,
					}),
				);
				if (testCase.name === "throw") {
					await expect(execution).rejects.toThrow("dispose exploded");
				} else {
					const result = await execution;
					expect(result.success).toBe(testCase.name === "success");
				}

				const episodes = await readProjectChainEpisodes(projectRoot);
				expect(episodes).toHaveLength(2);
				expect(episodes.map((episode) => episode.outcome).sort()).toEqual(
					["started", testCase.expectedOutcome].sort(),
				);
				expect(episodes.map((episode) => episode.action)).toEqual([
					"chain.run",
					"chain.run",
				]);
				expect(new Set(episodes.map((episode) => episode.subject.id))).toEqual(
					new Set([episodes[0]?.subject.id]),
				);
				expect(episodes[0]?.subject).toMatchObject({
					kind: "chain",
					id: expect.stringMatching(/^chain-/u),
				});
				expect(episodes.map((episode) => episode.source)).toEqual([
					"coding/planner",
					"coding/planner",
				]);
				if (episodes[0]) subjects.add(episodes[0].subject.id);
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}
		expect(subjects.size).toBe(cases.length);

		const groupRoot = await mkdtemp(join(tmpdir(), "chain-episode-group-"));
		const fallbackRoot = await mkdtemp(
			join(tmpdir(), "chain-episode-group-fallback-"),
		);
		try {
			await writeEpisodicConfig(groupRoot, true);
			spawnerRef.current = {
				spawn: vi.fn(async (config) => {
					const sessionId = `session-${config.role}`;
					config.onEvent?.({ type: "turn_start", sessionId });
					config.onEvent?.({
						type: "tool_execution_start",
						sessionId,
						toolName: "read",
						toolCallId: `tool-${config.role}`,
					});
					config.onEvent?.({
						type: "tool_execution_end",
						sessionId,
						toolName: "read",
						toolCallId: `tool-${config.role}`,
						isError: false,
					});
					config.onEvent?.({ type: "turn_end", sessionId });
					return { success: true, sessionId, messages: [] };
				}),
				dispose: vi.fn(),
			};
			await runChain(
				makeConfig(
					parseChain("[planner, reviewer] -> task-manager", defaultRegistry),
					{ projectRoot: groupRoot, onEvent: () => {} },
				),
			);
			const groupEpisodes = await readProjectChainEpisodes(groupRoot);
			expect(groupEpisodes).toHaveLength(2);
			expect(groupEpisodes.map((episode) => episode.source)).toEqual([
				"coding/planner",
				"coding/planner",
			]);

			await writeEpisodicConfig(fallbackRoot, true);
			spawnerRef.current = createMockSpawner();
			await runChain(
				makeConfig(
					[
						{
							kind: "parallel",
							stages: [
								makeStage("unresolved-first", false),
								makeStage("reviewer", false),
							],
							syntax: { kind: "group" },
						},
					],
					{ projectRoot: fallbackRoot },
				),
			);
			const fallbackEpisodes = await readProjectChainEpisodes(fallbackRoot);
			expect(fallbackEpisodes).toHaveLength(2);
			expect(fallbackEpisodes.map((episode) => episode.source)).toEqual([
				"unresolved-first",
				"unresolved-first",
			]);
		} finally {
			await Promise.all([
				rm(groupRoot, { recursive: true, force: true }),
				rm(fallbackRoot, { recursive: true, force: true }),
			]);
		}

		const baselineRoot = await mkdtemp(
			join(tmpdir(), "chain-episode-capture-baseline-"),
		);
		const captureFailureRoot = await mkdtemp(
			join(tmpdir(), "chain-episode-capture-failure-"),
		);
		try {
			spawnerRef.current = createMockSpawner();
			const baselineEvents: ChainEvent[] = [];
			const baseline = await runChain(
				makeConfig([makeStage("planner", false)], {
					projectRoot: baselineRoot,
					onEvent: (event) => baselineEvents.push(event),
				}),
			);

			await writeEpisodicConfig(captureFailureRoot, true);
			await writeFile(join(captureFailureRoot, "memory"), "path collision");
			const warnings: unknown[] = [];
			const failureEvents: ChainEvent[] = [];
			spawnerRef.current = createMockSpawner();
			const withCaptureFailure = await runChain(
				makeConfig([makeStage("planner", false)], {
					projectRoot: captureFailureRoot,
					onEvent: (event) => failureEvents.push(event),
					reportEpisodeWarning: async (warning) => {
						await Promise.resolve();
						warnings.push(warning);
					},
				}),
			);

			expect(withCaptureFailure).toEqual(baseline);
			expect(failureEvents).toEqual(baselineEvents);
			expect(warnings).toHaveLength(2);
			expect(warnings).toEqual([
				expect.objectContaining({
					message: expect.stringContaining("Episode capture skipped"),
				}),
				expect.objectContaining({
					message: expect.stringContaining("Episode capture skipped"),
				}),
			]);
		} finally {
			await Promise.all([
				rm(baselineRoot, { recursive: true, force: true }),
				rm(captureFailureRoot, { recursive: true, force: true }),
			]);
			vi.useRealTimers();
		}
	});

	test("keeps inline chain results explicitly non-durable", async () => {
		const result = await runChain(makeConfig([makeStage("planner", false)]));

		expect(result.run).toBeUndefined();
	});

	test("user prompt injection preserves default first-stage role prompt", async () => {
		const steps = parseChain("planner -> task-manager", defaultRegistry);
		injectUserPrompt(steps, "build auth");

		await runChain(makeConfig(steps));

		expect(spawnerRef.current?.spawn).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "planner",
				prompt:
					"Analyze the project and design an implementation plan.\n\nUser request: build auth",
			}),
		);
	});

	test("gives a plan-review cycle distinct jobs while preserving the first planner prompt", async () => {
		const steps = parseChain(
			"planner -> plan-reviewer -> planner",
			defaultRegistry,
		);
		injectUserPrompt(steps, "strengthen the active plan");
		const projectRoot = await mkdtemp(join(tmpdir(), "chain-review-prompts-"));
		await writePlanReviewTarget({ projectRoot, planSlug: "example-plan" });
		spawnerRef.current = reviewReportSpawner(
			planReviewReport("example-plan", 1),
		);

		await runChain(
			makeConfig(steps, { projectRoot, planSlug: "example-plan" }),
		);

		const spawnMock = spawnerRef.current?.spawn;
		expect(spawnMock).toBeDefined();
		if (!spawnMock) return;
		const prompts = vi
			.mocked(spawnMock)
			.mock.calls.map(([spawn]) => spawn.prompt);
		const expectedPlanReviewToken = ["COSMO", "PLAN", "REVIEW"].join("_");
		const expectedRevisionToken = ["COSMO", "REVIEW", "REVISION"].join("_");

		expect(PLAN_REVIEW_REPORT_TOKEN).toBe(expectedPlanReviewToken);
		expect(REVIEW_REVISION_REPORT_TOKEN).toBe(expectedRevisionToken);
		expect(prompts).toEqual([
			"Analyze the project and design an implementation plan.\n\nUser request: strengthen the active plan",
			`Review the active plan and verify its claims against the codebase. Write structured findings.\n\nPlan-review purpose: End with exactly one report line: ${PLAN_REVIEW_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>}.`,
			`Analyze the project and design an implementation plan.\n\nRevision purpose: Revise the active plan produced by the earlier "planner" stage. Read the highest-numbered plan-review round, address every high- and medium-severity finding, and do not start a new plan. End with exactly one report line: ${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"<slug>","reviewRound":<positive integer>,"status":"addressed"}, or report status "unaddressed" with a nonempty reason.\n\nBound plan-review target: {"planSlug":"example-plan","reviewRound":1}.`,
		]);
		expect(prompts[2]).not.toBe(prompts[0]);

		const reviewerLine = materializeInstructionReport(
			prompts[1] ?? "",
			PLAN_REVIEW_REPORT_TOKEN,
		);
		const revisionLine = materializeInstructionReport(
			prompts[2] ?? "",
			REVIEW_REVISION_REPORT_TOKEN,
		);
		expect(parseReviewReportLine(reviewerLine)).toEqual({
			kind: "plan-review",
			target: { planSlug: "example-plan", reviewRound: 1 },
		});
		expect(parseReviewReportLine(revisionLine)).toEqual({
			kind: "review-revision",
			target: { planSlug: "example-plan", reviewRound: 1 },
			status: "addressed",
		});
		expect(
			parseReviewReportLine(
				reviewerLine.replace(
					PLAN_REVIEW_REPORT_TOKEN,
					`${PLAN_REVIEW_REPORT_TOKEN}_MUTATED`,
				),
			),
		).toBeUndefined();
		expect(
			parseReviewReportLine(
				revisionLine.replace(
					REVIEW_REVISION_REPORT_TOKEN,
					`${REVIEW_REVISION_REPORT_TOKEN}_MUTATED`,
				),
			),
		).toBeUndefined();
		await rm(projectRoot, { recursive: true, force: true });
	});

	test("binds plan review to the expected or reviewer-established active target", async () => {
		const terminal = planReviewReport("review-target", 1);
		const cases = [
			{
				name: "missing",
				assistantText: "Review completed without a machine report.",
				reason: "missing-review-report",
			},
			{
				name: "malformed",
				assistantText: `${PLAN_REVIEW_REPORT_TOKEN}: {not-json}`,
				reason: "malformed-review-report",
			},
			{
				name: "multiple",
				assistantText: `${terminal}\n${terminal}`,
				reason: "multiple-review-reports",
			},
			{
				name: "nonterminal",
				assistantText: `${terminal}\nTrailing reviewer prose.`,
				reason: "nonterminal-review-report",
			},
			{
				name: "inactive",
				assistantText: terminal,
				statusLine: "status: completed",
				reason: "inactive-plan",
			},
			{
				name: "mismatched",
				assistantText: terminal,
				rounds: [1, 2],
				reason: "stale-review-round",
			},
			{
				name: "unsafe",
				assistantText: terminal,
				unsafeReviewEntry: true,
				reason: "unsafe-review-entry",
			},
			{
				name: "valid",
				assistantText: `${"Detailed review prose. ".repeat(20)}\n${terminal}`,
			},
		] as const;

		for (const expectedSlugPresent of [true, false]) {
			for (const testCase of cases) {
				const projectRoot = await mkdtemp(
					join(
						tmpdir(),
						`chain-review-${expectedSlugPresent ? "expected" : "fallback"}-${testCase.name}-`,
					),
				);
				try {
					if (
						testCase.name === "inactive" ||
						testCase.name === "mismatched" ||
						testCase.name === "unsafe" ||
						testCase.name === "valid"
					) {
						await writePlanReviewTarget({
							projectRoot,
							planSlug: "review-target",
							...(testCase.name === "inactive" && {
								statusLine: testCase.statusLine,
							}),
							...(testCase.name === "mismatched" && {
								rounds: testCase.rounds,
							}),
							...(testCase.name === "unsafe" && {
								unsafeReviewEntry: testCase.unsafeReviewEntry,
							}),
						});
					}

					const events: ChainEvent[] = [];
					spawnerRef.current = {
						spawn: vi.fn(async (config) => ({
							success: true,
							sessionId: `session-${config.role}`,
							messages: [
								{
									role: "assistant",
									content: [
										{
											type: "text",
											text:
												config.role === "plan-reviewer"
													? testCase.assistantText
													: config.prompt.includes("Revision purpose:")
														? reviewRevisionReport("review-target", 1)
														: `${config.role} completed`,
										},
									],
								},
							],
						})),
						dispose: vi.fn(),
					};
					const steps = parseChain(
						"planner -> plan-reviewer -> planner",
						defaultRegistry,
					);
					const result = await runChain(
						makeConfig(steps, {
							projectRoot,
							...(expectedSlugPresent && { planSlug: "review-target" }),
							onEvent: (event) => events.push(event),
						}),
					);

					if (testCase.name === "valid") {
						expect(result.success, testCase.name).toBe(true);
						expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(3);
						const reviserPrompt = vi
							.mocked(spawnerRef.current.spawn)
							.mock.calls.at(-1)?.[0].prompt;
						expect(reviserPrompt).toContain(
							'Bound plan-review target: {"planSlug":"review-target","reviewRound":1}.',
						);
						expect(reviserPrompt).not.toContain("Detailed review prose.");
						expect(reviserPrompt).not.toContain(terminal);
						expect(result.stageResults[1]?.summary).not.toContain(terminal);
						expect(
							events.some((event) => event.type === "unaddressed_review_round"),
						).toBe(false);
					} else {
						expect(result.success, testCase.name).toBe(false);
						expect(result.errors[0], testCase.name).toBeTruthy();
						expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(2);
						expect(result.stageResults[1]).toMatchObject({
							success: false,
							reviewRoundBlock: { reason: testCase.reason },
						});
						expect(events).toContainEqual(
							expect.objectContaining({
								type: "unaddressed_review_round",
								block: expect.objectContaining({ reason: testCase.reason }),
							}),
						);
					}
				} finally {
					await rm(projectRoot, { recursive: true, force: true });
				}
			}
		}

		for (const expectedSlugPresent of [true, false]) {
			const projectRoot = await mkdtemp(
				join(tmpdir(), "chain-review-identity-"),
			);
			try {
				await Promise.all([
					writePlanReviewTarget({
						projectRoot,
						planSlug: "expected-target",
					}),
					writePlanReviewTarget({
						projectRoot,
						planSlug: "reported-target",
					}),
				]);
				spawnerRef.current = reviewReportSpawner(
					planReviewReport("reported-target", 1),
				);
				const result = await runChain(
					makeConfig(
						parseChain("planner -> plan-reviewer -> planner", defaultRegistry),
						{
							projectRoot,
							...(expectedSlugPresent && { planSlug: "expected-target" }),
						},
					),
				);
				expect(result.success).toBe(!expectedSlugPresent);
				if (expectedSlugPresent) {
					expect(result.stageResults[1]?.reviewRoundBlock).toMatchObject({
						reason: "mismatched-review-target",
						expectedPlanSlug: "expected-target",
						planSlug: "reported-target",
					});
				} else {
					const reviserPrompt = vi
						.mocked(spawnerRef.current.spawn)
						.mock.calls.at(-1)?.[0].prompt;
					expect(reviserPrompt).toContain('"planSlug":"reported-target"');
				}
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}

		for (const statusLine of ["", "status: unknown"] as const) {
			for (const expectedSlugPresent of [true, false]) {
				const projectRoot = await mkdtemp(
					join(tmpdir(), "chain-review-indeterminate-status-"),
				);
				try {
					await writePlanReviewTarget({
						projectRoot,
						planSlug: "review-target",
						statusLine,
					});
					spawnerRef.current = reviewReportSpawner(terminal);
					const result = await runChain(
						makeConfig(
							parseChain(
								"planner -> plan-reviewer -> planner",
								defaultRegistry,
							),
							{
								projectRoot,
								...(expectedSlugPresent && { planSlug: "review-target" }),
							},
						),
					);
					expect(result.stageResults[1]?.reviewRoundBlock).toMatchObject({
						reason: "plan-status-indeterminate",
					});
				} finally {
					await rm(projectRoot, { recursive: true, force: true });
				}
			}
		}
	});

	test("records a typed review block as an unsuccessful inline chain result", async () => {
		const terminal = reviewRevisionReport("review-target", 1);
		const cases = [
			{
				name: "missing",
				assistantText: "Revision completed without a machine report.",
				reason: "missing-review-report",
			},
			{
				name: "malformed JSON",
				assistantText: `${REVIEW_REVISION_REPORT_TOKEN}: {not-json}`,
				reason: "malformed-review-report",
			},
			{
				name: "unknown key",
				assistantText: `${terminal.slice(0, -1)},"extra":true}`,
				reason: "malformed-review-report",
			},
			{
				name: "unknown status",
				assistantText: `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"review-target","reviewRound":1,"status":"done"}`,
				reason: "malformed-review-report",
			},
			{
				name: "unaddressed without reason",
				assistantText: `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"review-target","reviewRound":1,"status":"unaddressed"}`,
				reason: "malformed-review-report",
			},
			{
				name: "unaddressed with blank reason",
				assistantText: `${REVIEW_REVISION_REPORT_TOKEN}: {"planSlug":"review-target","reviewRound":1,"status":"unaddressed","reason":"   "}`,
				reason: "malformed-review-report",
			},
			{
				name: "zero round",
				assistantText: reviewRevisionReport("review-target", 0),
				reason: "malformed-review-report",
			},
			{
				name: "noninteger round",
				assistantText: reviewRevisionReport("review-target", 1.5),
				reason: "malformed-review-report",
			},
			{
				name: "multiple",
				assistantText: `${terminal}\n${terminal}`,
				reason: "multiple-review-reports",
			},
			{
				name: "nonterminal",
				assistantText: `${terminal}\nTrailing revision prose.`,
				reason: "nonterminal-review-report",
			},
			{
				name: "reported unaddressed",
				assistantText: reviewRevisionReport("review-target", 1, "unaddressed"),
				reason: "revision-reported-unaddressed",
			},
			{
				name: "wrong target",
				assistantText: reviewRevisionReport("self-attested-target", 1),
				reason: "mismatched-review-target",
			},
			{
				name: "stale round",
				assistantText: terminal,
				mutate: async (projectRoot: string) => {
					await writeFile(
						join(
							projectRoot,
							"missions",
							"plans",
							"review-target",
							"review-2.md",
						),
						"# Plan Review\n\n## Findings\n\n## Assessment\n\nReview complete.\n",
						"utf-8",
					);
				},
				reason: "stale-review-round",
			},
			{
				name: "unsafe review entry",
				assistantText: terminal,
				mutate: async (projectRoot: string) => {
					const reviewPath = join(
						projectRoot,
						"missions",
						"plans",
						"review-target",
						"review.md",
					);
					await rm(reviewPath);
					await mkdir(reviewPath);
				},
				reason: "unsafe-review-entry",
			},
			{
				name: "unreadable plan artifact",
				assistantText: terminal,
				mutate: async (projectRoot: string) => {
					const planPath = join(
						projectRoot,
						"missions",
						"plans",
						"review-target",
						"plan.md",
					);
					await rm(planPath);
					await mkdir(planPath);
				},
				reason: "plan-artifact-io",
			},
			{
				name: "inactive plan after review",
				assistantText: terminal,
				mutate: async (projectRoot: string) => {
					await writeFile(
						join(projectRoot, "missions", "plans", "review-target", "plan.md"),
						"---\ntitle: Review target\nstatus: completed\n---\n\n## Decision Log\n",
						"utf-8",
					);
				},
				reason: "inactive-plan",
			},
			{
				name: "incompletely referenced findings",
				assistantText: terminal,
				mutate: async (projectRoot: string) => {
					await writeFile(
						join(
							projectRoot,
							"missions",
							"plans",
							"review-target",
							"review.md",
						),
						`# Plan Review

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Blocking finding"
  plan_refs: D-001
  code_refs: lib/example.ts:1
  description: |
    Concrete description.

## Assessment

Review incomplete.
`,
						"utf-8",
					);
				},
				reason: "missing-review-reference",
			},
		] as const;

		for (const testCase of cases) {
			const projectRoot = await mkdtemp(
				join(
					tmpdir(),
					`chain-revision-block-${testCase.name.replaceAll(" ", "-")}-`,
				),
			);
			try {
				await writePlanReviewTarget({ projectRoot, planSlug: "review-target" });
				const events: ChainEvent[] = [];
				let plannerSpawns = 0;
				spawnerRef.current = {
					spawn: vi.fn(async (config) => {
						if (config.role === "plan-reviewer") {
							return successfulTestSpawn(
								config.role,
								planReviewReport("review-target", 1),
							);
						}
						if (config.role === "planner") {
							plannerSpawns += 1;
							if (plannerSpawns === 2) {
								if ("mutate" in testCase) {
									await testCase.mutate(projectRoot);
								}
								return successfulTestSpawn(config.role, testCase.assistantText);
							}
						}
						return successfulTestSpawn(config.role);
					}),
					dispose: vi.fn(),
				};
				const result = await runChain(
					makeConfig(
						parseChain(
							"planner -> plan-reviewer -> planner -> task-manager",
							defaultRegistry,
						),
						{
							projectRoot,
							onEvent: (event) => events.push(event),
						},
					),
				);

				expect(result.success, testCase.name).toBe(false);
				expect(result.stageResults, testCase.name).toHaveLength(3);
				const revisionResult = result.stageResults[2];
				expect(revisionResult, testCase.name).toMatchObject({
					success: false,
					reviewRoundBlock: { reason: testCase.reason },
				});
				const block = revisionResult?.reviewRoundBlock;
				const identity = block?.planSlug
					? ` for ${block.planSlug}${block.reviewRound ? ` round ${block.reviewRound}` : ""}`
					: "";
				expect(revisionResult?.error, testCase.name).toBe(
					`Plan review target${identity} blocked: ${testCase.reason}`,
				);
				expect(result.errors, testCase.name).toEqual([revisionResult?.error]);
				expect(events, testCase.name).toContainEqual(
					expect.objectContaining({
						type: "unaddressed_review_round",
						block: expect.objectContaining({ reason: testCase.reason }),
					}),
				);
				expect(spawnerRef.current.spawn, testCase.name).toHaveBeenCalledTimes(
					3,
				);
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}
	});

	test("blocks sequential and parallel task decomposition until earlier plan review is addressed", async () => {
		const codingDefinitions = [
			"planner",
			"task-manager",
			"worker",
			"reviewer",
			"plan-reviewer",
		].map((id) => makeCodingDef(id, false));
		const boundRegistry = new AgentRegistry(codingDefinitions, {
			bindingResolver: bindingResolver({ project: "coding" }) as never,
		});
		const projectBoundSteps = parseChain(
			"plan-reviewer -> project/task-manager",
			boundRegistry,
		);
		const projectBoundTaskManager = projectBoundSteps[1];
		if (!projectBoundTaskManager || "kind" in projectBoundTaskManager) {
			expect.unreachable("Expected a project-bound task-manager stage");
		}
		expect(projectBoundTaskManager.agentReference?.resolved.qualifiedId).toBe(
			"coding/task-manager",
		);
		projectBoundTaskManager.name = "project-backlog";
		const cases = [
			{
				name: "no reviser sequential chain",
				steps: parseChain(
					"planner -> plan-reviewer -> task-manager",
					defaultRegistry,
				),
				registry: defaultRegistry,
			},
			{
				name: "intervening nonreviser chain",
				steps: parseChain(
					"planner -> plan-reviewer -> worker -> task-manager",
					defaultRegistry,
				),
				registry: defaultRegistry,
			},
			{
				name: "qualified stages",
				steps: parseChain(
					"coding/plan-reviewer -> coding/task-manager",
					defaultRegistry,
				),
				registry: defaultRegistry,
			},
			{
				name: "project-bound task manager",
				steps: projectBoundSteps,
				registry: boundRegistry,
			},
			...["[planner, task-manager]", "[task-manager, planner]"].map(
				(group) => ({
					name: `same-index reviser ${group}`,
					steps: parseChain(
						`planner -> plan-reviewer -> ${group}`,
						defaultRegistry,
					),
					registry: defaultRegistry,
				}),
			),
			...["[plan-reviewer, task-manager]", "[task-manager, plan-reviewer]"].map(
				(group) => ({
					name: `same-index reviewer ${group}`,
					steps: parseChain(group, defaultRegistry),
					registry: defaultRegistry,
				}),
			),
		] as const;

		for (const testCase of cases) {
			const projectRoot = await mkdtemp(
				join(
					tmpdir(),
					`chain-task-guard-${testCase.name.replaceAll(" ", "-")}-`,
				),
			);
			try {
				await writePlanReviewTarget({
					projectRoot,
					planSlug: "review-target",
				});
				const events: ChainEvent[] = [];
				spawnerRef.current = {
					spawn: vi.fn(async (config) => {
						const resolvedRole =
							config.agentReference?.resolved.qualifiedId ?? config.role;
						const role = resolvedRole.split("/").at(-1);
						if (role === "plan-reviewer") {
							return successfulTestSpawn(
								config.role,
								planReviewReport("review-target", 1),
							);
						}
						if (
							role === "planner" &&
							config.prompt.includes("Revision purpose:")
						) {
							return successfulTestSpawn(
								config.role,
								reviewRevisionReport("review-target", 1),
							);
						}
						return successfulTestSpawn(config.role);
					}),
					dispose: vi.fn(),
				};
				const result = await runChain(
					makeConfig(testCase.steps, {
						projectRoot,
						registry: testCase.registry,
						onEvent: (event) => events.push(event),
					}),
				);
				const spawnRoles = vi
					.mocked(spawnerRef.current.spawn)
					.mock.calls.map(([config]) =>
						(config.agentReference?.resolved.qualifiedId ?? config.role)
							.split("/")
							.at(-1),
					);
				const taskResult = result.stageResults.find(
					(stageResult) =>
						(
							stageResult.stage.agentReference?.resolved.qualifiedId ??
							stageResult.stage.name
						)
							.split("/")
							.at(-1) === "task-manager",
				);

				expect(spawnRoles, testCase.name).not.toContain("task-manager");
				expect(result.success, testCase.name).toBe(false);
				expect(result.errors[0], testCase.name).toBeTruthy();
				expect(taskResult, testCase.name).toMatchObject({
					success: false,
					iterations: 0,
					reviewRoundBlock: expect.objectContaining({
						reason: expect.any(String),
					}),
				});
				expect(taskResult?.error, testCase.name).toBeTruthy();
				if (testCase.name.startsWith("same-index reviser")) {
					expect(taskResult?.reviewRoundBlock, testCase.name).toMatchObject({
						reason: "nonpreceding-addressed-evidence",
						addressedAtTopologyIndex: 2,
						taskManagerTopologyIndex: 2,
					});
				}
				if (testCase.name.startsWith("same-index reviewer")) {
					expect(taskResult?.reviewRoundBlock, testCase.name).toMatchObject({
						reason: "missing-addressed-evidence",
						taskManagerTopologyIndex: 0,
					});
				}
				expect(
					events.some(
						(event) =>
							event.type === "unaddressed_review_round" &&
							event.stage === taskResult?.stage,
					),
					testCase.name,
				).toBe(true);

				const parallelEnd = events.find(
					(event) => event.type === "parallel_end",
				);
				if (parallelEnd?.type === "parallel_end") {
					expect(parallelEnd.success, testCase.name).toBe(false);
					expect(parallelEnd.error, testCase.name).toBeTruthy();
					expect(
						parallelEnd.results.filter(
							(stageResult) => !stageResult.stage.name.endsWith("task-manager"),
						),
						testCase.name,
					).toSatisfy((results: StageResult[]) =>
						results.every((stageResult) => stageResult.success),
					);
				}
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}

		for (const mutation of [
			{
				name: "newer assessable round",
				reason: "stale-addressed-evidence",
				apply(projectRoot: string) {
					writeFileSync(
						join(
							projectRoot,
							"missions",
							"plans",
							"review-target",
							"review-2.md",
						),
						"# Plan Review\n\n## Findings\n\n## Assessment\n\nReview complete.\n",
						"utf-8",
					);
				},
			},
			{
				name: "unreadable plan artifact",
				reason: "plan-artifact-io",
				apply(projectRoot: string) {
					const planPath = join(
						projectRoot,
						"missions",
						"plans",
						"review-target",
						"plan.md",
					);
					rmSync(planPath);
					mkdirSync(planPath);
				},
			},
			{
				name: "unsafe review artifact",
				reason: "unsafe-review-entry",
				apply(projectRoot: string) {
					const reviewPath = join(
						projectRoot,
						"missions",
						"plans",
						"review-target",
						"review.md",
					);
					rmSync(reviewPath);
					mkdirSync(reviewPath);
				},
			},
		] as const) {
			const projectRoot = await mkdtemp(
				join(
					tmpdir(),
					`chain-task-guard-${mutation.name.replaceAll(" ", "-")}-`,
				),
			);
			try {
				await writePlanReviewTarget({
					projectRoot,
					planSlug: "review-target",
				});
				let plannerEnds = 0;
				const events: ChainEvent[] = [];
				spawnerRef.current = reviewReportSpawner(
					planReviewReport("review-target", 1),
				);
				const result = await runChain(
					makeConfig(
						parseChain(
							"planner -> plan-reviewer -> planner -> task-manager",
							defaultRegistry,
						),
						{
							projectRoot,
							onEvent: (event) => {
								events.push(event);
								if (
									event.type === "stage_end" &&
									event.stage.name === "planner" &&
									event.result.success &&
									++plannerEnds === 2
								) {
									mutation.apply(projectRoot);
								}
							},
						},
					),
				);
				const taskResult = result.stageResults.at(-1);
				expect(result.success, mutation.name).toBe(false);
				expect(taskResult, mutation.name).toMatchObject({
					success: false,
					iterations: 0,
					reviewRoundBlock: { reason: mutation.reason },
				});
				expect(taskResult?.error, mutation.name).toBeTruthy();
				expect(result.errors, mutation.name).toEqual([taskResult?.error]);
				expect(
					vi
						.mocked(spawnerRef.current.spawn)
						.mock.calls.map(([config]) => config.role),
					mutation.name,
				).toEqual(["planner", "plan-reviewer", "planner"]);
				expect(events, mutation.name).toContainEqual(
					expect.objectContaining({
						type: "unaddressed_review_round",
						block: expect.objectContaining({ reason: mutation.reason }),
					}),
				);
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}

		const unchangedShapes = [
			[makeStage("task-manager", false)],
			parseChain("planner -> task-manager", defaultRegistry),
			parseChain("planner -> reviewer -> task-manager", defaultRegistry),
			...defaultRegistry
				.listAll()
				.map((definition) => [makeStage(definition.id, false)]),
		];
		for (const steps of unchangedShapes) {
			spawnerRef.current = createMockSpawner();
			const result = await runChain(makeConfig(steps));
			expect(result.success, `unchanged ${steps.length}-step shape`).toBe(true);
			expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(steps.length);
		}

		const projectRoot = await mkdtemp(
			join(tmpdir(), "chain-task-guard-prompt-"),
		);
		try {
			await writePlanReviewTarget({
				projectRoot,
				planSlug: "review-target",
			});
			spawnerRef.current = reviewReportSpawner(
				planReviewReport("review-target", 1),
			);
			const result = await runChain(
				makeConfig(
					parseChain(
						"planner -> plan-reviewer -> planner -> task-manager",
						defaultRegistry,
					),
					{ projectRoot },
				),
			);
			const taskSpawn = vi
				.mocked(spawnerRef.current.spawn)
				.mock.calls.find(([config]) => config.role === "task-manager")?.[0];
			expect(result.success).toBe(true);
			expect(taskSpawn?.prompt).toContain(
				'Bound plan-review target: {"planSlug":"review-target","reviewRound":1}.',
			);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("starts task decomposition only for earlier reviewer-bound addressed evidence", async () => {
		for (const findings of ["none", "referenced"] as const) {
			const projectRoot = await mkdtemp(
				join(tmpdir(), `chain-revision-addressed-${findings}-`),
			);
			try {
				await writePlanReviewTarget({ projectRoot, planSlug: "review-target" });
				const planPath = join(
					projectRoot,
					"missions",
					"plans",
					"review-target",
					"plan.md",
				);
				if (findings === "referenced") {
					await Promise.all([
						writeFile(
							planPath,
							`---
title: Review target
status: active
---

## Decision Log

- **D-001 - Address the review**
  - Decision: address review.md PR-001 and review.md PR-002.
  - Decided-by: derived
`,
							"utf-8",
						),
						writeFile(
							join(
								projectRoot,
								"missions",
								"plans",
								"review-target",
								"review.md",
							),
							`# Plan Review

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "High finding"
  plan_refs: D-001
  code_refs: lib/example.ts:1
  description: |
    Concrete description.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "Medium finding"
  plan_refs: D-001
  code_refs: tests/example.test.ts:1
  description: |
    Concrete description.

## Assessment

Review complete.
`,
							"utf-8",
						),
					]);
				}
				const planBeforeRun = await readFile(planPath, "utf-8");
				const events: ChainEvent[] = [];
				spawnerRef.current = {
					spawn: vi.fn(async (config) => {
						if (config.role === "plan-reviewer") {
							return successfulTestSpawn(
								config.role,
								planReviewReport("review-target", 1),
							);
						}
						if (config.prompt.includes("Revision purpose:")) {
							return successfulTestSpawn(
								config.role,
								reviewRevisionReport("review-target", 1),
							);
						}
						return successfulTestSpawn(config.role);
					}),
					dispose: vi.fn(),
				};
				const steps = parseChain(
					"planner -> plan-reviewer -> planner -> task-manager",
					defaultRegistry,
				);
				const result = await runChain(
					makeConfig(steps, {
						projectRoot,
						onEvent: (event) => events.push(event),
					}),
				);

				expect(result.success, findings).toBe(true);
				expect(result.errors, findings).toEqual([]);
				expect(
					vi
						.mocked(spawnerRef.current.spawn)
						.mock.calls.map(([config]) => config.role),
					findings,
				).toEqual(["planner", "plan-reviewer", "planner", "task-manager"]);
				expect(
					events.some((event) => event.type === "unaddressed_review_round"),
					findings,
				).toBe(false);
				expect(await readFile(planPath, "utf-8"), findings).toBe(planBeforeRun);

				spawnerRef.current = reviewReportSpawner(
					"Fresh run must repeat plan review.",
				);
				const freshResult = await runChain(makeConfig(steps, { projectRoot }));
				expect(freshResult.success, `${findings} fresh run`).toBe(false);
				expect(
					vi
						.mocked(spawnerRef.current.spawn)
						.mock.calls.map(([config]) => config.role),
					`${findings} fresh run`,
				).toEqual(["planner", "plan-reviewer"]);
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}
	});

	test("gates a looping revision stage once after its final iteration", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "chain-loop-revision-"));
		try {
			await writePlanReviewTarget({ projectRoot, planSlug: "review-target" });
			const createLoopingSteps = () => {
				const steps = parseChain(
					"planner -> plan-reviewer -> planner -> task-manager",
					defaultRegistry,
				);
				let completionChecks = 0;
				const revision = steps[2];
				if (!revision || "kind" in revision) {
					throw new Error("Expected a revision stage.");
				}
				steps[2] = {
					...revision,
					loop: true,
					completionCheck: async () => {
						completionChecks += 1;
						return completionChecks >= 3;
					},
				};
				return steps;
			};

			let plannerSpawns = 0;
			const addressedEvents: ChainEvent[] = [];
			spawnerRef.current = {
				spawn: vi.fn(async (config) => {
					if (config.role === "plan-reviewer") {
						return successfulTestSpawn(
							config.role,
							planReviewReport("review-target", 1),
						);
					}
					if (config.role === "planner") {
						plannerSpawns += 1;
						return successfulTestSpawn(
							config.role,
							plannerSpawns === 3
								? reviewRevisionReport("review-target", 1)
								: "Intermediate revision output without a report.",
						);
					}
					return successfulTestSpawn(config.role);
				}),
				dispose: vi.fn(),
			};
			const addressedResult = await runChain(
				makeConfig(createLoopingSteps(), {
					projectRoot,
					onEvent: (event) => addressedEvents.push(event),
				}),
			);

			expect(addressedResult.success).toBe(true);
			expect(addressedResult.stageResults[2]).toMatchObject({
				success: true,
				iterations: 2,
			});
			expect(
				vi
					.mocked(spawnerRef.current.spawn)
					.mock.calls.map(([config]) => config.role),
			).toEqual([
				"planner",
				"plan-reviewer",
				"planner",
				"planner",
				"task-manager",
			]);
			expect(
				addressedEvents.filter(
					(event) => event.type === "unaddressed_review_round",
				),
			).toEqual([]);

			plannerSpawns = 0;
			const omittedEvents: ChainEvent[] = [];
			spawnerRef.current = {
				spawn: vi.fn(async (config) => {
					if (config.role === "plan-reviewer") {
						return successfulTestSpawn(
							config.role,
							planReviewReport("review-target", 1),
						);
					}
					if (config.role === "planner") {
						plannerSpawns += 1;
						return successfulTestSpawn(
							config.role,
							plannerSpawns === 2
								? reviewRevisionReport("review-target", 1)
								: "Final revision output omitted the report.",
						);
					}
					return successfulTestSpawn(config.role);
				}),
				dispose: vi.fn(),
			};
			const omittedResult = await runChain(
				makeConfig(createLoopingSteps(), {
					projectRoot,
					onEvent: (event) => omittedEvents.push(event),
				}),
			);

			expect(omittedResult.success).toBe(false);
			expect(omittedResult.stageResults[2]).toMatchObject({
				success: false,
				iterations: 2,
				reviewRoundBlock: { reason: "missing-review-report" },
			});
			expect(omittedResult.stageResults[2]?.error).toBeTruthy();
			expect(omittedResult.errors).toEqual([
				omittedResult.stageResults[2]?.error,
			]);
			expect(
				vi
					.mocked(spawnerRef.current.spawn)
					.mock.calls.map(([config]) => config.role),
			).toEqual(["planner", "plan-reviewer", "planner", "planner"]);
			expect(
				omittedEvents.filter(
					(event) => event.type === "unaddressed_review_round",
				),
			).toHaveLength(1);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("replaces prior review state and ignores nonparticipating reviewers", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "chain-review-replace-"));
		try {
			await Promise.all(
				["target-a", "target-b"].map((planSlug) =>
					writePlanReviewTarget({ projectRoot, planSlug }),
				),
			);
			let participatingReviewer = 0;
			spawnerRef.current = {
				spawn: vi.fn(async (config) => {
					if (config.role !== "plan-reviewer") {
						return successfulTestSpawn(
							config.role,
							config.prompt.includes("Revision purpose:")
								? reviewRevisionReport(
										`target-${participatingReviewer === 1 ? "a" : "b"}`,
										1,
									)
								: `${config.role} completed`,
						);
					}
					participatingReviewer += 1;
					return successfulTestSpawn(
						config.role,
						planReviewReport(
							`target-${participatingReviewer === 1 ? "a" : "b"}`,
							1,
						),
					);
				}),
				dispose: vi.fn(),
			};
			const result = await runChain(
				makeConfig(
					parseChain(
						"planner -> plan-reviewer -> planner -> plan-reviewer -> planner",
						defaultRegistry,
					),
					{ projectRoot },
				),
			);
			const plannerPrompts = vi
				.mocked(spawnerRef.current.spawn)
				.mock.calls.filter(([config]) => config.role === "planner")
				.map(([config]) => config.prompt);

			expect(result.success).toBe(true);
			expect(plannerPrompts[1]).toContain('"planSlug":"target-a"');
			expect(plannerPrompts[2]).toContain('"planSlug":"target-b"');
			expect(plannerPrompts[2]).not.toContain('"planSlug":"target-a"');
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}

		spawnerRef.current = {
			spawn: vi.fn(async (config) =>
				successfulTestSpawn(
					config.role,
					config.role === "reviewer"
						? planReviewReport("ignored-target", 1)
						: `${config.role} completed`,
				),
			),
			dispose: vi.fn(),
		};
		const genericSteps = parseChain(
			"planner -> reviewer -> planner",
			defaultRegistry,
		);
		const genericResult = await runChain(makeConfig(genericSteps));
		const genericReviserPrompt = vi
			.mocked(spawnerRef.current.spawn)
			.mock.calls.at(-1)?.[0].prompt;
		expect(genericResult.success).toBe(true);
		expect(genericReviserPrompt).not.toContain("Bound plan-review target:");

		spawnerRef.current = createMockSpawner();
		const nonparticipatingResult = await runChain(
			makeConfig([makeStage("plan-reviewer", false)]),
		);
		expect(nonparticipatingResult.success).toBe(true);
		expect(
			nonparticipatingResult.stageResults[0]?.reviewRoundBlock,
		).toBeUndefined();
	});

	test("blocks ambiguous same-index review targets in either completion order", async () => {
		for (const delayedReviewer of [1, 2]) {
			const projectRoot = await mkdtemp(
				join(tmpdir(), "chain-review-ambiguous-"),
			);
			try {
				await Promise.all(
					["target-a", "target-b"].map((planSlug) =>
						writePlanReviewTarget({ projectRoot, planSlug }),
					),
				);
				let reviewerCount = 0;
				const completionOrder: number[] = [];
				spawnerRef.current = {
					spawn: vi.fn(async (config) => {
						if (config.role !== "plan-reviewer") {
							return successfulTestSpawn(config.role);
						}
						reviewerCount += 1;
						const reviewer = reviewerCount;
						if (reviewer === delayedReviewer) {
							await new Promise<void>((resolve) => setTimeout(resolve, 1));
						}
						completionOrder.push(reviewer);
						return successfulTestSpawn(
							`reviewer-${reviewer}`,
							planReviewReport(`target-${reviewer === 1 ? "a" : "b"}`, 1),
						);
					}),
					dispose: vi.fn(),
				};
				const result = await runChain(
					makeConfig(
						parseChain(
							"planner -> plan-reviewer[2] -> planner",
							defaultRegistry,
						),
						{ projectRoot },
					),
				);

				expect(completionOrder).toEqual(
					delayedReviewer === 1 ? [2, 1] : [1, 2],
				);
				expect(result.success).toBe(false);
				expect(result.stageResults).toHaveLength(3);
				expect(
					result.stageResults.find(
						(stage) =>
							stage.reviewRoundBlock?.reason === "ambiguous-review-target",
					),
				).toBeDefined();
				expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(3);
			} finally {
				await rm(projectRoot, { recursive: true, force: true });
			}
		}
	});

	test("accepts identical same-index review targets", async () => {
		const projectRoot = await mkdtemp(
			join(tmpdir(), "chain-review-identical-"),
		);
		try {
			await writePlanReviewTarget({ projectRoot, planSlug: "shared-target" });
			spawnerRef.current = reviewReportSpawner(
				planReviewReport("shared-target", 1),
			);
			const result = await runChain(
				makeConfig(
					parseChain("planner -> plan-reviewer[2] -> planner", defaultRegistry),
					{ projectRoot },
				),
			);

			expect(result.success).toBe(true);
			expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(4);
			const reviserPrompt = vi
				.mocked(spawnerRef.current.spawn)
				.mock.calls.at(-1)?.[0].prompt;
			expect(reviserPrompt).toContain('"planSlug":"shared-target"');
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("parallel first-stage members preserve role prompts with injected user request", async () => {
		const steps = parseChain(
			"[planner, reviewer] -> task-manager",
			defaultRegistry,
		);
		injectUserPrompt(steps, "focus on security");

		await runChain(makeConfig(steps));

		const spawnMock = spawnerRef.current?.spawn;
		expect(spawnMock).toBeDefined();
		if (!spawnMock) return;
		const calls = vi.mocked(spawnMock).mock.calls;
		const plannerCall = calls.find(([args]) => args.role === "planner")?.[0];
		const reviewerCall = calls.find(([args]) => args.role === "reviewer")?.[0];

		expect(plannerCall?.prompt).toBe(
			"Analyze the project and design an implementation plan.\n\nUser request: focus on security",
		);
		expect(reviewerCall?.prompt).toBe(
			"Review the current branch changes against main and write actionable findings.\n\nUser request: focus on security",
		);
	});

	test("stage failure stops chain", async () => {
		spawnerRef.current = createMockSpawner([
			{ success: true, sessionId: "session-1", messages: [] },
			{
				success: false,
				sessionId: "",
				messages: [],
				error: "stage 2 failed",
			},
		]);

		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(false);
		expect(result.errors).toContain("stage 2 failed");
	});

	test("unknown stage role fails chain immediately", async () => {
		const stages = [
			makeStage("unknown-role", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages);

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]?.success).toBe(false);
		expect(result.stageResults[0]?.error).toContain(
			'Unknown agent role "unknown-role"',
		);
	});

	test("emits chain_start and chain_end events", async () => {
		const events: ChainEvent[] = [];
		const stages = [makeStage("planner", false)];
		const config = makeConfig(stages, {
			onEvent: (event) => events.push(event),
		});

		await runChain(config);

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes[0]).toBe("chain_start");
		expect(eventTypes[eventTypes.length - 1]).toBe("chain_end");
	});

	test("abort signal between stages", async () => {
		const controller = new AbortController();

		// Abort after first stage
		let spawnCount = 0;
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				if (spawnCount === 1) {
					controller.abort();
				}
				return { success: true, sessionId: `s-${spawnCount}`, messages: [] };
			}),
			dispose: vi.fn(),
		};

		const stages = [makeStage("planner", false), makeStage("worker", false)];
		const config = makeConfig(stages, { signal: controller.signal });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
	});

	test("spawner disposed after execution", async () => {
		const stages = [makeStage("planner", false)];
		const config = makeConfig(stages);

		await runChain(config);

		expect(spawnerRef.current?.dispose).toHaveBeenCalledTimes(1);
	});

	test("one-shot stages do not consume loop iteration budget", async () => {
		// Chain: 2 one-shot stages then a loop stage with budget of 3.
		// Previously, each one-shot consumed 1 from the budget, leaving only 1
		// for the loop stage. Now one-shot stages are excluded from the budget.
		const completionCheck = vi.fn(async () => false); // never passes

		let spawnCount = 0;
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				return {
					success: true,
					sessionId: `s-${spawnCount}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
			makeStage("coordinator", true, completionCheck),
		];
		const config = makeConfig(stages, { maxTotalIterations: 3 });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(3);
		// One-shot stages still report iterations=1 in their results
		expect(result.stageResults[0]?.iterations).toBe(1);
		expect(result.stageResults[1]?.iterations).toBe(1);
		// Loop stage gets the full budget of 3, not 3 - 2 = 1
		expect(result.stageResults[2]?.iterations).toBe(3);
		expect(result.stageResults[2]?.success).toBe(false);
	});

	test("maxTotalIterations budget shared across stages", async () => {
		// First loop stage uses 2 iterations, second loop stage gets remaining 1
		let firstStageChecks = 0;
		const firstCheck = vi.fn(async () => {
			firstStageChecks++;
			return firstStageChecks >= 2; // passes after 2 iterations
		});

		const secondCheck = vi.fn(async () => false); // never passes

		let spawnCount = 0;
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				return {
					success: true,
					sessionId: `s-${spawnCount}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("coordinator", true, firstCheck),
			makeStage("worker", true, secondCheck),
		];
		const config = makeConfig(stages, { maxTotalIterations: 3 });

		const result = await runChain(config);

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		// First stage: 1 iteration (pre-check + post-iteration check reaches completion)
		expect(result.stageResults[0]?.iterations).toBe(1);
		// Second stage: remaining budget is 2 (3 - 1 = 2)
		expect(result.stageResults[1]?.iterations).toBe(2);
		expect(result.stageResults[1]?.success).toBe(false);
	});

	test("chain-level timeout stops execution between stages", async () => {
		vi.useFakeTimers();
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(FIXED_NOW);

		let spawnCount = 0;
		spawnerRef.current = {
			spawn: vi.fn(async () => {
				spawnCount++;
				// After first stage completes, advance time past the timeout
				if (spawnCount === 1) {
					vi.setSystemTime(FIXED_NOW + 5000);
				}
				return {
					success: true,
					sessionId: `s-${spawnCount}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const stages = [
			makeStage("planner", false),
			makeStage("task-manager", false),
			makeStage("worker", false),
		];
		const config = makeConfig(stages, { timeoutMs: 3000 });

		const result = await runChain(config);

		// Timeout skips remaining stages — only the first stage ran
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]?.success).toBe(true);
		// Chain reports success since no stage actually failed (timeout is
		// a silent exit, not an error — matching abort signal behavior)
		expect(result.success).toBe(true);
		expect(spawnCount).toBe(1);
	});
});

// ============================================================================
// Qualified Stage End-to-End Tests (parse + run with shared registry)
// ============================================================================

describe("qualified stage chain end-to-end", () => {
	function makeDef(
		id: string,
		loop: boolean,
		domain?: string,
	): AgentDefinition {
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
			domain,
		};
	}

	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	test("qualified one-shot stages parse and run successfully", async () => {
		const registry = new AgentRegistry([
			makeDef("designer", false, "ops"),
			makeDef("builder", false, "ops"),
		]);

		// Parse with the same registry that runChain will use
		const stages = parseChain("ops/designer -> ops/builder", registry);

		expect(stages).toEqual([
			{ name: "ops/designer", loop: false },
			{ name: "ops/builder", loop: false },
		]);

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
	});

	test("qualified loop stage gets loop: true from registry through parse + run", async () => {
		const registry = new AgentRegistry([
			makeDef("scheduler", false, "ops"),
			makeDef("orchestrator", true, "ops"),
		]);

		const stages = parseChain("ops/scheduler -> ops/orchestrator", registry);

		// Verify loop detection used the registry (not false positive)
		expect((stages[0] as ChainStage | undefined)?.loop).toBe(false);
		expect((stages[1] as ChainStage | undefined)?.loop).toBe(true);

		// Attach a completion check so the loop stage terminates
		const completionCheck = vi.fn(async () => true);
		const loopStage = stages[1] as ChainStage | undefined;
		if (loopStage) stages[1] = { ...loopStage, completionCheck };

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(true);
	});

	test("mixed qualified and unqualified names resolve through shared registry", async () => {
		const registry = new AgentRegistry([
			makeDef("planner", false, "coding"),
			makeDef("coordinator", true, "coding"),
		]);

		// "planner" unqualified resolves via scan-all, "coding/coordinator" qualified
		const stages = parseChain("planner -> coding/coordinator", registry);

		expect((stages[0] as ChainStage | undefined)?.loop).toBe(false);
		expect((stages[1] as ChainStage | undefined)?.loop).toBe(true);

		const completionCheck = vi.fn(async () => true);
		const loopStage2 = stages[1] as ChainStage | undefined;
		if (loopStage2) stages[1] = { ...loopStage2, completionCheck };

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
	});

	test("unknown qualified name fails at run time", async () => {
		const registry = new AgentRegistry([makeDef("designer", false, "ops")]);

		const stages = parseChain("ops/designer -> ops/missing", registry);

		const result = await runChain(makeConfig(stages, { registry }));

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(2);
		expect(result.stageResults[0]?.success).toBe(true);
		expect(result.stageResults[1]?.success).toBe(false);
		expect(result.stageResults[1]?.error).toContain(
			'Unknown agent role "ops/missing"',
		);
	});
});

// ============================================================================
// Stats Tracking Tests
// ============================================================================

/** Create a mock SpawnStats with distinguishable values. */
function makeMockStats(seed: number): SpawnStats {
	return {
		tokens: {
			input: seed * 100,
			output: seed * 50,
			cacheRead: seed * 10,
			cacheWrite: seed * 5,
			total: seed * 165,
		},
		cost: seed * 0.01,
		durationMs: seed * 1000,
		turns: seed,
		toolCalls: seed * 2,
	};
}

describe("stats tracking", () => {
	describe("runStage stats", () => {
		test("one-shot stage includes spawn stats in result", async () => {
			const stats = makeMockStats(1);
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.success).toBe(true);
			expect(result.stats).toEqual(stats);
		});

		test("one-shot stage has no stats when spawner returns none", async () => {
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
			]);
			const stage = makeStage("planner", false);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner);

			expect(result.stats).toBeUndefined();
		});

		test("loop stage aggregates stats across iterations", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			const stats3 = makeMockStats(3);

			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
				{ success: true, sessionId: "s-3", messages: [], stats: stats3 },
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 3,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.iterations).toBe(3);
			expect(result.stats).toBeDefined();
			// Sum of seeds 1+2+3 = 6
			expect(result.stats?.tokens.input).toBe(600);
			expect(result.stats?.tokens.output).toBe(300);
			expect(result.stats?.tokens.cacheRead).toBe(60);
			expect(result.stats?.tokens.cacheWrite).toBe(30);
			expect(result.stats?.tokens.total).toBe(990);
			expect(result.stats?.cost).toBeCloseTo(0.06);
			expect(result.stats?.durationMs).toBe(6000);
			expect(result.stats?.turns).toBe(6);
			expect(result.stats?.toolCalls).toBe(12);
		});

		test("loop stage includes partial stats on spawn failure", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const spawner = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{
					success: false,
					sessionId: "",
					messages: [],
					error: "crashed",
				},
			]);
			const completionCheck = vi.fn(async () => false);
			const stage = makeStage("coordinator", true, completionCheck);
			const config = makeConfig([stage]);

			const result = await runStage(stage, config, spawner, {
				maxTotalIterations: 5,
				deadlineMs: FIXED_NOW + 60_000,
			});

			expect(result.success).toBe(false);
			expect(result.stats).toBeDefined();
			expect(result.stats?.tokens.input).toBe(100);
			expect(result.stats?.cost).toBeCloseTo(0.01);
		});
	});

	describe("runChain stats", () => {
		test("chain result includes ChainStats with per-stage breakdown", async () => {
			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
			]);

			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages);

			const result = await runChain(config);

			expect(result.success).toBe(true);
			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(2);
			expect(result.stats?.stages[0]?.stageName).toBe("planner");
			expect(result.stats?.stages[0]?.stats).toEqual(stats1);
			expect(result.stats?.stages[0]?.iterations).toBe(1);
			expect(result.stats?.stages[1]?.stageName).toBe("task-manager");
			expect(result.stats?.stages[1]?.stats).toEqual(stats2);
			// Totals: sum of seeds 1+2 = 3
			expect(result.stats?.totalCost).toBeCloseTo(0.03);
			expect(result.stats?.totalTokens).toBe(495); // 165 + 330
			expect(result.stats?.totalDurationMs).toBe(3000);
		});

		test("chain_end event payload includes ChainStats", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const chainEnd = events.find((e) => e.type === "chain_end");
			expect(chainEnd).toBeDefined();
			if (
				!chainEnd ||
				chainEnd.type !== "chain_end" ||
				!chainEnd.result.stats
			) {
				throw new Error("Expected chain_end event with stats");
			}
			const stats = chainEnd.result.stats;
			expect(stats.totalCost).toBeCloseTo(0.01);
			expect(stats.totalTokens).toBe(165);
		});

		test("stage_stats event emitted after each stage", async () => {
			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
			]);

			const events: ChainEvent[] = [];
			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const stageStatsEvents = events.filter(
				(e) => e.type === "stage_stats",
			) as Extract<ChainEvent, { type: "stage_stats" }>[];
			expect(stageStatsEvents).toHaveLength(2);
			expect(stageStatsEvents[0]?.stage.name).toBe("planner");
			expect(stageStatsEvents[0]?.stats).toEqual(stats1);
			expect(stageStatsEvents[1]?.stage.name).toBe("task-manager");
			expect(stageStatsEvents[1]?.stats).toEqual(stats2);
		});

		test("stage_stats emitted before stage_end", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const eventTypes = events.map((e) => e.type);
			const statsIdx = eventTypes.indexOf("stage_stats");
			const endIdx = eventTypes.indexOf("stage_end");
			expect(statsIdx).toBeGreaterThan(-1);
			expect(endIdx).toBeGreaterThan(statsIdx);
		});

		test("no stage_stats event when spawn has no stats", async () => {
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
			]);

			const events: ChainEvent[] = [];
			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages, {
				onEvent: (event) => events.push(event),
			});

			await runChain(config);

			const stageStatsEvents = events.filter((e) => e.type === "stage_stats");
			expect(stageStatsEvents).toHaveLength(0);
		});

		test("ChainStats excludes stages without stats", async () => {
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [] },
				{
					success: true,
					sessionId: "s-2",
					messages: [],
					stats: makeMockStats(2),
				},
			]);

			const stages = [
				makeStage("planner", false),
				makeStage("task-manager", false),
			];
			const config = makeConfig(stages);

			const result = await runChain(config);

			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(1);
			expect(result.stats?.stages[0]?.stageName).toBe("task-manager");
		});

		test("stats accumulate across loop iterations in chain result", async () => {
			vi.useFakeTimers();
			const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();
			vi.setSystemTime(FIXED_NOW);

			const stats1 = makeMockStats(1);
			const stats2 = makeMockStats(2);
			const stats3 = makeMockStats(3);

			let spawnIdx = 0;
			const spawnResults: SpawnResult[] = [
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
				{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
				{ success: true, sessionId: "s-3", messages: [], stats: stats3 },
			];
			spawnerRef.current = {
				spawn: vi.fn(async () => {
					const fallbackResult = spawnResults[0];
					if (!fallbackResult) {
						throw new Error("Expected at least one spawn result");
					}
					const result = spawnResults[spawnIdx] ?? fallbackResult;
					spawnIdx++;
					return result;
				}),
				dispose: vi.fn(),
			};

			// One-shot stage followed by a 2-iteration loop stage
			let loopChecks = 0;
			const completionCheck = vi.fn(async () => {
				loopChecks++;
				return loopChecks >= 3; // pre-check(1), post-iter1(2), post-iter2(3) → done
			});

			const stages = [
				makeStage("planner", false),
				makeStage("coordinator", true, completionCheck),
			];
			const config = makeConfig(stages, { maxTotalIterations: 10 });

			const result = await runChain(config);

			expect(result.success).toBe(true);
			expect(result.stats).toBeDefined();
			expect(result.stats?.stages).toHaveLength(2);

			// First stage: one-shot, stats from seed=1
			expect(result.stats?.stages[0]?.stageName).toBe("planner");
			expect(result.stats?.stages[0]?.iterations).toBe(1);
			expect(result.stats?.stages[0]?.stats.cost).toBeCloseTo(0.01);

			// Second stage: loop with 2 iterations, stats from seeds 2+3
			expect(result.stats?.stages[1]?.stageName).toBe("coordinator");
			expect(result.stats?.stages[1]?.iterations).toBe(2);
			expect(result.stats?.stages[1]?.stats.cost).toBeCloseTo(0.05);
			expect(result.stats?.stages[1]?.stats.tokens.input).toBe(500); // 200+300

			// Totals: seeds 1+2+3
			expect(result.stats?.totalCost).toBeCloseTo(0.06);
			expect(result.stats?.totalTokens).toBe(990);
			expect(result.stats?.totalDurationMs).toBe(6000);
		});
	});

	describe("stats stay ephemeral", () => {
		test("stats are in-memory only — no persistence to disk", async () => {
			const stats1 = makeMockStats(1);
			spawnerRef.current = createMockSpawner([
				{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			]);

			const stages = [makeStage("planner", false)];
			const config = makeConfig(stages);

			const result = await runChain(config);

			// Stats exist on the returned object
			expect(result.stats).toBeDefined();
			// No disk writes — stats only live on the returned ChainResult/StageResult
			// (The chain runner writes no files; this test just asserts the stats
			// are returned in-memory and there's no serialization code.)
			expect(result.stageResults[0]?.stats).toEqual(stats1);
		});
	});
});

// ============================================================================
// Parallel Group Tests
// ============================================================================

describe("parallel group execution", () => {
	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	/** Build a parallel group step with a group syntax. */
	function makeParallelStep(
		...stages: [ChainStage, ChainStage, ...ChainStage[]]
	): ParallelGroupStep {
		return { kind: "parallel", stages, syntax: { kind: "group" } };
	}

	test("parallel members are launched concurrently, not sequentially", async () => {
		// Planner blocks until worker has started its spawn.
		// Sequential execution would deadlock; concurrent execution resolves normally.
		const resolvers: Array<() => void> = [];

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					// Block until worker unblocks us.
					await new Promise<void>((r) => resolvers.push(r));
				} else {
					// Worker unblocks planner, then completes.
					resolvers[0]?.();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		// Completing without deadlock proves worker was started while planner was blocked.
		expect(result.success).toBe(true);
		expect(spawnerRef.current.spawn).toHaveBeenCalledTimes(2);
	});

	test("parallel_start fires before member stage_start events; parallel_end fires after all stage_end/stage_stats", async () => {
		const events: ChainEvent[] = [];
		spawnerRef.current = createMockSpawner([
			{
				success: true,
				sessionId: "s-1",
				messages: [],
				stats: makeMockStats(1),
			},
			{
				success: true,
				sessionId: "s-2",
				messages: [],
				stats: makeMockStats(2),
			},
		]);

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		await runChain(makeConfig([step], { onEvent: (e) => events.push(e) }));

		const types = events.map((e) => e.type);
		const parallelStartIdx = types.indexOf("parallel_start");
		const parallelEndIdx = types.indexOf("parallel_end");
		const stageStartIndices: number[] = [];
		const stageEndIndices: number[] = [];
		const stageStatsIndices: number[] = [];
		types.forEach((type, index) => {
			if (type === "stage_start") {
				stageStartIndices.push(index);
			}
			if (type === "stage_end") {
				stageEndIndices.push(index);
			}
			if (type === "stage_stats") {
				stageStatsIndices.push(index);
			}
		});

		expect(parallelStartIdx).toBeGreaterThan(-1);
		expect(parallelEndIdx).toBeGreaterThan(-1);

		// parallel_start precedes every stage_start
		for (const idx of stageStartIndices) {
			expect(parallelStartIdx).toBeLessThan(idx);
		}

		// parallel_end follows every stage_end and stage_stats
		for (const idx of [...stageEndIndices, ...stageStatsIndices]) {
			expect(parallelEndIdx).toBeGreaterThan(idx);
		}
	});

	test("stageResults append members in declaration order regardless of completion order", async () => {
		// Worker finishes first; planner waits for worker before completing.
		let resolveWorker!: () => void;
		const workerDone = new Promise<void>((r) => {
			resolveWorker = r;
		});

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					await workerDone;
				} else {
					// Worker resolves before planner completes.
					resolveWorker();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		// Declaration order: planner first, worker second.
		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		expect(result.success).toBe(true);
		expect(result.stageResults).toHaveLength(2);
		// Worker finished first but results are in declaration order.
		expect(result.stageResults[0]?.stage.name).toBe("planner");
		expect(result.stageResults[1]?.stage.name).toBe("worker");
	});

	test("failing member causes parallel_end with success:false and stops subsequent steps", async () => {
		const events: ChainEvent[] = [];
		spawnerRef.current = createMockSpawner([
			{
				success: false,
				sessionId: "",
				messages: [],
				error: "planner-failed",
			},
			{ success: true, sessionId: "s-worker", messages: [] },
		]);

		const parallelStep = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const nextStep = makeStage("task-manager", false);

		const result = await runChain(
			makeConfig([parallelStep, nextStep], {
				onEvent: (e) => events.push(e),
			}),
		);

		// parallel_end carries success: false
		const parallelEnd = events.find((e) => e.type === "parallel_end") as
			| Extract<ChainEvent, { type: "parallel_end" }>
			| undefined;
		expect(parallelEnd?.success).toBe(false);

		// Both parallel members ran; task-manager was skipped.
		expect(result.stageResults).toHaveLength(2);
		expect(spawnerRef.current?.spawn).not.toHaveBeenCalledWith(
			expect.objectContaining({ role: "task-manager" }),
		);

		// Overall chain failed.
		expect(result.success).toBe(false);
		expect(result.errors).toContain("planner-failed");
	});

	test("all-settled: runner waits for all members before emitting parallel_end", async () => {
		let workerSettled = false;
		let parallelEndEmittedEarly = false;

		const events: ChainEvent[] = [];
		let signalPlannerFailed!: () => void;
		const plannerFailed = new Promise<void>((resolve) => {
			signalPlannerFailed = resolve;
		});
		let signalWorkerStarted!: () => void;
		const workerStarted = new Promise<void>((resolve) => {
			signalWorkerStarted = resolve;
		});
		let resolveWorker!: () => void;

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				if (spawnConfig.role === "planner") {
					// Fail immediately — no await.
					return {
						success: false,
						sessionId: "",
						messages: [],
						error: "planner-err",
					};
				}
				// Worker blocks until explicitly resolved.
				await new Promise<void>((resolve) => {
					resolveWorker = resolve;
					signalWorkerStarted();
				});
				workerSettled = true;
				return { success: true, sessionId: "s-worker", messages: [] };
			}),
			dispose: vi.fn(),
		};

		const onEvent = (e: ChainEvent) => {
			if (
				e.type === "stage_end" &&
				e.stage.name === "planner" &&
				!e.result.success
			) {
				signalPlannerFailed();
			}
			if (e.type === "parallel_end" && !workerSettled) {
				parallelEndEmittedEarly = true;
			}
			events.push(e);
		};

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const chainPromise = runChain(makeConfig([step], { onEvent }));

		await workerStarted;
		try {
			await plannerFailed;
			// Worker is still blocked — parallel_end must NOT have been emitted yet.
			expect(parallelEndEmittedEarly).toBe(false);
		} finally {
			resolveWorker();
			await chainPromise;
		}

		// parallel_end now exists and carries the failure.
		expect(workerSettled).toBe(true);
		expect(parallelEndEmittedEarly).toBe(false);
		const pe = events.find((e) => e.type === "parallel_end") as Extract<
			ChainEvent,
			{ type: "parallel_end" }
		>;
		expect(pe?.success).toBe(false);
	});

	test("abort signal between parallel group and next step prevents next step from starting", async () => {
		const controller = new AbortController();

		spawnerRef.current = {
			spawn: vi.fn(async (spawnConfig) => {
				// Either parallel member firing abort is sufficient; idempotent.
				if (spawnConfig.role === "planner" || spawnConfig.role === "worker") {
					controller.abort();
				}
				return {
					success: true,
					sessionId: `s-${spawnConfig.role}`,
					messages: [],
				};
			}),
			dispose: vi.fn(),
		};

		const parallelStep = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const afterStep = makeStage("task-manager", false);

		const result = await runChain(
			makeConfig([parallelStep, afterStep], { signal: controller.signal }),
		);

		// Both parallel members ran.
		expect(result.stageResults).toHaveLength(2);
		// task-manager was skipped because signal was aborted.
		expect(spawnerRef.current?.spawn).not.toHaveBeenCalledWith(
			expect.objectContaining({ role: "task-manager" }),
		);
		expect(result.success).toBe(false);
	});

	test("parallel stats sum tokens/cost/turns/toolCalls; totalDurationMs is not the sum of member durations", async () => {
		const stats1 = makeMockStats(1); // durationMs: 1000
		const stats2 = makeMockStats(2); // durationMs: 2000 — sum would be 3000

		spawnerRef.current = createMockSpawner([
			{ success: true, sessionId: "s-1", messages: [], stats: stats1 },
			{ success: true, sessionId: "s-2", messages: [], stats: stats2 },
		]);

		const step = makeParallelStep(
			makeStage("planner", false),
			makeStage("worker", false),
		);
		const result = await runChain(makeConfig([step]));

		expect(result.success).toBe(true);
		expect(result.stats).toBeDefined();

		// Tokens and cost are summed across parallel members (seeds 1+2).
		expect(result.stats?.totalCost).toBeCloseTo(0.03); // 0.01 + 0.02
		expect(result.stats?.totalTokens).toBe(495); // 165 + 330

		// Both stages are individually tracked in the breakdown.
		expect(result.stats?.stages).toHaveLength(2);
		const plannerStats = result.stats?.stages.find(
			(s) => s.stageName === "planner",
		);
		const workerStats = result.stats?.stages.find(
			(s) => s.stageName === "worker",
		);
		expect(plannerStats?.stats.turns).toBe(1); // seed 1
		expect(workerStats?.stats.turns).toBe(2); // seed 2
		expect(plannerStats?.stats.toolCalls).toBe(2); // seed 1 × 2
		expect(workerStats?.stats.toolCalls).toBe(4); // seed 2 × 2

		// totalDurationMs uses the group wall-clock (≈ max member duration with real
		// concurrency), NOT the sum of spawn-stats durations.
		const sumOfMemberDurations = stats1.durationMs + stats2.durationMs; // 3000
		expect(result.stats?.totalDurationMs).toBeLessThan(sumOfMemberDurations);
	});
});
