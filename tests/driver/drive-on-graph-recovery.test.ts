import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "../../lib/driver/backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { compileDriveRunToGraph } from "../../lib/driver/drive-graph-compiler.ts";
import { runDriveOnGraph } from "../../lib/driver/drive-graph-runner.ts";
import { createDriveSchedulerBackendMap } from "../../lib/driver/drive-scheduler-backend.ts";
import {
	createEventSink,
	type DriverEventBusEvent,
	driveEventBridgeOptions,
	driveGraphActivityEventSinkOptions,
} from "../../lib/driver/event-stream.ts";
import type {
	BackendName,
	DriverEvent,
	DriverResult,
	DriverRunSpec,
	EventSink,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RunRecord,
	runDurableGraphScheduler,
	type StepHeartbeat,
	type StepLease,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { MessageBus } from "../../lib/orchestration/message-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { captureCliOutput } from "../helpers/cli.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-on-graph-recovery-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-on-graph-recovery-parent";
const NOW = "2026-06-04T12:00:00.000Z";
const OLD = "2026-06-04T11:59:00.000Z";

const selectedBackends = [
	"codex",
	"claude-cli",
	"cosmonauts-subagent",
] as const satisfies readonly BackendName[];

describe("Drive-on-graph recovery", () => {
	// @cosmo-behavior plan:episodic-log#B-026
	test("persists episode capture failure as a non-fatal Drive diagnostic", async () => {
		const persisted = await seedCaptureFailureRun("persisted-diagnostic");
		const persistedBus = new MessageBus();
		const published: DriverEvent[] = [];
		persistedBus.subscribe<DriverEventBusEvent>("driver_event", (event) => {
			if (event.runId === persisted.spec.runId) published.push(event.event);
		});
		const persistedSink = createEventSink({
			logPath: persisted.spec.eventLogPath,
			runId: persisted.spec.runId,
			parentSessionId: persisted.spec.parentSessionId,
			activityBus: persistedBus,
			...driveEventBridgeOptions(persisted.spec),
			durable: driveGraphActivityEventSinkOptions(persisted.spec),
		});
		const persistedOutput = captureCliOutput();
		let persistedResult: DriverResult;
		try {
			persistedResult = await runDriveOnGraph(
				persisted.spec,
				captureFailureRunContext(persisted, persistedSink),
			);
		} finally {
			persistedOutput.restore();
		}

		const persistedEvents = await readDriverEvents(persisted.spec.eventLogPath);
		const persistedLegacy = persistedEvents.filter(isEpisodeCaptureDiagnostic);
		const persistedDurable = await persisted.store.readEvents(persisted.ref);
		const persistedDiagnostics = persistedDurable.diagnostics.filter(
			(diagnostic) => diagnostic.code === "episode_capture_failed",
		);
		const persistedActivity = persistedDurable.events.filter((event) =>
			isEpisodeCaptureDiagnostic(legacyDriverEvent(event.event)),
		);
		const persistedBusDiagnostics = published.filter(
			isEpisodeCaptureDiagnostic,
		);

		expect(persistedResult).toEqual({
			runId: persisted.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
		});
		expect(await readCompletion(persisted.spec)).toEqual(persistedResult);
		expect(persistedEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "run_completed" }),
			]),
		);
		expect(persistedLegacy).toHaveLength(2);
		expect(persistedDiagnostics).toHaveLength(2);
		expect(persistedActivity).toHaveLength(2);
		expect(persistedBusDiagnostics).toHaveLength(2);
		for (const diagnostic of persistedLegacy) {
			expect(diagnostic.message).toContain("Episode capture skipped");
			expect(diagnostic.details).toEqual({
				path: expect.stringContaining("memory/agent/episodes"),
				reason: expect.stringMatching(/Failed to write episode.*ENOTDIR/u),
			});
		}
		for (const diagnostic of persistedDiagnostics) {
			expect(diagnostic.message).toContain("Episode capture skipped");
			expect(diagnostic.details).toMatchObject({
				eventType: "driver_diagnostic",
				path: expect.stringContaining("memory/agent/episodes"),
				reason: expect.stringMatching(/Failed to write episode.*ENOTDIR/u),
			});
		}
		expect(persistedBusDiagnostics).toEqual(persistedLegacy);
		expect(persistedOutput.stderr()).toBe("");

		const rejected = await seedCaptureFailureRun("rejected-diagnostic");
		const rejectedBus = new MessageBus();
		const rejectedPublished: DriverEvent[] = [];
		rejectedBus.subscribe<DriverEventBusEvent>("driver_event", (event) => {
			if (event.runId === rejected.spec.runId) {
				rejectedPublished.push(event.event);
			}
		});
		const acceptedSink = createEventSink({
			logPath: rejected.spec.eventLogPath,
			runId: rejected.spec.runId,
			parentSessionId: rejected.spec.parentSessionId,
			activityBus: rejectedBus,
			...driveEventBridgeOptions(rejected.spec),
			durable: driveGraphActivityEventSinkOptions(rejected.spec),
		});
		let rejectedDiagnosticAppends = 0;
		const rejectingSink: EventSink = async (event) => {
			if (isEpisodeCaptureDiagnostic(event)) {
				rejectedDiagnosticAppends += 1;
				throw new Error("fault-injected diagnostic append failure");
			}
			await acceptedSink(event);
		};
		const rejectedOutput = captureCliOutput();
		let rejectedResult: DriverResult;
		try {
			rejectedResult = await runDriveOnGraph(
				rejected.spec,
				captureFailureRunContext(rejected, rejectingSink),
			);
		} finally {
			rejectedOutput.restore();
		}

		expect(rejectedResult).toEqual({
			runId: rejected.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
		});
		expect(await readCompletion(rejected.spec)).toEqual(rejectedResult);
		expect(rejectedDiagnosticAppends).toBe(2);
		expect(
			rejectedOutput.stderr().match(/Episode capture skipped/gu),
		).toHaveLength(2);
		expect(
			(await readDriverEvents(rejected.spec.eventLogPath)).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toEqual([]);
		expect(rejectedPublished.filter(isEpisodeCaptureDiagnostic)).toEqual([]);
		expect(
			(await rejected.store.readEvents(rejected.ref)).diagnostics.filter(
				(diagnostic) => diagnostic.code === "episode_capture_failed",
			),
		).toEqual([]);
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-022
	test("applies committed-work block and leave-running recovery paths to selected drive backends", async () => {
		for (const backendName of selectedBackends.filter(
			(name) => DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name].canCommit,
		)) {
			const fixture = await seedRunningGraph({
				name: `stale-${backendName}`,
				backendName,
				heartbeatAt: OLD,
			});
			const backend = createCountingBackend(backendName);
			const backends = createDriveSchedulerBackendMap({
				spec: fixture.spec,
				taskManager: fixture.taskManager,
				backend,
				eventSink: fixture.recordEvent,
			});

			expect([...backends.keys()]).toEqual([backendName, "shell-command"]);
			expect(backends.get(backendName)?.capabilities).toEqual(
				DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[backendName],
			);

			const result = await runDurableGraphScheduler({
				store: fixture.store,
				ref: fixture.ref,
				backends,
				holderId: "restarted-host",
				now: () => NOW,
			});
			const recoveredStep = await requireStep(
				fixture.store,
				fixture.spec.runId,
				fixture.taskId,
			);

			expect(result.exitReason).toBe("terminal");
			expect(result.run.status).toBe("blocked");
			expect(result.diagnostics).toContainEqual(
				expect.objectContaining({
					code: "potentially_committed_step_blocked",
					details: expect.objectContaining({
						stepId: fixture.taskId,
						backend: backendName,
					}),
				}),
			);
			expect(recoveredStep).toMatchObject({
				status: "blocked",
				result: {
					outcome: "blocked",
					nextAction: "wait_for_human",
					summary: expect.stringContaining("may have committed changes"),
				},
			});
			expect(backend.starts).toBe(0);
		}

		for (const backendName of selectedBackends) {
			const fixture = await seedRunningGraph({
				name: `fresh-${backendName}`,
				backendName,
				heartbeatAt: NOW,
			});
			const backend = createCountingBackend(backendName);
			const backends = createDriveSchedulerBackendMap({
				spec: fixture.spec,
				taskManager: fixture.taskManager,
				backend,
				eventSink: fixture.recordEvent,
			});

			expect([...backends.keys()]).toEqual([backendName, "shell-command"]);
			expect(backends.get(backendName)?.capabilities).toEqual(
				DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[backendName],
			);

			const result = await runDurableGraphScheduler({
				store: fixture.store,
				ref: fixture.ref,
				backends,
				holderId: "restarted-host",
				now: () => NOW,
			});
			const recoveredStep = await requireStep(
				fixture.store,
				fixture.spec.runId,
				fixture.taskId,
			);
			const attempts = await fixture.store.listStepAttemptRecords({
				...fixture.ref,
				stepId: fixture.taskId,
			});

			expect(result.exitReason).toBe("waiting_for_fresh_external_work");
			expect(result.run.status).toBe("running");
			expect(result.diagnostics).not.toContainEqual(
				expect.objectContaining({
					code: "potentially_committed_step_blocked",
				}),
			);
			expect(recoveredStep).toMatchObject({
				status: "running",
				lease: expect.objectContaining({ holderId: "external-host" }),
				heartbeat: { at: NOW, note: "fresh external work" },
			});
			expect(attempts).toHaveLength(1);
			expect(attempts[0]).toMatchObject({
				attemptId: "attempt-001",
				startedAt: NOW,
			});
			expect(attempts[0]?.endedAt).toBeUndefined();
			expect(backend.starts).toBe(0);
		}
	});
});

interface Fixture {
	projectRoot: string;
	sessionsRoot: string;
	spec: DriverRunSpec;
	taskId: string;
	taskManager: TaskManager;
	store: FileRunStore;
	ref: { scope: string; runId: string };
	recordEvent: (event: DriverEvent) => Promise<void>;
}

async function seedCaptureFailureRun(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
	await mkdir(join(projectRoot, "memory"), { recursive: true });
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	await writeFile(
		join(projectRoot, ".cosmonauts", "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
	await writeFile(join(projectRoot, "memory", "agent"), "path collision");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: "Capture failure fixture",
		description: "Drive primary work must remain successful.",
	});
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
		episodeSource: "test/worker",
		episodeAttemptId: `attempt-${name}`,
	};
	return {
		projectRoot,
		sessionsRoot,
		spec,
		taskId: task.id,
		taskManager,
		store: new FileRunStore({ rootDir: sessionsRoot }),
		ref: { scope: PLAN_SLUG, runId },
		recordEvent: async () => {},
	};
}

function captureFailureRunContext(fixture: Fixture, eventSink: EventSink) {
	return {
		taskManager: fixture.taskManager,
		backend: createCountingBackend("cosmonauts-subagent"),
		eventSink,
		parentSessionId: fixture.spec.parentSessionId,
		runId: fixture.spec.runId,
		abortSignal: new AbortController().signal,
		cosmonautsRoot: fixture.projectRoot,
		mode: "inline" as const,
	};
}

function isEpisodeCaptureDiagnostic(
	event: unknown,
): event is Extract<DriverEvent, { type: "driver_diagnostic" }> {
	return (
		typeof event === "object" &&
		event !== null &&
		"type" in event &&
		event.type === "driver_diagnostic" &&
		"code" in event &&
		event.code === "episode_capture_failed"
	);
}

function legacyDriverEvent(event: {
	type: string;
	details?: unknown;
}): unknown {
	if (
		event.type !== "run_activity" ||
		typeof event.details !== "object" ||
		event.details === null ||
		!("event" in event.details)
	) {
		return undefined;
	}
	return event.details.event;
}

async function readDriverEvents(path: string): Promise<DriverEvent[]> {
	return (await readFile(path, "utf-8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

async function readCompletion(spec: DriverRunSpec): Promise<DriverResult> {
	return JSON.parse(
		await readFile(join(spec.workdir, "run.completion.json"), "utf-8"),
	) as DriverResult;
}

async function seedRunningGraph(options: {
	name: string;
	backendName: BackendName;
	heartbeatAt: string;
}): Promise<Fixture> {
	const projectRoot = join(temp.path, options.name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${options.name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: `${options.backendName} recovery fixture`,
		description: "Recovery fixture task.",
	});
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: options.backendName,
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	const ref = { scope: PLAN_SLUG, runId };
	const store = new FileRunStore({ rootDir: sessionsRoot });
	const compiled = await compileDriveRunToGraph({ spec, store });
	const runningRun: RunRecord = {
		...compiled.run,
		status: "running",
		policy: {
			...compiled.run.policy,
			staleHeartbeatMs: 1_000,
		},
	};
	await store.updateRun(runningRun);
	const taskStep = await requireStep(store, runId, task.id);
	const lease: StepLease = {
		holderId: "external-host",
		acquiredAt: options.heartbeatAt,
		expiresAt: "2026-06-04T12:05:00.000Z",
		renewable: true,
	};
	const heartbeat: StepHeartbeat = {
		at: options.heartbeatAt,
		note:
			options.heartbeatAt === NOW
				? "fresh external work"
				: "stale external work",
	};
	const runningStep: StepRecord = {
		...taskStep,
		status: "running",
		lease,
		heartbeat,
		latestAttemptId: "attempt-001",
	};
	await store.writeStepAttemptRecord(
		{ ...ref, stepId: task.id },
		{ attemptId: "attempt-001", startedAt: options.heartbeatAt },
	);
	await store.writeStepHeartbeat({ ...ref, stepId: task.id }, heartbeat);
	await store.writeStepRecord(ref, runningStep);
	await store.writeSchedulerState(ref, {
		readyStepIds: [],
		leasesByStepId: { [task.id]: lease },
		heartbeatsByStepId: { [task.id]: heartbeat },
		updatedAt: options.heartbeatAt,
	});

	return {
		projectRoot,
		sessionsRoot,
		spec,
		taskId: task.id,
		taskManager,
		store,
		ref,
		recordEvent: async () => {},
	};
}

function createCountingBackend(
	name: BackendName,
): Backend & { starts: number } {
	return {
		name,
		capabilities: {
			canCommit: DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name].canCommit,
			isolatedFromHostSource:
				DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name].isolatedFromHostSource,
		},
		starts: 0,
		async run() {
			this.starts += 1;
			return successfulBackendResult();
		},
	};
}

function successfulBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes: "unexpected duplicate start",
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

async function requireStep(
	store: FileRunStore,
	runId: string,
	stepId: string,
): Promise<StepRecord> {
	const step = await store.readStepRecord({ scope: PLAN_SLUG, runId, stepId });
	if (!step) {
		throw new Error(`Missing step record: ${stepId}`);
	}
	return step;
}
