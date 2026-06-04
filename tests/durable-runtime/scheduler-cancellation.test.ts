import { describe, expect, test, vi } from "vitest";
import {
	type BackendHandle,
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

const temp = useTempDir("durable-scheduler-cancellation-");

describe("durable scheduler cancellation", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-019
	test("cancels active backend on signal and preserves running evidence when cancellation is unsupported", async () => {
		const cancellableStore = new FileRunStore({ rootDir: temp.path });
		const cancellableRun = await cancellationRunFixture(cancellableStore, {
			runId: "run-confirmed-cancellation",
		});
		const cancellableTracker = pendingTracker();
		const cancellableBackend = pendingBackend("shell-command", {
			tracker: cancellableTracker,
			canCancel: true,
		});
		const cancellableController = new AbortController();

		const cancellableScheduler = runDurableGraphScheduler({
			store: cancellableStore,
			ref: ref(cancellableRun),
			backends: new Map([["shell-command", cancellableBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T04:00:00.000Z",
			signal: cancellableController.signal,
		});

		await vi.waitFor(() => expect(cancellableTracker.started).toHaveLength(1));
		cancellableController.abort();
		const cancellableResult = await cancellableScheduler;

		expect(cancellableResult.exitReason).toBe("cancelled");
		expect(cancellableBackend.cancel).toHaveBeenCalledTimes(1);
		await expect(
			cancellableStore.readStepRecord({
				...ref(cancellableRun),
				stepId: "build",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				status: "cancelled",
				result: expect.objectContaining({ outcome: "cancelled" }),
			}),
		);
		const cancelledStep = await cancellableStore.readStepRecord({
			...ref(cancellableRun),
			stepId: "build",
		});
		expect(cancelledStep).not.toHaveProperty("lease");
		await expect(
			cancellableStore.readStepAttemptRecord({
				...ref(cancellableRun),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toEqual({
			attemptId: "attempt-001",
			startedAt: "2026-06-04T04:00:00.000Z",
			endedAt: "2026-06-04T04:00:00.000Z",
			result: {
				outcome: "cancelled",
				summary: "Scheduler signal cancelled the active backend invocation.",
				artifacts: [],
				nextAction: "abort_run",
			},
		});
		await expect(
			cancellableStore.readSchedulerState(ref(cancellableRun)),
		).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: [],
				leasesByStepId: {},
				heartbeatsByStepId: {
					build: { at: "2026-06-04T04:00:00.000Z" },
				},
			}),
		);
		await expect(
			cancellableStore.loadRun(ref(cancellableRun)),
		).resolves.toEqual(expect.objectContaining({ status: "cancelled" }));
		await expect(
			cancellableStore.readEvents(ref(cancellableRun)),
		).resolves.toEqual(
			expect.objectContaining({
				events: expect.arrayContaining([
					expect.objectContaining({
						event: {
							type: "step_cancelled",
							runId: cancellableRun.runId,
							stepId: "build",
						},
					}),
					expect.objectContaining({
						event: { type: "run_cancelled", runId: cancellableRun.runId },
					}),
				]),
			}),
		);

		const unsupportedStore = new FileRunStore({ rootDir: temp.path });
		const unsupportedRun = await cancellationRunFixture(unsupportedStore, {
			runId: "run-unsupported-cancellation",
		});
		const unsupportedTracker = pendingTracker();
		const unsupportedBackend = pendingBackend("shell-command", {
			tracker: unsupportedTracker,
			canCancel: false,
		});
		const unsupportedController = new AbortController();

		const unsupportedScheduler = runDurableGraphScheduler({
			store: unsupportedStore,
			ref: ref(unsupportedRun),
			backends: new Map([["shell-command", unsupportedBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T04:01:00.000Z",
			signal: unsupportedController.signal,
		});

		await vi.waitFor(() => expect(unsupportedTracker.started).toHaveLength(1));
		unsupportedController.abort();
		const unsupportedResult = await unsupportedScheduler;

		expect(unsupportedResult.exitReason).toBe("cancelled");
		expect(unsupportedBackend.cancel).not.toHaveBeenCalled();
		expect(unsupportedResult.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "cancellation_not_supported",
					details: expect.objectContaining({
						stepId: "build",
						attemptId: "attempt-001",
					}),
				}),
			]),
		);
		await expect(
			unsupportedStore.readStepRecord({
				...ref(unsupportedRun),
				stepId: "build",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				status: "running",
				latestAttemptId: "attempt-001",
				lease: expect.objectContaining({ holderId: "scheduler-a" }),
				heartbeat: { at: "2026-06-04T04:01:00.000Z" },
			}),
		);
		await expect(
			unsupportedStore.listStepAttemptRecords({
				...ref(unsupportedRun),
				stepId: "build",
			}),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T04:01:00.000Z",
			},
		]);
		await expect(
			unsupportedStore.readSchedulerState(ref(unsupportedRun)),
		).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: [],
				leasesByStepId: {
					build: expect.objectContaining({ holderId: "scheduler-a" }),
				},
				heartbeatsByStepId: {
					build: { at: "2026-06-04T04:01:00.000Z" },
				},
			}),
		);

		await runDurableGraphScheduler({
			store: unsupportedStore,
			ref: ref(unsupportedRun),
			backends: new Map([["shell-command", unsupportedBackend]]),
			holderId: "scheduler-b",
			now: () => "2026-06-04T04:01:01.000Z",
		});
		expect(unsupportedBackend.start).toHaveBeenCalledTimes(1);
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

async function cancellationRunFixture(
	store: FileRunStore,
	options: { runId: string },
): Promise<RunRecord> {
	const run = await store.createRun({
		scope: "plan-a",
		runId: options.runId,
		status: "running",
	});
	await store.writeRunGraph(ref(run), {
		steps: [graphStep(run, "build")],
		edges: [],
	});
	await store.writeStepRecord(ref(run), {
		...stepRecord(run, "build"),
		status: "ready",
	});
	await store.writeSchedulerState(ref(run), {
		readyStepIds: ["build"],
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt: "2026-06-04T04:00:00.000Z",
	});
	return run;
}

function graphStep(record: RunRecord, id: string): RunGraph["steps"][number] {
	return {
		id,
		runId: record.runId,
		title: id,
		kind: "command",
		backend: { name: "shell-command" },
		dependsOn: [],
		inputArtifacts: [],
	};
}

function stepRecord(record: RunRecord, id: string): StepRecord {
	return {
		...graphStep(record, id),
		status: "pending",
		outputArtifacts: [],
	};
}

interface PendingTracker {
	started: string[];
	result: Deferred<StepResult>;
}

function pendingTracker(): PendingTracker {
	return {
		started: [],
		result: deferred<StepResult>(),
	};
}

function pendingBackend(
	name: KnownBackendName,
	options: { tracker: PendingTracker; canCancel: boolean },
): RunGraphSchedulerBackend {
	return {
		name,
		capabilities: {
			canResume: false,
			canCancel: options.canCancel,
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
			options.tracker.started.push(prepared.step.id);
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: options.tracker.result.promise,
			};
		}),
		cancel: vi.fn(async (_handle: BackendHandle<StepResult>) => undefined),
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
