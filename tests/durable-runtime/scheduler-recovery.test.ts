import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	FileRunStore,
	type KnownBackendName,
	type RunGraph,
	type RunGraphSchedulerBackend,
	type RunRecord,
	runDurableGraphScheduler,
	type StepHeartbeat,
	type StepLease,
	type StepRecord,
	type StepResult,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-scheduler-recovery-");

describe("durable scheduler recovery", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-009
	test("does not rerun completed steps when restarted with empty in-memory state", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-completed-step-restart",
			status: "running",
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "build", []), graphStep(run, "verify", ["build"])],
			edges: [{ from: "build", to: "verify" }],
		});
		const buildResult: StepResult = {
			outcome: "success",
			summary: "build already completed",
			artifacts: [{ id: "build-log", path: "steps/build/log.md" }],
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "build", []),
			status: "completed",
			latestAttemptId: "attempt-001",
			result: buildResult,
			outputArtifacts: buildResult.artifacts,
		});
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
				endedAt: "2026-06-04T00:01:00.000Z",
				result: buildResult,
			},
		);
		await store.writeStepRecord(ref(run), stepRecord(run, "verify", ["build"]));
		await store.writeSchedulerState(ref(run), {
			readyStepIds: [],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:00:00.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		expect(result.exitReason).toBe("terminal");
		expect(backend.prepare).toHaveBeenCalledTimes(1);
		expect(backend.prepare).toHaveBeenCalledWith(
			expect.objectContaining({ id: "verify" }),
			expect.anything(),
		);
		expect(backend.start).toHaveBeenCalledTimes(1);
		await expect(
			restartedStore.listStepAttemptRecords({ ...ref(run), stepId: "build" }),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
				endedAt: "2026-06-04T00:01:00.000Z",
				result: buildResult,
			},
		]);
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "completed",
				result: buildResult,
				latestAttemptId: "attempt-001",
			}),
		);
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "verify" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "completed",
				latestAttemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "success" }),
			}),
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-010
	test("reconstructs ready queue leases and heartbeats from persisted records after restart", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-reconstructs-live-state",
			status: "running",
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "active-build", [])],
			edges: [],
		});

		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "persisted heartbeat file",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "active-build", []),
			status: "running",
			lease,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "active-build" },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "active-build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		await store.writeSchedulerState(ref(run), {
			readyStepIds: ["active-build"],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:00:30.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		expect(result.exitReason).toBe("waiting_for_fresh_external_work");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "active-build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "running",
				lease,
				heartbeat,
				latestAttemptId: "attempt-001",
			}),
		);
		await expect(restartedStore.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: [],
				leasesByStepId: { "active-build": lease },
				heartbeatsByStepId: { "active-build": heartbeat },
			}),
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-011
	test("promotes terminal attempt results on restart without starting a duplicate backend", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-promotes-terminal-attempt",
			status: "running",
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "finished-build", [])],
			edges: [],
		});

		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "attempt completed before crash",
		};
		const attemptResult: StepResult = {
			outcome: "success",
			summary: "finished before restart",
			artifacts: [{ id: "report", path: "steps/finished-build/report.md" }],
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "finished-build", []),
			status: "running",
			lease,
			heartbeat,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "finished-build" },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "finished-build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
				endedAt: "2026-06-04T00:02:00.000Z",
				result: attemptResult,
			},
		);
		await store.writeSchedulerState(ref(run), {
			readyStepIds: ["finished-build"],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:00:30.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:03:00.000Z",
		});

		expect(result.exitReason).toBe("terminal");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({
				...ref(run),
				stepId: "finished-build",
			}),
		).resolves.toEqual({
			...stepRecord(run, "finished-build", []),
			status: "completed",
			heartbeat,
			latestAttemptId: "attempt-001",
			result: attemptResult,
			outputArtifacts: attemptResult.artifacts,
		});
		await expect(restartedStore.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: [],
				leasesByStepId: {},
				heartbeatsByStepId: { "finished-build": heartbeat },
			}),
		);
		await expect(restartedStore.loadRun(ref(run))).resolves.toEqual(
			expect.objectContaining({ status: "completed" }),
		);
		const events = await restartedStore.readEvents(ref(run));
		expect(events.events.map((stored) => stored.event)).toEqual([
			{
				type: "step_completed",
				runId: run.runId,
				stepId: "finished-build",
				result: attemptResult,
			},
			{
				type: "run_completed",
				runId: run.runId,
				result: {
					outcome: "completed",
					tasksDone: 1,
					tasksBlocked: 0,
				},
			},
		]);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-014
	test("blocks potentially committed running work without terminal attempt evidence after restart", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-blocks-potentially-committed-work",
			status: "running",
			policy: {
				staleHeartbeatMs: 30_000,
			},
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "commit-capable-build", [])],
			edges: [],
		});
		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:00:00.000Z",
			note: "possibly committed before crash",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "commit-capable-build", []),
			status: "running",
			lease,
			heartbeat,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "commit-capable-build" },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "commit-capable-build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		await store.writeSchedulerState(ref(run), {
			readyStepIds: [],
			leasesByStepId: { "commit-capable-build": lease },
			heartbeatsByStepId: { "commit-capable-build": heartbeat },
			updatedAt: "2026-06-04T00:00:00.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		backend.capabilities.canCommit = true;
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:00:31.000Z",
		});

		expect(result.exitReason).toBe("terminal");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({
				...ref(run),
				stepId: "commit-capable-build",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				status: "blocked",
				heartbeat,
				latestAttemptId: "attempt-001",
				result: expect.objectContaining({
					outcome: "blocked",
					nextAction: "wait_for_human",
				}),
			}),
		);
		const blockedStep = await restartedStore.readStepRecord({
			...ref(run),
			stepId: "commit-capable-build",
		});
		expect(blockedStep).not.toHaveProperty("lease");
		await expect(
			restartedStore.listStepAttemptRecords({
				...ref(run),
				stepId: "commit-capable-build",
			}),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		]);
		await expect(restartedStore.loadRun(ref(run))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-015
	test("leaves fresh nonresumable running work externally owned without starting a duplicate after restart", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-fresh-external-nonresumable",
			status: "running",
			policy: {
				staleHeartbeatMs: 30_000,
			},
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "active-build", [])],
			edges: [],
		});
		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:00:30.000Z",
			note: "fresh external owner",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "active-build", []),
			status: "running",
			lease,
			heartbeat,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "active-build" },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "active-build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		await store.writeSchedulerState(ref(run), {
			readyStepIds: ["active-build"],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:00:30.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		backend.capabilities.canResume = false;
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:00:45.000Z",
		});

		expect(result.exitReason).toBe("waiting_for_fresh_external_work");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "active-build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "running",
				lease,
				heartbeat,
				latestAttemptId: "attempt-001",
			}),
		);
		await expect(
			restartedStore.listStepAttemptRecords({
				...ref(run),
				stepId: "active-build",
			}),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		]);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-017
	test("uses step records as mutable authority when graph step fields conflict", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-step-records-are-authority",
			status: "running",
		});
		await writeFile(
			run.graphPath,
			`${JSON.stringify(
				{
					steps: [
						{
							...graphStep(run, "build", []),
							status: "ready",
							latestAttemptId: "attempt-from-graph",
							result: {
								outcome: "failed",
								summary: "graph mutable state must be ignored",
								artifacts: [],
							},
							outputArtifacts: [
								{ id: "graph-output", path: "graph/output.md" },
							],
						},
					],
					edges: [],
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		const stepResult: StepResult = {
			outcome: "success",
			summary: "step record completed",
			artifacts: [{ id: "step-output", path: "steps/build/result.json" }],
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "build", []),
			status: "completed",
			latestAttemptId: "attempt-001",
			result: stepResult,
			outputArtifacts: stepResult.artifacts,
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		expect(result.exitReason).toBe("terminal");
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "ignored_graph_mutable_state",
				details: expect.objectContaining({
					stepId: "build",
					fields: expect.arrayContaining([
						"status",
						"result",
						"latestAttemptId",
						"outputArtifacts",
					]),
				}),
			}),
		]);
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "completed",
				result: stepResult,
				outputArtifacts: stepResult.artifacts,
				latestAttemptId: "attempt-001",
			}),
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-018
	test("blocks graph steps with missing or corrupt step records before execution", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-blocks-invalid-step-records",
			status: "running",
		});
		await store.writeRunGraph(ref(run), {
			steps: [
				graphStep(run, "missing-record", []),
				graphStep(run, "corrupt-record", []),
			],
			edges: [],
		});
		const corruptStepPath = join(run.stepsDir, "corrupt-record", "step.json");
		await mkdir(join(run.stepsDir, "corrupt-record"), { recursive: true });
		await writeFile(corruptStepPath, "{ not valid json\n", "utf-8");

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		expect(result.exitReason).toBe("blocked");
		expect(result.steps).toEqual([]);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "missing_step_record",
					details: { stepId: "missing-record" },
				}),
				expect.objectContaining({
					code: "corrupt_step_record",
					path: corruptStepPath,
					details: expect.objectContaining({ stepId: "corrupt-record" }),
				}),
			]),
		);
		expect(result.run.status).toBe("blocked");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(restartedStore.loadRun(ref(run))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);
		const events = await restartedStore.readEvents(ref(run));
		expect(events.events).toEqual([
			expect.objectContaining({
				event: expect.objectContaining({
					type: "run_blocked",
					reason:
						"Persisted graph step records are missing or corrupt; manual recovery is required before execution.",
				}),
			}),
		]);
		expect(events.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "missing_step_record",
					details: { stepId: "missing-record" },
				}),
				expect.objectContaining({
					code: "corrupt_step_record",
					path: corruptStepPath,
					details: expect.objectContaining({ stepId: "corrupt-record" }),
				}),
			]),
		);
		await expect(
			restartedStore.listStepAttemptRecords({
				...ref(run),
				stepId: "missing-record",
			}),
		).resolves.toEqual([]);
		await expect(readFile(corruptStepPath, "utf-8")).resolves.toBe(
			"{ not valid json\n",
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-006
	test("marks a running leased step stale from persisted heartbeat age after restart", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-stale-after-restart",
			status: "running",
			policy: {
				staleHeartbeatMs: 30_000,
			},
		});
		await store.writeRunGraph(ref(run), {
			steps: [graphStep(run, "stale-build", [])],
			edges: [],
		});

		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:00:00.000Z",
			note: "before restart",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "stale-build", []),
			status: "running",
			lease,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "stale-build" },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "stale-build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		await store.writeSchedulerState(ref(run), {
			readyStepIds: [],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:00:00.000Z",
		});

		const restartedStore = new FileRunStore({ rootDir: temp.path });
		const backend = schedulerBackend("shell-command");
		const result = await runDurableGraphScheduler({
			store: restartedStore,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T00:00:31.000Z",
		});

		expect(result.exitReason).toBe("terminal");
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		await expect(
			restartedStore.readStepRecord({ ...ref(run), stepId: "stale-build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "stale",
				heartbeat,
				latestAttemptId: "attempt-001",
			}),
		);
		const staleStep = await restartedStore.readStepRecord({
			...ref(run),
			stepId: "stale-build",
		});
		expect(staleStep).not.toHaveProperty("lease");
		await expect(restartedStore.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: [],
				leasesByStepId: {},
				heartbeatsByStepId: { "stale-build": heartbeat },
			}),
		);
		await expect(
			restartedStore.listStepAttemptRecords({
				...ref(run),
				stepId: "stale-build",
			}),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		]);

		const events = await restartedStore.readEvents(ref(run));
		expect(events.events.map((stored) => stored.event)).toEqual([
			{ type: "step_stale", runId: run.runId, stepId: "stale-build" },
			{ type: "run_stale", runId: run.runId },
		]);
	});

	// REVIEW-FIX F-003: invalid persisted graph topology must block recovery
	// before any backend start instead of silently dropping the graph node, so
	// a corrupt graph.json cannot lose planned work.
	test("blocks the run when graph topology is invalid instead of dropping graph nodes", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-invalid-graph-topology-blocks",
			status: "running",
		});
		// A malformed graph step (missing required fields) makes readRunGraph emit
		// `invalid_run_graph_step` and drop the node; recovery must block, not run.
		await writeFile(
			run.graphPath,
			`${JSON.stringify(
				{
					steps: [{ id: "build", runId: run.runId }],
					edges: [],
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		const backend = schedulerBackend("shell-command");

		const result = await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T00:00:01.000Z",
		});

		expect(backend.prepare).not.toHaveBeenCalled();
		expect(backend.start).not.toHaveBeenCalled();
		expect(result.exitReason).toBe("blocked");
		expect(result.run.status).toBe("blocked");
		await expect(store.loadRun(ref(run))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);
		const events = await store.readEvents(ref(run));
		expect(events.events.map((stored) => stored.event.type)).toContain(
			"run_blocked",
		);
		expect(events.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "invalid_run_graph_step" }),
			]),
		);
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

function graphStep(
	record: RunRecord,
	id: string,
	dependsOn: string[],
): RunGraph["steps"][number] {
	return {
		id,
		runId: record.runId,
		title: id,
		kind: "command",
		backend: { name: "shell-command" },
		dependsOn,
		inputArtifacts: [],
	};
}

function stepRecord(
	record: RunRecord,
	id: string,
	dependsOn: string[],
): StepRecord {
	return {
		...graphStep(record, id, dependsOn),
		status: "pending",
		outputArtifacts: [],
	};
}

function schedulerBackend(name: KnownBackendName): RunGraphSchedulerBackend {
	return {
		name,
		capabilities: {
			canResume: false,
			canCancel: false,
			canCommit: false,
			isolatedFromHostSource: true,
			emitsMachineReport: true,
		},
		prepare: vi.fn(async (step, context) => ({
			step,
			attemptId: context.attemptId,
			backend: step.backend,
			input: context.input,
			preparedAt: context.now?.() ?? "2026-06-04T00:00:00.000Z",
		})),
		start: vi.fn(async (prepared) => {
			const result: StepResult = {
				outcome: "success",
				summary: `${prepared.step.id} completed`,
				artifacts: [],
			};
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: Promise.resolve(result),
			};
		}),
	};
}
