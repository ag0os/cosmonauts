import { describe, expect, test, vi } from "vitest";
import {
	FileRunStore,
	type KnownBackendName,
	type RunGraph,
	type RunGraphSchedulerBackend,
	type RunRecord,
	runDurableGraphScheduler,
	type StepRecord,
	type StepResult,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-scheduler-heartbeats-");

describe("durable scheduler heartbeats", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-005
	test("keeps long idle running steps alive while heartbeats remain fresh and no hard timeout is configured", async () => {
		let scheduler: Promise<unknown> | undefined;
		let result: Deferred<StepResult> | undefined;
		let nowMs = Date.parse("2026-06-04T00:00:00.000Z");

		try {
			const store = new FileRunStore({ rootDir: temp.path });
			const run = await store.createRun({
				scope: "plan-a",
				runId: "run-long-idle-heartbeats",
				status: "running",
				policy: {
					staleHeartbeatMs: 90_000,
				},
			});
			await store.writeRunGraph(ref(run), {
				steps: [graphStep(run, "idle-build", [])],
				edges: [],
			});
			await store.writeStepRecord(ref(run), {
				...stepRecord(run, "idle-build", []),
				status: "ready",
			});
			await store.writeSchedulerState(ref(run), {
				readyStepIds: ["idle-build"],
				leasesByStepId: {},
				heartbeatsByStepId: {},
				updatedAt: "2026-06-04T00:00:00.000Z",
			});

			const started = deferred<void>();
			result = deferred<StepResult>();
			const backend = schedulerBackend("shell-command", {
				started: () => started.resolve(),
				result: result.promise,
			});

			scheduler = runDurableGraphScheduler({
				store,
				ref: ref(run),
				backends: new Map([["shell-command", backend]]),
				holderId: "scheduler-a",
				heartbeatIntervalMs: 5,
				now: () => new Date(nowMs).toISOString(),
			});

			await started.promise;
			nowMs = Date.parse("2026-06-04T00:00:30.000Z");
			await waitForHeartbeatAt(
				store,
				ref(run),
				"idle-build",
				"2026-06-04T00:00:30.000Z",
			);

			nowMs = Date.parse("2026-06-04T00:02:30.000Z");
			await waitForHeartbeatAt(
				store,
				ref(run),
				"idle-build",
				"2026-06-04T00:02:30.000Z",
			);
			const runningStep = await store.readStepRecord({
				...ref(run),
				stepId: "idle-build",
			});
			expect(runningStep).toEqual(
				expect.objectContaining({
					status: "running",
					heartbeat: {
						at: "2026-06-04T00:02:30.000Z",
						note: "renewed",
					},
				}),
			);
			expect(runningStep).not.toHaveProperty("result");

			await vi.waitFor(
				async () => {
					const events = await store.readEvents(ref(run));
					expect(
						events.events.filter(
							(stored) => stored.event.type === "step_heartbeat",
						).length,
					).toBeGreaterThanOrEqual(3);
				},
				{ timeout: 1_000, interval: 5 },
			);
			const runningEvents = await store.readEvents(ref(run));
			expect(
				runningEvents.events.filter(
					(stored) => stored.event.type === "step_heartbeat",
				).length,
			).toBeGreaterThanOrEqual(3);
			expect(
				runningEvents.events.map((stored) => stored.event.type),
			).not.toContain("step_stale");
			expect(
				runningEvents.events.map((stored) => stored.event.type),
			).not.toContain("step_failed");

			result.resolve({
				outcome: "success",
				summary: "idle build completed",
				artifacts: [],
			});
			await scheduler;

			await expect(
				store.readStepRecord({ ...ref(run), stepId: "idle-build" }),
			).resolves.toEqual(
				expect.objectContaining({
					status: "completed",
					result: expect.objectContaining({ outcome: "success" }),
				}),
			);
		} finally {
			result?.resolve({
				outcome: "success",
				summary: "settled by test cleanup",
				artifacts: [],
			});
			await scheduler?.catch(() => undefined);
		}
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

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T | PromiseLike<T>): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: Deferred<T>["resolve"];
	let reject!: Deferred<T>["reject"];
	const promise = new Promise<T>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});
	return { promise, resolve, reject };
}

async function waitForHeartbeatAt(
	store: FileRunStore,
	ref: { scope: string; runId: string },
	stepId: string,
	expectedAt: string,
): Promise<void> {
	await vi.waitFor(
		async () => {
			await expect(store.readStepRecord({ ...ref, stepId })).resolves.toEqual(
				expect.objectContaining({
					status: "running",
					heartbeat: {
						at: expectedAt,
						note: "renewed",
					},
				}),
			);
		},
		{ timeout: 1_000, interval: 5 },
	);
}

interface SchedulerBackendOptions {
	result: Promise<StepResult>;
	started?: () => void;
}

function schedulerBackend(
	name: KnownBackendName,
	options: SchedulerBackendOptions,
): RunGraphSchedulerBackend {
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
			options.started?.();
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: options.result,
			};
		}),
	};
}
