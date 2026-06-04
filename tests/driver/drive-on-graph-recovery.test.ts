import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "../../lib/driver/backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { compileDriveRunToGraph } from "../../lib/driver/drive-graph-compiler.ts";
import { createDriveSchedulerBackendMap } from "../../lib/driver/drive-scheduler-backend.ts";
import type {
	BackendName,
	DriverEvent,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RunRecord,
	runDurableGraphScheduler,
	type StepHeartbeat,
	type StepLease,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
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
