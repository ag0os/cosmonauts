import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runInline } from "../../lib/driver/driver.ts";
import { tailEvents } from "../../lib/driver/event-stream.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RuntimeDiagnostic,
	type StepRecord,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-durable-steps-");
const PLAN_SLUG = "durable-drive-steps";
const PARENT_SESSION_ID = "durable-steps-parent-session";

describe("driver durable step projection", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-004
	test("writes Drive task step records with configured backend identity and resume-safe dependencies", async () => {
		const fixture = await setupFixture({ taskCount: 3 });
		const resumedTaskId = fixture.taskIds[2] ?? fail("missing resumed task");
		const previousTaskId = fixture.taskIds[1] ?? fail("missing previous task");
		const store = new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		});
		await store.createRun({
			scope: PLAN_SLUG,
			runId: fixture.runId,
			status: "pending",
			eventsPath: "orchestration-events.jsonl",
			policy: {
				defaultBackend: { name: "codex" },
			},
			metadata: {
				source: "drive",
				driveTaskIds: fixture.taskIds,
				configuredBackendName: "codex",
			},
		});
		fixture.spec.taskIds = [resumedTaskId];
		fixture.spec.backendName = "codex";

		const result = await runDrive(fixture);
		const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);
		const storedEvents = await readStoredEvents(fixture.runId);
		const step = await requireStep(store, fixture.runId, resumedTaskId);
		const attempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: fixture.runId,
			stepId: resumedTaskId,
		});
		const diagnostics = await readStoredDiagnostics(fixture.runId);

		expect(result.outcome).toBe("completed");
		expect(legacyEvents.map((event) => event.type)).toEqual([
			"run_started",
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
			"finalize",
			"run_completed",
		]);
		expect(storedEvents.map((event) => event.event.type)).toEqual([
			"run_started",
			"step_ready",
			"step_tool_activity",
			"step_tool_activity",
			"step_started",
			"step_tool_activity",
			"step_completed",
			"run_completed",
		]);
		expect(
			storedEvents.find((event) => event.event.type === "step_started")?.event,
		).toMatchObject({ backend: "fake-backend" });

		expect(step).toMatchObject({
			id: resumedTaskId,
			runId: fixture.runId,
			kind: "drive",
			backend: { name: "codex" },
			dependsOn: [previousTaskId],
			status: "completed",
			inputArtifacts: [
				{
					id: "task",
					path: `missions/tasks/${resumedTaskId}.md`,
					kind: "task",
				},
				{
					id: "prompt",
					path: `prompts/${resumedTaskId}.md`,
					kind: "prompt",
				},
			],
			latestAttemptId: "attempt-001",
			result: {
				outcome: "success",
				summary: "finished durable step projection",
				nextAction: "continue",
			},
		});
		expect(step.outputArtifacts).toEqual([
			{
				id: "report",
				path: `steps/${resumedTaskId}/attempts/attempt-001/result.json`,
				kind: "report",
			},
		]);
		expect(step.result?.files).toEqual([
			{ path: "lib/driver/durable-steps.ts", status: "modified" },
		]);
		expect(step.result?.verification).toEqual([
			{
				command: "bun run test tests/driver/driver-durable-steps.test.ts",
				status: "pass",
			},
		]);
		expect(attempts).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: step.result,
			}),
		]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "drive_backend_identity_mismatch",
					details: expect.objectContaining({
						configuredBackendName: "codex",
						observedBackendName: "fake-backend",
						taskId: resumedTaskId,
					}),
				}),
			]),
		);
	});
});

interface Fixture {
	projectRoot: string;
	taskManager: TaskManager;
	taskIds: string[];
	runId: string;
	spec: DriverRunSpec;
}

async function setupFixture({
	taskCount,
}: {
	taskCount: number;
}): Promise<Fixture> {
	const projectRoot = temp.path;
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Durable Step Task ${index + 1}`,
			labels: [`plan:${PLAN_SLUG}`],
		});
		taskIds.push(task.id);
	}
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Drive envelope\n", "utf-8");

	const runId = `run-${taskIds.join("-").toLowerCase()}`;
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		runId,
	);
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds,
		backendName: "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });

	return { projectRoot, taskManager, taskIds, runId, spec };
}

async function runDrive(fixture: Fixture): Promise<DriverResult> {
	const backend: Backend = {
		name: "fake-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: async () => successResult(),
	};
	const handle = runInline(fixture.spec, {
		taskManager: fixture.taskManager,
		backend,
		activityBus,
		cosmonautsRoot: fixture.projectRoot,
	});
	return await handle.result;
}

function successResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [{ path: "lib/driver/durable-steps.ts", change: "modified" }],
				verification: [
					{
						command: "bun run test tests/driver/driver-durable-steps.test.ts",
						status: "pass",
					},
				],
				notes: "finished durable step projection",
			}),
			"```",
			"outcome: success",
		].join("\n"),
		durationMs: 1,
	};
}

async function readLegacyEvents(path: string): Promise<DriverEvent[]> {
	return (await tailEvents(path)).events;
}

async function readStoredEvents(
	runId: string,
): Promise<StoredOrchestrationEvent[]> {
	return (await readStoredJsonl(runId)).filter(isStoredOrchestrationEvent);
}

async function readStoredDiagnostics(
	runId: string,
): Promise<RuntimeDiagnostic[]> {
	return readStoredJsonl(runId).then((records) =>
		records.filter(isStoredDiagnostic).map((record) => record.diagnostic),
	);
}

async function readStoredJsonl(runId: string): Promise<unknown[]> {
	const raw = await readFile(
		join(
			temp.path,
			"missions",
			"sessions",
			PLAN_SLUG,
			"runs",
			runId,
			"orchestration-events.jsonl",
		),
		"utf-8",
	);
	return raw
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown);
}

async function requireStep(
	store: FileRunStore,
	runId: string,
	stepId: string,
): Promise<StepRecord> {
	const step = await store.readStepRecord({
		scope: PLAN_SLUG,
		runId,
		stepId,
	});
	if (!step) {
		throw new Error(`Missing step record: ${stepId}`);
	}
	return step;
}

function isStoredOrchestrationEvent(
	value: unknown,
): value is StoredOrchestrationEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		"seq" in value &&
		"event" in value
	);
}

function isStoredDiagnostic(
	value: unknown,
): value is { diagnostic: RuntimeDiagnostic } {
	return typeof value === "object" && value !== null && "diagnostic" in value;
}

function fail(message: string): never {
	throw new Error(message);
}
