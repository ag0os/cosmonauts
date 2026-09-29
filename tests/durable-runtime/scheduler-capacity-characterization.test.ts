import { describe, expect, test, vi } from "vitest";
import {
	FileRunStore,
	type RunGraph,
	type RunGraphSchedulerBackend,
	type RunRecord,
	runDurableGraphScheduler,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-scheduler-capacity-");
const ref = { scope: "plan-a", runId: "run-capacity-full" };
const now = () => "2026-06-04T00:02:00.000Z";

function graphStep(run: RunRecord, id: string): RunGraph["steps"][number] {
	return {
		id,
		runId: run.runId,
		title: id,
		kind: "command",
		backend: { name: "shell-command" },
		dependsOn: [],
		inputArtifacts: [],
	};
}

describe("durable scheduler capacity characterization", () => {
	test("waits without starting or changing ready work when external running work fills capacity", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			...ref,
			status: "running",
			policy: { maxParallelSteps: 1 },
		});
		await store.writeRunGraph(ref, {
			steps: [graphStep(run, "external"), graphStep(run, "next")],
			edges: [],
		});
		const lease = {
			holderId: "other-scheduler",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		await store.writeStepRecord(ref, {
			...graphStep(run, "external"),
			status: "running",
			outputArtifacts: [],
			lease,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepAttemptRecord(
			{ ...ref, stepId: "external" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		const ready: StepRecord = {
			...graphStep(run, "next"),
			status: "ready",
			outputArtifacts: [],
		};
		await store.writeStepRecord(ref, ready);
		await store.writeSchedulerState(ref, {
			readyStepIds: ["next"],
			leasesByStepId: { external: lease },
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:01:00.000Z",
		});
		const backend: RunGraphSchedulerBackend = {
			name: "shell-command",
			capabilities: {
				canResume: false,
				canCancel: false,
				canCommit: false,
				isolatedFromHostSource: true,
				emitsMachineReport: true,
			},
			prepare: vi.fn(),
			start: vi.fn(async () => {
				throw new Error("unexpected backend start");
			}),
		};

		const result = await runDurableGraphScheduler({
			store,
			ref,
			backends: new Map([["shell-command", backend]]),
			holderId: "local-scheduler",
			now,
		});

		expect(result.exitReason).toBe("waiting_for_fresh_external_work");
		expect(backend.start).not.toHaveBeenCalled();
		expect(backend.prepare).not.toHaveBeenCalled();
		expect(result.steps).toContainEqual(ready);
		await expect(
			store.readStepRecord({ ...ref, stepId: "next" }),
		).resolves.toEqual(ready);
	});

	test("rejects a scheduler pass when the run record does not exist", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		await expect(
			runDurableGraphScheduler({
				store,
				ref: { scope: "plan-a", runId: "absent" },
				backends: new Map(),
				holderId: "local-scheduler",
				now,
			}),
		).rejects.toEqual(new Error("Run plan-a/absent does not exist."));
	});
});
