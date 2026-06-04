import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createDriveProgram } from "../../cli/drive/subcommand.ts";
import { registerRunControlTools } from "../../domains/shared/extensions/orchestration/run-control-tools.ts";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runInline } from "../../lib/driver/driver.ts";
import {
	type DriverEventBusEvent,
	tailEvents,
} from "../../lib/driver/event-stream.ts";
import { writeRunCompletion } from "../../lib/driver/run-state.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RuntimeDiagnostic,
	runStatus,
	runWatch,
	type StepRecord,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { createMockPi } from "../extensions/orchestration-helpers.ts";
import { captureCliOutput } from "../helpers/cli.ts";
import { captureDurableDiagnostics } from "../helpers/durable-diagnostics.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-durable-steps-");
const PLAN_SLUG = "durable-drive-steps";
const PARENT_SESSION_ID = "durable-steps-parent-session";

describe("driver durable step projection", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-004
	test("writes Drive task step records with configured backend identity and resume-safe dependencies", async () => {
		const fixture = await setupFixture({ taskCount: 3 });
		const resumedTaskId = fixture.taskIds[2] ?? fail("missing resumed task");
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
		const completedEvent = storedEvents.findLast(
			(record) => record.event.type === "step_completed",
		)?.event;
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
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
			"finalize",
			"plan_completion_candidate",
			"run_completed",
		]);
		expect(storedEvents.map((event) => event.event.type)).toEqual([
			"run_started",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_tool_activity",
			"step_tool_activity",
			"step_tool_activity",
			"step_completed",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_completed",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_tool_activity",
			"step_tool_activity",
			"step_tool_activity",
			"step_completed",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_completed",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_tool_activity",
			"step_tool_activity",
			"step_tool_activity",
			"step_completed",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_completed",
			"run_completed",
		]);
		expect(
			storedEvents.find((event) => event.event.type === "step_started")?.event,
		).toMatchObject({ backend: "codex" });
		expect(completedEvent).toMatchObject({
			type: "step_completed",
			runId: fixture.runId,
			stepId: `finalizer-task-status-${resumedTaskId}`,
			result: {
				outcome: "success",
			},
		});

		expect(step).toMatchObject({
			id: resumedTaskId,
			runId: fixture.runId,
			kind: "drive",
			backend: { name: "codex" },
			dependsOn: [`finalizer-task-status-${fixture.taskIds[1]}`],
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
				id: `drive-output:${resumedTaskId}:attempt-001`,
				path: `steps/${resumedTaskId}/attempts/attempt-001.json`,
				kind: "drive-task-output",
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
		expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
			"drive_backend_identity_mismatch",
		);
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-006
	test("records malformed reports inferred by postflight as completed success in step records and normalized events", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const taskId = fixture.taskIds[0] ?? fail("missing task");
		fixture.spec.postflightCommands = [nodeCommand("process.exit(0)")];
		const store = new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		});

		const result = await runDrive(fixture, malformedResult());
		const task = await fixture.taskManager.getTask(taskId);
		const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);
		const storedEvents = await readStoredEvents(fixture.runId);
		const step = await requireStep(store, fixture.runId, taskId);
		const attempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: fixture.runId,
			stepId: taskId,
		});
		const completedEvent = storedEvents.find(
			(record) =>
				record.event.type === "step_completed" &&
				record.event.stepId === taskId,
		)?.event;
		const verifyEvents = storedEvents
			.map((record) => record.event)
			.filter(isVerifyActivityEvent);

		expect(result.outcome).toBe("completed");
		expect(task?.status).toBe("Done");
		expect(legacyEvents.map((event) => event.type)).toContain("task_done");
		expect(verifyEvents.map((event) => event.details)).toEqual([
			{
				kind: "verify",
				phase: "post",
				status: "started",
				command: fixture.spec.postflightCommands[0],
			},
			{
				kind: "verify",
				phase: "post",
				status: "passed",
				command: fixture.spec.postflightCommands[0],
			},
		]);
		expect(attempts).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({
					outcome: "success",
					nextAction: "continue",
					verification: [
						{
							command: fixture.spec.postflightCommands[0],
							status: "pass",
						},
					],
				}),
			}),
		]);
		expect(attempts[0]?.result?.files).toEqual([]);
		expect(step.status).toBe("completed");
		expect(step.result).toEqual(attempts[0]?.result);
		expect(step.result).toMatchObject({
			outcome: "success",
			nextAction: "continue",
		});
		expect(completedEvent).toEqual({
			type: "step_completed",
			runId: fixture.runId,
			stepId: taskId,
			result: attempts[0]?.result,
		});
		expect(
			completedEvent?.type === "step_completed"
				? completedEvent.result.nextAction
				: undefined,
		).toBe("continue");
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-011
	test("keeps legacy observation outputs unchanged when step records exist", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const taskId = fixture.taskIds[0] ?? fail("missing task");
		fixture.spec.postflightCommands = [nodeCommand("process.exit(0)")];
		const store = new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		});

		const result = await runDrive(fixture, malformedResult());
		await writeRunCompletion(fixture.spec.workdir, result);
		const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);
		const step = await requireStep(store, fixture.runId, taskId);
		await poisonStepRecord(store, fixture.runId, step);

		const poisonedStep = await requireStep(store, fixture.runId, taskId);
		const record = await store.loadRun({
			scope: PLAN_SLUG,
			runId: fixture.runId,
		});
		const directWatch = await runWatch(store, {
			scope: PLAN_SLUG,
			runId: fixture.runId,
		});
		const directStatus = await runStatus(store, {
			scope: PLAN_SLUG,
			runId: fixture.runId,
		});

		expect(result).toMatchObject({
			runId: fixture.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		expect(poisonedStep).toMatchObject({
			id: taskId,
			status: "blocked",
			backend: { name: "unknown" },
			result: {
				outcome: "blocked",
				summary: "poisoned step-only observation sentinel",
				nextAction: "wait_for_human",
			},
		});
		expect(record?.eventsPath).toBe(
			join(fixture.spec.workdir, "orchestration-events.jsonl"),
		);
		expect(directWatch.events.map((event) => event.text)).toEqual([
			"1 run_started",
			`2 step_ready ${taskId}`,
			`3 step_started ${taskId}: codex`,
			`4 step_heartbeat ${taskId}`,
			`5 step_tool_activity ${taskId}`,
			`5 step_completed ${taskId}: success`,
			`6 step_tool_activity ${taskId}`,
			`6 step_ready finalizer-task-status-${taskId}`,
			`7 step_tool_activity ${taskId}`,
			`7 step_started finalizer-task-status-${taskId}: shell-command`,
			`8 step_tool_activity ${taskId}`,
			`8 step_heartbeat finalizer-task-status-${taskId}`,
			`9 step_tool_activity ${taskId}`,
			`9 step_completed finalizer-task-status-${taskId}: success`,
			"10 run_completed: completed",
		]);
		expect(
			directWatch.events.map((event) => event.envelope.event.type),
		).toEqual([
			"run_started",
			"step_ready",
			"step_started",
			"step_heartbeat",
			"step_tool_activity",
			"step_completed",
			"step_tool_activity",
			"step_ready",
			"step_tool_activity",
			"step_started",
			"step_tool_activity",
			"step_heartbeat",
			"step_tool_activity",
			"step_completed",
			"run_completed",
		]);
		expect(directStatus).toMatchObject({
			status: "completed",
			statusSource: "event",
			eventStatus: "completed",
		});

		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		registerWatchEventsTool(pi as never);
		registerRunControlTools(pi as never);
		const watched = (await pi.callTool("watch_events", {
			planSlug: PLAN_SLUG,
			runId: fixture.runId,
		})) as {
			cursor: number;
			details: { events: DriverEvent[]; cursor: number };
			content: { text: string }[];
		};
		const toolWatch = (await pi.callTool("run_watch", {
			scope: PLAN_SLUG,
			runId: fixture.runId,
		})) as { content: { text: string }[]; details: typeof directWatch };
		const toolStatus = (await pi.callTool("run_status", {
			scope: PLAN_SLUG,
			runId: fixture.runId,
		})) as { content: { text: string }[]; details: typeof directStatus };
		const statusOutput = await captureDriveJson(fixture.projectRoot, [
			"status",
			fixture.runId,
			"--plan",
			PLAN_SLUG,
		]);
		const listOutput = await captureDriveJson(fixture.projectRoot, ["list"]);

		expect(watched.cursor).toBe(legacyEvents.length);
		expect(watched.details.events).toEqual(legacyEvents);
		expect(watched.content[0]?.text).toContain("spawn_completed");
		expect(watched.content[0]?.text).toContain("report: unknown");
		expect(watched.content[0]?.text).toContain("run_completed");
		expect(watched.content[0]?.text).not.toContain("step_");
		expect(watched.content[0]?.text).not.toContain("poisoned");
		expect(JSON.stringify(watched.details)).not.toContain("stepId");
		expect(JSON.stringify(watched.details)).not.toContain("latestAttemptId");
		expect(JSON.stringify(watched.details)).not.toContain("outputArtifacts");

		expect(toolWatch.details).toEqual(directWatch);
		expect(toolWatch.content[0]?.text).toContain(
			`9 step_completed finalizer-task-status-${taskId}: success`,
		);
		expect(toolWatch.content[0]?.text).toContain("10 run_completed: completed");
		expect(toolWatch.content[0]?.text).not.toContain("poisoned");
		expect(toolStatus.details).toEqual(directStatus);
		expect(toolStatus.content[0]?.text).toContain(
			`${PLAN_SLUG}/${fixture.runId}: completed (event)`,
		);
		expect(toolStatus.content[0]?.text).not.toContain("poisoned");

		expect(statusOutput).toMatchObject({
			runId: fixture.runId,
			planSlug: PLAN_SLUG,
			status: "completed",
			workdir: expect.stringContaining(
				join("missions", "sessions", PLAN_SLUG, "runs", fixture.runId),
			),
			result: {
				runId: fixture.runId,
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			},
		});
		expect(listOutput).toMatchObject({
			runs: [
				{
					runId: fixture.runId,
					planSlug: PLAN_SLUG,
					status: "completed",
					workdir: expect.stringContaining(
						join("missions", "sessions", PLAN_SLUG, "runs", fixture.runId),
					),
					result: {
						runId: fixture.runId,
						outcome: "completed",
						tasksDone: 1,
						tasksBlocked: 0,
					},
				},
			],
		});
		for (const legacySurface of [
			statusOutput,
			listOutput,
			watched.details,
			watched.content,
		]) {
			const serialized = JSON.stringify(legacySurface);
			expect(serialized).not.toContain(
				"poisoned step-only observation sentinel",
			);
			expect(serialized).not.toContain("latestAttemptId");
			expect(serialized).not.toContain("inputArtifacts");
			expect(serialized).not.toContain("outputArtifacts");
			expect(serialized).not.toContain("attempt-001");
			expect(serialized).not.toContain("stepId");
		}
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-010
	test("continues Drive run when durable step persistence fails", async () => {
		const clean = await setupFixture({ taskCount: 1 });
		await runDrive(clean);
		const cleanLegacyEvents = await readLegacyEvents(clean.spec.eventLogPath);
		const cleanStoredEvents = await readStoredEvents(clean.runId);
		const cleanCompletedResult = cleanStoredEvents.findLast(
			(record) => record.event.type === "step_completed",
		)?.event;

		const broken = await setupFixture({ taskCount: 1 });
		const diagnostics = captureDurableDiagnostics();
		const published: DriverEvent[] = [];
		const token = activityBus.subscribe<DriverEventBusEvent>(
			"driver_event",
			(event) => {
				if (event.runId === broken.runId) {
					published.push(event.event);
				}
			},
		);

		try {
			await expect(
				runDrive(broken, successResult(), async (invocation) => {
					await breakDurableStepPersistence(
						invocation.workdir,
						broken.taskIds[0] ?? fail("missing task"),
					);
				}),
			).rejects.toThrow(/illegal operation/);
			const brokenTask = await broken.taskManager.getTask(
				broken.taskIds[0] ?? fail("missing task"),
			);
			const brokenLegacyEvents = await readLegacyEvents(
				broken.spec.eventLogPath,
			);

			expect(brokenTask?.status).toBe("In Progress");
			expect(
				existsSync(join(broken.spec.workdir, "pending-finalization.json")),
			).toBe(false);
			expect(brokenLegacyEvents.map((event) => event.type)).toContain(
				"run_aborted",
			);
			expect(published.map((event) => event.type)).toContain("run_aborted");
			expect(cleanCompletedResult).toMatchObject({ type: "step_completed" });
			expect(cleanStoredEvents.length).toBeGreaterThan(0);
			expect(cleanLegacyEvents.length).toBeGreaterThan(0);
		} finally {
			activityBus.unsubscribe(token);
			diagnostics.restore();
		}
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

async function runDrive(
	fixture: Fixture,
	backendResult: BackendRunResult = successResult(),
	onBackendRun?: (invocation: BackendInvocation) => Promise<void>,
): Promise<DriverResult> {
	const backend: Backend = {
		name: "fake-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: async (invocation) => {
			await onBackendRun?.(invocation);
			return backendResult;
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

async function breakDurableStepPersistence(
	workdir: string,
	taskId: string,
): Promise<void> {
	const stepPath = join(workdir, "steps", taskId, "step.json");
	const attemptPath = join(
		workdir,
		"steps",
		taskId,
		"attempts",
		"attempt-001",
		"attempt.json",
	);
	await rm(stepPath, { recursive: true, force: true });
	await mkdir(stepPath, { recursive: true });
	await rm(attemptPath, { recursive: true, force: true });
	await mkdir(attemptPath, { recursive: true });
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

function malformedResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: "The worker says this is finished, but emitted no JSON report.",
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

async function poisonStepRecord(
	store: FileRunStore,
	runId: string,
	step: StepRecord,
): Promise<void> {
	await store.writeStepRecord(
		{ scope: PLAN_SLUG, runId },
		{
			...step,
			status: "blocked",
			backend: { name: "unknown" },
			result: {
				outcome: "blocked",
				summary: "poisoned step-only observation sentinel",
				artifacts: [],
				nextAction: "wait_for_human",
			},
		},
	);
}

async function captureDriveJson(
	projectRoot: string,
	args: string[],
): Promise<Record<string, unknown>> {
	const originalCwd = process.cwd();
	const originalExitCode = process.exitCode;
	const output = captureCliOutput();
	try {
		process.exitCode = undefined;
		process.chdir(projectRoot);
		const program = createDriveProgram();
		program.exitOverride();
		await program.parseAsync(args, { from: "user" });
		return JSON.parse(output.stdout()) as Record<string, unknown>;
	} finally {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = originalExitCode;
	}
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

function isVerifyActivityEvent(
	event: StoredOrchestrationEvent["event"],
): event is Extract<
	StoredOrchestrationEvent["event"],
	{ type: "step_tool_activity" }
> & { details: Record<string, unknown> } {
	return (
		event.type === "step_tool_activity" &&
		isRecord(event.details) &&
		event.details.kind === "verify"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function fail(message: string): never {
	throw new Error(message);
}
