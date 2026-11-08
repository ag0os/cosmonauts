// Content acceptance retained until the corresponding deletion PR.

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
import { createDefaultCompletionCheck } from "../../bundled/coding/chain-completion.ts";
import { getDefaultStagePrompt } from "../../bundled/coding/chain-prompts.ts";
import chains from "../../bundled/coding/chains.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain, runStage } from "../../lib/orchestration/chain-runner.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";
import {
	PLAN_REVIEW_REPORT_TOKEN,
	parseReviewReportLine,
	REVIEW_REVISION_REPORT_TOKEN,
} from "../../lib/orchestration/review-revision.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainStage,
	ChainStep,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { parseCodingChain, withCodingChain } from "../helpers/content-chain.ts";

/**
 * Tests for chain-runner.ts
 * Covers runStage (one-shot and loop modes), runChain (with mocked spawner module),
 * review gates, and event emission.
 */

async function initQualityReviewRepository(projectRoot: string): Promise<void> {
	const { execFileSync } = await import("node:child_process");
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: projectRoot });
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
	git("add", ".gitignore");
	git("commit", "-qm", "base");
}

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
	makeCodingDef("spec-writer", false),
	makeCodingDef("integration-verifier", false),
	makeCodingDef("fixer", false),
]);

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

describe("runStage", () => {
	describe("loop (loop=true)", () => {
		const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();

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
				const result = await runStage(stage, withCodingChain(config), spawner, {
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
				const result = await runStage(stage, withCodingChain(config), spawner, {
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

		async function runDefaultCoordinator(
			tmpDir: string,
			spawner: ReturnType<typeof createMockSpawner>,
		) {
			const stage = makeStage("coordinator", true);
			const config = makeConfig([stage], {
				projectRoot: tmpDir,
				completionLabel: "plan:alpha",
			});
			return runStage(stage, withCodingChain(config), spawner, {
				maxTotalIterations: 10,
				deadlineMs: FIXED_NOW + 60_000,
			});
		}

		test("fails fast and names Blocked tasks beside Cancelled ones", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-cancelled-blocked-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({ title: "A", labels: ["plan:alpha"] });
			const taskB = await tm.createTask({ title: "B", labels: ["plan:alpha"] });
			await tm.updateTask(taskA.id, { status: "Cancelled" });
			await tm.updateTask(taskB.id, { status: "Blocked" });
			const spawner = createMockSpawner();

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("No actionable tasks");
				expect(result.error).toContain(`Blocked: ${taskB.id}`);
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("fails fast and names a To Do task's Cancelled dependency", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-cancelled-dep-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({ title: "A", labels: ["plan:alpha"] });
			const taskB = await tm.createTask({
				title: "B",
				labels: ["plan:alpha"],
				dependencies: [taskA.id],
			});
			const taskC = await tm.createTask({
				title: "C",
				labels: ["plan:alpha"],
			});
			await tm.updateTask(taskA.id, { status: "Cancelled" });
			await tm.updateTask(taskC.id, { status: "Blocked" });
			const spawner = createMockSpawner();

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(0);
				expect(result.error).toContain("No actionable tasks");
				expect(result.error).toContain(
					`Stranded: ${taskB.id} (${taskA.id}: Cancelled)`,
				);
				expect(result.error).toContain(`Blocked: ${taskC.id}`);
				expect(spawner.spawn).not.toHaveBeenCalled();
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("stops after the iteration that leaves no actionable task", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-becomes-stuck-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({ title: "A", labels: ["plan:alpha"] });
			await tm.createTask({
				title: "B",
				labels: ["plan:alpha"],
				dependencies: [taskA.id],
			});
			const spawner = createMockSpawner();
			vi.mocked(spawner.spawn).mockImplementation(async () => {
				await tm.updateTask(taskA.id, { status: "Cancelled" });
				return { success: true, sessionId: "session-1", messages: [] };
			});

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(false);
				expect(result.iterations).toBe(1);
				expect(result.error).toContain("No actionable tasks");
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("keeps iterating while a To Do task's dependencies are all Done", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-ready-dep-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const taskA = await tm.createTask({ title: "A", labels: ["plan:alpha"] });
			const taskB = await tm.createTask({
				title: "B",
				labels: ["plan:alpha"],
				dependencies: [taskA.id],
			});
			await tm.updateTask(taskA.id, { status: "Done" });
			const spawner = createMockSpawner();
			vi.mocked(spawner.spawn).mockImplementation(async () => {
				await tm.updateTask(taskB.id, { status: "Done" });
				return { success: true, sessionId: "session-1", messages: [] };
			});

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(true);
				expect(result.iterations).toBe(1);
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("keeps re-invoking the coordinator while every task is Done but a criterion is unchecked", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-done-unchecked-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const task = await tm.createTask({
				title: "A",
				labels: ["plan:alpha"],
				acceptanceCriteria: ["Ship the behavior"],
			});
			await tm.updateTask(task.id, { status: "Done" });
			const spawner = createMockSpawner();
			vi.mocked(spawner.spawn).mockImplementation(async () => {
				await tm.updateTask(task.id, {
					acceptanceCriteria: [
						{ index: 1, text: "Ship the behavior", checked: true },
					],
				});
				return { success: true, sessionId: "session-1", messages: [] };
			});

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(true);
				expect(result.iterations).toBe(1);
				expect(spawner.spawn).toHaveBeenCalledTimes(1);
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});

		test("keeps re-invoking the coordinator when a Cancelled task sits beside a Done task with an unchecked criterion", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_NOW);

			const tmpDir = await mkdtemp(
				join(tmpdir(), "chain-runner-stage-cancelled-done-unchecked-"),
			);
			const tm = new TaskManager(tmpDir);
			await tm.init();
			const cancelled = await tm.createTask({
				title: "Dropped",
				labels: ["plan:alpha"],
			});
			await tm.updateTask(cancelled.id, { status: "Cancelled" });
			const task = await tm.createTask({
				title: "A",
				labels: ["plan:alpha"],
				acceptanceCriteria: ["Ship the behavior"],
			});
			await tm.updateTask(task.id, { status: "Done" });
			const spawner = createMockSpawner();
			vi.mocked(spawner.spawn).mockImplementation(async () => {
				await tm.updateTask(task.id, {
					acceptanceCriteria: [
						{ index: 1, text: "Ship the behavior", checked: true },
					],
				});
				return { success: true, sessionId: "session-1", messages: [] };
			});

			try {
				const result = await runDefaultCoordinator(tmpDir, spawner);

				expect(result.success).toBe(true);
				expect(spawner.spawn).toHaveBeenCalledTimes(1);
			} finally {
				await rm(tmpDir, { recursive: true, force: true });
			}
		});
	});
});

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

describe("runChain", () => {
	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test.each(
		chains,
	)("$name named chain reaches a durable QM findings report", async (chain) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "named-qm-chain-"));
		try {
			await initQualityReviewRepository(projectRoot);
			await writePlanReviewTarget({ projectRoot, planSlug: "example" });
			spawnerRef.current = reviewReportSpawner(planReviewReport("example", 1));
			const steps = parseCodingChain(chain.chain ?? "", defaultRegistry);
			for (const step of steps) {
				if (!("kind" in step) && step.name === "coordinator") {
					step.completionCheck = async () => true;
				}
			}
			const result = await runChain(
				withCodingChain(
					makeConfig(steps, {
						projectRoot,
						completionLabel: "plan:example",
						terminalGateContext: {
							execute: async () => ({
								markdown: renderQualityReviewReport({
									verdict: "not-ready",
									reason: "assessed",
								}),
							}),
						},
					}),
				),
			);
			expect(result.success).toBe(true);
			expect(result.stageResults.at(-1)?.artifacts?.[0]?.id).toBe(
				"qm/final.md",
			);
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"plans",
						"example",
						"qm-runs",
						`${result.run?.runId}.md`,
					),
					"utf8",
				),
			).toContain("Verdict: not-ready");
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("delegates a terminal QM to its own durable run before any QM session", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-"));
		try {
			const result = await runChain(
				withCodingChain(
					makeConfig(
						parseCodingChain("planner -> quality-manager", defaultRegistry),
						{
							projectRoot,
							completionLabel: "plan:example",
						},
					),
				),
			);
			expect(result.run?.runId).toMatch(/^qm-/);
			expect(result.stageResults.at(-1)?.run).toEqual(result.run);
			expect(result.stageResults.at(-1)?.artifacts?.[0]?.id).toBe(
				"qm/final.md",
			);
			expect(spawnerRef.current?.spawn).toHaveBeenCalledTimes(1);
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"plans",
						"example",
						"qm-runs",
						`${result.run?.runId}.md`,
					),
					"utf8",
				),
			).toContain("Verdict: refused");
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("refuses non-terminal QM before any stage session", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-placement-"));
		try {
			const result = await runChain(
				withCodingChain(
					makeConfig(parseChain("quality-manager -> planner"), {
						projectRoot,
					}),
				),
			);
			expect(result.success).toBe(false);
			expect(result.run?.runId).toMatch(/^qm-/);
			expect(spawnerRef.current?.spawn).not.toHaveBeenCalled();
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"sessions",
						"chain",
						"runs",
						`${result.run?.runId}`,
						"artifacts",
						"qm",
						"final.md",
					),
					"utf8",
				),
			).toContain("Verdict: refused");
			await expect(
				readdir(join(projectRoot, "missions", "plans")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("writes the misplaced QM refusal even beside an unknown agent", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-placement-"));
		try {
			const result = await runChain(
				withCodingChain(
					makeConfig(parseChain("quality-manager -> unknown-actor"), {
						projectRoot,
					}),
				),
			);
			expect(result.success).toBe(false);
			expect(result.run?.runId).toMatch(/^qm-/);
			expect(spawnerRef.current?.spawn).not.toHaveBeenCalled();
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"sessions",
						"chain",
						"runs",
						`${result.run?.runId}`,
						"artifacts",
						"qm",
						"final.md",
					),
					"utf8",
				),
			).toContain("Verdict: refused");
			await expect(
				readdir(join(projectRoot, "missions", "plans")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("leaves plans byte-identical when QM plan context is ambiguous", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-ambiguous-"));
		try {
			const result = await runChain(
				withCodingChain(
					makeConfig(parseCodingChain("quality-manager", defaultRegistry), {
						projectRoot,
						completionLabel: "plan:first",
						planSlug: "second",
					}),
				),
			);
			expect(result.run?.runId).toMatch(/^qm-/);
			await expect(
				readdir(join(projectRoot, "missions", "plans")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("refuses a forged stage reference that would redirect a non-QM stage to QM", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-forged-"));
		try {
			const forged = {
				...makeStage("planner", false),
				agentReference:
					defaultRegistry.resolveReference("quality-manager")?.reference,
			};
			const result = await runChain(
				withCodingChain(makeConfig([forged], { projectRoot })),
			);
			expect(result.success).toBe(false);
			expect(result.run?.runId).toMatch(/^qm-/);
			expect(spawnerRef.current?.spawn).not.toHaveBeenCalled();
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test.each([
		"ready",
		"not-ready",
	] as const)("reports an unconfigured %s QM assessment through an inline chain", async (verdict) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-assessment-"));
		try {
			await initQualityReviewRepository(projectRoot);
			const result = await runChain(
				withCodingChain(
					makeConfig(parseCodingChain("quality-manager", defaultRegistry), {
						projectRoot,
						completionLabel: "plan:example",
						terminalGateContext: {
							execute: async () => ({
								markdown: renderQualityReviewReport({
									verdict,
									reason: "assessed",
								}),
							}),
						},
					}),
				),
			);
			expect(result.success).toBe(true);
			expect(result.run?.runId).toMatch(/^qm-/);
			expect(result.stageResults[0]?.artifacts?.[0]?.id).toBe("qm/final.md");
			expect(
				await readFile(
					join(
						projectRoot,
						"missions",
						"plans",
						"example",
						"qm-runs",
						`${result.run?.runId}.md`,
					),
					"utf8",
				),
			).toContain("Verdict: not-ready");
			const raw = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.run?.runId ?? "",
					"artifacts",
					"qm",
					"raw-final.md",
				),
				"utf8",
			);
			expect(raw).toContain(`Verdict: ${verdict}`);
			expect(spawnerRef.current?.spawn).not.toHaveBeenCalled();
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test.each([
		"integrity-failure",
		"cancellation",
	] as const)("persists %s through an inline QM chain", async (scenario) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "inline-qm-terminal-"));
		const controller = new AbortController();
		try {
			await initQualityReviewRepository(projectRoot);
			const result = await runChain(
				withCodingChain(
					makeConfig(parseCodingChain("quality-manager", defaultRegistry), {
						projectRoot,
						signal: controller.signal,
						terminalGateContext: {
							execute: async () => {
								if (scenario === "cancellation") controller.abort();
								return {
									markdown:
										scenario === "cancellation"
											? renderQualityReviewReport({
													verdict: "ready",
													reason: "clear",
												})
											: "Verdict: ready\nMissing sections",
								};
							},
						},
					}),
				),
			);
			expect(result.success).toBe(false);
			const report = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					`${result.run?.runId}`,
					"artifacts",
					"qm",
					"final.md",
				),
				"utf8",
			);
			expect(report).toContain("Verdict: failed");
			if (scenario === "cancellation")
				expect(report).toContain("Caller cancellation");
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});
});

/** Create a mock SpawnStats with distinguishable values. */

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
