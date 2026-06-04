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
