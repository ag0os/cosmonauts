import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runInline } from "../../lib/driver/driver.ts";
import {
	createDriveStepProjector,
	type DriveStepProjector,
} from "../../lib/driver/durable-steps.ts";
import { tailEvents } from "../../lib/driver/event-stream.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RunRecord,
	type StepRecord,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("driver-durable-finalizers-");
const PLAN_SLUG = "durable-finalizers";
const PARENT_SESSION_ID = "durable-finalizers-parent-session";
const RUN_ID = "run-durable-finalizers";
const TASK_ID = "TASK-1";
const SECOND_TASK_ID = "TASK-2";

describe("Drive durable finalizer projection", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-007
	test("projects Drive finalization phases into generic finalizer step records", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			metadata: {
				driveTaskIds: [TASK_ID, SECOND_TASK_ID],
				configuredBackendName: "codex",
			},
		});
		const projector = createProjector(store, record, [TASK_ID, SECOND_TASK_ID]);

		await projector.project(event("task_started", { taskId: TASK_ID }));
		await projector.project(
			event("spawn_started", { taskId: TASK_ID, backend: "codex" }),
		);
		await projector.project(
			event("spawn_completed", {
				taskId: TASK_ID,
				report: {
					outcome: "success",
					files: [{ path: "lib/example.ts", change: "modified" }],
					verification: [{ command: "bun run test", status: "pass" }],
					notes: "implemented finalizer projection",
				},
			}),
		);
		await projector.project(
			event("finalize", {
				taskId: TASK_ID,
				phase: "commit",
				status: "started",
				details: { subject: "TASK-1: implement finalizer projection" },
			}),
		);
		await projector.project(
			event("commit_made", {
				taskId: TASK_ID,
				sha: "abc123",
				subject: "TASK-1: implement finalizer projection",
			}),
		);
		await projector.project(
			event("finalize", {
				taskId: TASK_ID,
				phase: "commit",
				status: "passed",
				details: {
					sha: "abc123",
					subject: "TASK-1: implement finalizer projection",
				},
			}),
		);
		await projector.project(
			event("finalize", {
				taskId: TASK_ID,
				phase: "task_status",
				status: "started",
				details: { sha: "abc123" },
			}),
		);
		await projector.project(
			event("finalize", {
				taskId: TASK_ID,
				phase: "task_status",
				status: "passed",
				details: { sha: "abc123" },
			}),
		);
		await projector.project(
			event("finalize", {
				phase: "state_commit",
				status: "started",
			}),
		);
		await projector.project(
			event("finalize", {
				phase: "state_commit",
				status: "skipped",
				details: { reason: "not_all_tasks_done" },
			}),
		);

		const sourceCommit = await requireStep(
			store,
			record,
			"finalizer-source-commit-TASK-1",
		);
		const taskStatus = await requireStep(
			store,
			record,
			"finalizer-task-status-TASK-1",
		);
		const stateCommit = await requireStep(
			store,
			record,
			"finalizer-state-commit",
		);
		const taskStep = await requireStep(store, record, TASK_ID);

		expect([sourceCommit.id, taskStatus.id, stateCommit.id]).toEqual([
			"finalizer-source-commit-TASK-1",
			"finalizer-task-status-TASK-1",
			"finalizer-state-commit",
		]);
		for (const step of [sourceCommit, taskStatus, stateCommit]) {
			expect(step.kind).toBe("finalizer");
			expect(step.backend).toEqual(
				expect.objectContaining({ name: "shell-command" }),
			);
			expect(step.status).toBe("completed");
			expect(step.result).toMatchObject({
				outcome: "success",
				nextAction: "continue",
			});
		}
		expect(sourceCommit.backend.options).toEqual({ drivePhase: "commit" });
		expect(taskStatus.backend.options).toEqual({ drivePhase: "task_status" });
		expect(stateCommit.backend.options).toEqual({
			drivePhase: "state_commit",
		});
		expect(sourceCommit.dependsOn).toEqual([TASK_ID]);
		expect(taskStatus.dependsOn).toEqual([TASK_ID]);
		expect(stateCommit.dependsOn).toEqual([TASK_ID, SECOND_TASK_ID]);
		expect(sourceCommit.result?.commits).toEqual([
			{
				sha: "abc123",
				subject: "TASK-1: implement finalizer projection",
			},
		]);
		expect(taskStatus.result?.commits).toEqual([{ sha: "abc123" }]);
		expect(sourceCommit.outputArtifacts).toContainEqual({
			id: "commit:abc123",
			path: "abc123",
			kind: "commit",
			metadata: {
				sha: "abc123",
				subject: "TASK-1: implement finalizer projection",
			},
		});
		expect(stateCommit.result?.summary).toContain("not_all_tasks_done");
		expect(taskStep.result?.commits).toEqual([
			{
				sha: "abc123",
				subject: "TASK-1: implement finalizer projection",
			},
		]);
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-008
	test("records finalization_failed as a retryable finalizer step without failing the task step", async () => {
		const fixture = await setupInlineFixture();
		await initGit(fixture.projectRoot);
		await installFailingCommitHook(fixture.projectRoot);
		const result = await runDrive(fixture);
		const store = new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		});

		const taskStep = await requireStep(
			store,
			{ scope: PLAN_SLUG, runId: fixture.runId },
			fixture.taskId,
		);
		const finalizer = await requireStep(
			store,
			{ scope: PLAN_SLUG, runId: fixture.runId },
			`finalizer-source-commit-${fixture.taskId}`,
		);
		const finalizerAttempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: fixture.runId,
			stepId: `finalizer-source-commit-${fixture.taskId}`,
		});
		const pending = JSON.parse(
			await readFile(
				join(fixture.workdir, "pending-finalization.json"),
				"utf-8",
			),
		) as Record<string, unknown>;
		const legacyEvents = (await tailEvents(fixture.eventLogPath)).events;
		const storedEvents = await readStoredEvents(
			fixture.projectRoot,
			fixture.runId,
		);

		expect(result).toMatchObject({
			outcome: "finalization_failed",
			finalizationPhase: "commit",
			finalizationTaskId: fixture.taskId,
			pendingFinalizationPath: join(
				fixture.workdir,
				"pending-finalization.json",
			),
		});
		expect(pending).toMatchObject({
			phase: "commit",
			taskId: fixture.taskId,
			reason: expect.stringContaining("commit failed"),
			headBeforeFinalization: expect.any(String),
		});
		expect(taskStep.status).toBe("running");
		expect(taskStep.result).toMatchObject({
			outcome: "success",
			summary: "implemented durable finalizer failure",
			nextAction: "continue",
		});
		expect(finalizer).toMatchObject({
			id: `finalizer-source-commit-${fixture.taskId}`,
			runId: fixture.runId,
			kind: "finalizer",
			backend: { name: "shell-command", options: { drivePhase: "commit" } },
			dependsOn: [fixture.taskId],
			status: "failed",
			result: {
				outcome: "failed",
				summary: expect.stringContaining("commit failed"),
				nextAction: "retry",
				artifacts: [
					{
						id: "pending-finalization",
						path: "pending-finalization.json",
						kind: "pending-finalization",
					},
				],
			},
		});
		expect(finalizer.outputArtifacts).toContainEqual({
			id: "pending-finalization",
			path: "pending-finalization.json",
			kind: "pending-finalization",
		});
		expect(finalizerAttempts).toHaveLength(1);
		expect(finalizerAttempts[0]).toMatchObject({
			attemptId: "attempt-001",
			result: {
				outcome: "failed",
				nextAction: "retry",
			},
		});
		expect(legacyEvents.map((event) => event.type)).toContain(
			"task_finalization_failed",
		);
		expect(legacyEvents.map((event) => event.type)).toContain(
			"run_finalization_failed",
		);
		expect(storedEvents).toContainEqual(
			expect.objectContaining({
				event: {
					type: "step_failed",
					runId: fixture.runId,
					stepId: fixture.taskId,
					reason: expect.stringContaining("commit failed"),
				},
			}),
		);
		expect(storedEvents).toContainEqual(
			expect.objectContaining({
				event: {
					type: "run_failed",
					runId: fixture.runId,
					reason: expect.stringContaining("commit failed"),
				},
			}),
		);
	});
});

interface InlineFixture {
	projectRoot: string;
	taskManager: TaskManager;
	taskId: string;
	runId: string;
	workdir: string;
	eventLogPath: string;
	spec: DriverRunSpec;
}

function createProjector(
	store: FileRunStore,
	record: RunRecord,
	taskIds: readonly string[],
): DriveStepProjector {
	return createDriveStepProjector({
		store,
		ref: { scope: PLAN_SLUG, runId: RUN_ID },
		projectRoot: temp.path,
		workdir: record.runDir,
		configuredBackendName: "codex",
		taskIds,
	});
}

async function setupInlineFixture(): Promise<InlineFixture> {
	const projectRoot = temp.path;
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Durable Finalizer Failure",
		labels: [`plan:${PLAN_SLUG}`],
	});
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Drive envelope\n", "utf-8");
	const runId = `run-${task.id.toLowerCase()}`;
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		runId,
	);
	await mkdir(workdir, { recursive: true });
	const eventLogPath = join(workdir, "events.jsonl");
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "driver-commits",
		stateCommitPolicy: "final-state-commit",
		workdir,
		eventLogPath,
	};
	return {
		projectRoot,
		taskManager,
		taskId: task.id,
		runId,
		workdir,
		eventLogPath,
		spec,
	};
}

async function runDrive(fixture: InlineFixture): Promise<DriverResult> {
	const backend: Backend = {
		name: "fake-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: async ({ projectRoot }) => {
			await writeFile(
				join(projectRoot, "lib-finalizer.ts"),
				"export const durableFinalizer = true;\n",
				"utf-8",
			);
			return successResult();
		},
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
				files: [{ path: "lib-finalizer.ts", change: "created" }],
				verification: [],
				notes: "implemented durable finalizer failure",
			}),
			"```",
			"outcome: success",
		].join("\n"),
		durationMs: 1,
	};
}

async function readStoredEvents(
	projectRoot: string,
	runId: string,
): Promise<StoredOrchestrationEvent[]> {
	const raw = await readFile(
		join(
			projectRoot,
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
		.map((line) => JSON.parse(line) as unknown)
		.filter(isStoredOrchestrationEvent);
}

async function requireStep(
	store: FileRunStore,
	ref: Pick<RunRecord, "scope" | "runId">,
	stepId: string,
): Promise<StepRecord> {
	const step = await store.readStepRecord({
		scope: ref.scope,
		runId: ref.runId,
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

function event<T extends DriverEvent["type"]>(
	type: T,
	fields: Omit<
		Extract<DriverEvent, { type: T }>,
		"type" | "runId" | "parentSessionId" | "timestamp"
	>,
): Extract<DriverEvent, { type: T }> {
	return {
		type,
		runId: RUN_ID,
		parentSessionId: PARENT_SESSION_ID,
		timestamp: "2026-06-04T00:00:00.000Z",
		...fields,
	} as Extract<DriverEvent, { type: T }>;
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(
		hookPath,
		"#!/bin/sh\nprintf 'commit rejected by durable finalizer test\\n' >&2\nexit 1\n",
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}
