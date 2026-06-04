import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runDriveOnGraph } from "../../lib/driver/drive-graph-runner.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepAttemptRecord,
	type StepRecord,
	type StepResult,
} from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-on-graph-acceptance-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-on-graph-acceptance-parent";

describe("Drive-on-graph acceptance", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-021
	test("survives scheduler host death and resumes a large sequential drive graph", async () => {
		const fixture = await setupFixture("large-resume", 12);
		const firstController = new AbortController();
		const firstBackend = createBackend({
			onRun: async (invocation, runNumber) => {
				if (runNumber === 6) {
					await Promise.resolve();
					firstController.abort(new Error("simulated scheduler host death"));
					return new Promise((_, reject) => {
						setTimeout(() => reject(new Error("host process terminated")), 0);
					});
				}
				return successfulBackendResult(`completed ${invocation.taskId}`);
			},
		});

		const interrupted = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, firstBackend, firstController.signal),
		);
		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const ref = { scope: PLAN_SLUG, runId: fixture.spec.runId };
		const runningAtDeath = await oneRunningDriveStep(store, fixture.spec.runId);
		const completedBeforeResume = await completedStepIds(
			store,
			fixture.spec.runId,
		);
		await persistTerminalAttemptEvidence(store, runningAtDeath);

		const resumedBackend = createBackend();
		const result = await runDriveOnGraph(
			{
				...fixture.spec,
				remainingTaskIds: fixture.taskIds.slice(6),
			},
			createRunContext(fixture, resumedBackend, new AbortController().signal),
		);
		const reloadedRun = await store.loadRun(ref);
		const graph = await store.readRunGraph(ref);
		const steps = await store.listStepRecords(ref);
		const schedulerState = await store.readSchedulerState(ref);
		const finalEvents = await readLegacyEvents(fixture.spec.eventLogPath);

		expect(interrupted).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
		});
		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: fixture.taskIds.length,
			tasksBlocked: 0,
		});
		expect(reloadedRun?.metadata?.driveTaskIds).toEqual(fixture.taskIds);
		expect(graph.graph.steps).toHaveLength(fixture.taskIds.length * 2);
		expect(graph.diagnostics).toEqual([]);
		expect(steps.every((step) => step.status === "completed")).toBe(true);
		expect(schedulerState.readyStepIds).toEqual([]);
		expect(Object.keys(schedulerState.leasesByStepId)).toEqual([]);
		expect(Object.keys(schedulerState.heartbeatsByStepId)).toContain(
			runningAtDeath.id,
		);
		expect(
			await store.readStepHeartbeat({
				...ref,
				stepId: runningAtDeath.id,
			}),
		).toBeDefined();
		await expect(
			stat(join(fixture.spec.workdir, "graph.json")),
		).resolves.toBeTruthy();
		await expect(
			stat(join(fixture.spec.workdir, "pending-finalization.json")),
		).rejects.toMatchObject({ code: "ENOENT" });

		expect(firstBackend.startedTaskIds).toEqual(fixture.taskIds.slice(0, 6));
		expect(resumedBackend.startedTaskIds).toEqual(fixture.taskIds.slice(6));
		expect(new Set(firstBackend.startedTaskIds).size).toBe(
			firstBackend.startedTaskIds.length,
		);
		expect(new Set(resumedBackend.startedTaskIds).size).toBe(
			resumedBackend.startedTaskIds.length,
		);
		expect(completedBeforeResume).toEqual(
			expect.arrayContaining([
				...fixture.taskIds.slice(0, 5),
				...fixture.taskIds
					.slice(0, 5)
					.map((taskId) => `finalizer-task-status-${taskId}`),
			]),
		);
		expect(
			finalEvents.filter((event) => event.type === "task_done"),
		).toHaveLength(fixture.taskIds.length);
		expect(finalEvents.filter((event) => event.type === "commit_made")).toEqual(
			[],
		);
		expect(
			JSON.parse(
				await readFile(
					join(fixture.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			),
		).toEqual(result);
	});
});

interface Fixture {
	projectRoot: string;
	sessionsRoot: string;
	spec: DriverRunSpec;
	taskIds: string[];
	taskManager: TaskManager;
	events: DriverEvent[];
}

async function setupFixture(name: string, taskCount: number): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Large graph task ${index + 1}`,
			description: "Acceptance fixture task.",
		});
		taskIds.push(task.id);
	}
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds,
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		taskTimeoutMs: 10,
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	return {
		projectRoot,
		sessionsRoot,
		spec,
		taskIds,
		taskManager,
		events: [],
	};
}

function createRunContext(
	fixture: Fixture,
	backend: Backend,
	abortSignal: AbortSignal,
) {
	return {
		taskManager: fixture.taskManager,
		backend,
		eventSink: async (event: DriverEvent) => {
			fixture.events.push(event);
			await mkdir(dirname(fixture.spec.eventLogPath), { recursive: true });
			await appendFile(
				fixture.spec.eventLogPath,
				`${JSON.stringify(event)}\n`,
				"utf-8",
			);
		},
		parentSessionId: fixture.spec.parentSessionId,
		runId: fixture.spec.runId,
		abortSignal,
		cosmonautsRoot: resolve("."),
		mode: "inline" as const,
	};
}

function createBackend(
	options: {
		onRun?: (
			invocation: BackendInvocation,
			runNumber: number,
		) => Promise<BackendRunResult>;
	} = {},
): Backend & { startedTaskIds: string[] } {
	const startedTaskIds: string[] = [];
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		startedTaskIds,
		async run(invocation) {
			startedTaskIds.push(invocation.taskId);
			return (
				(await options.onRun?.(invocation, startedTaskIds.length)) ??
				successfulBackendResult(`completed ${invocation.taskId}`)
			);
		},
	};
}

function successfulBackendResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes,
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

async function oneRunningDriveStep(
	store: FileRunStore,
	runId: string,
): Promise<StepRecord & { latestAttemptId: string }> {
	const running = (
		await store.listStepRecords({ scope: PLAN_SLUG, runId })
	).filter((step) => step.kind === "drive" && step.status === "running");
	expect(running).toHaveLength(1);
	const step = running[0];
	if (!step?.latestAttemptId) {
		throw new Error("Running step is missing latestAttemptId.");
	}
	return step as StepRecord & { latestAttemptId: string };
}

async function completedStepIds(
	store: FileRunStore,
	runId: string,
): Promise<string[]> {
	return (await store.listStepRecords({ scope: PLAN_SLUG, runId }))
		.filter((step) => step.status === "completed")
		.map((step) => step.id);
}

async function persistTerminalAttemptEvidence(
	store: FileRunStore,
	step: StepRecord & { latestAttemptId: string },
): Promise<StepAttemptRecord> {
	const result: StepResult = {
		outcome: "success",
		summary: `completed ${step.id} after host death`,
		artifacts: [
			{
				id: `drive-output:${step.id}:${step.latestAttemptId}`,
				path: `steps/${step.id}/attempts/${step.latestAttemptId}.json`,
				kind: "drive-task-output",
			},
		],
		nextAction: "continue",
	};
	return store.writeStepAttemptRecord(
		{ scope: PLAN_SLUG, runId: step.runId, stepId: step.id },
		{
			attemptId: step.latestAttemptId,
			startedAt: step.heartbeat?.at ?? "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:00:01.000Z",
			result,
		},
	);
}

async function readLegacyEvents(
	path: string,
): Promise<Array<{ type: string }>> {
	return (await readFile(path, "utf-8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { type: string });
}
