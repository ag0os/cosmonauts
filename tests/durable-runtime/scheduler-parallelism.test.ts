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

const temp = useTempDir("durable-scheduler-parallelism-");

describe("durable scheduler parallelism", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-012
	test("defaults to one running step and never exceeds explicit maxParallelSteps", async () => {
		const defaultStore = new FileRunStore({ rootDir: temp.path });
		const defaultRun = await parallelRunFixture(defaultStore, {
			runId: "run-defaults-sequential",
			stepIds: ["build-a", "build-b", "build-c"],
		});
		const defaultTracker = activeTracker();
		const defaultBackend = pendingBackend("shell-command", {
			tracker: defaultTracker,
			capabilities: { canCommit: false, isolatedFromHostSource: true },
		});

		const defaultScheduler = runDurableGraphScheduler({
			store: defaultStore,
			ref: ref(defaultRun),
			backends: new Map([["shell-command", defaultBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T03:00:00.000Z",
		});

		await vi.waitFor(() => expect(defaultTracker.started).toHaveLength(1));
		expect(defaultTracker.active).toBe(1);
		expect(defaultTracker.maxObserved).toBe(1);
		expect(defaultBackend.start).toHaveBeenCalledTimes(1);

		defaultTracker.resolve("build-a");
		await defaultScheduler;
		expect(defaultTracker.maxObserved).toBe(1);
		await expect(
			defaultStore.readStepRecord({ ...ref(defaultRun), stepId: "build-a" }),
		).resolves.toEqual(expect.objectContaining({ status: "completed" }));
		await expect(
			defaultStore.readStepRecord({ ...ref(defaultRun), stepId: "build-b" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));

		const cappedStore = new FileRunStore({ rootDir: temp.path });
		const cappedRun = await parallelRunFixture(cappedStore, {
			runId: "run-explicit-cap",
			stepIds: ["build-a", "build-b", "build-c"],
			policy: { maxParallelSteps: 2 },
		});
		const cappedTracker = activeTracker();
		const cappedBackend = pendingBackend("shell-command", {
			tracker: cappedTracker,
			capabilities: { canCommit: false, isolatedFromHostSource: true },
		});

		const cappedScheduler = runDurableGraphScheduler({
			store: cappedStore,
			ref: ref(cappedRun),
			backends: new Map([["shell-command", cappedBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T03:01:00.000Z",
		});

		await vi.waitFor(() => expect(cappedTracker.started).toHaveLength(2));
		expect(cappedTracker.active).toBe(2);
		expect(cappedTracker.maxObserved).toBe(2);
		expect(cappedBackend.start).toHaveBeenCalledTimes(2);

		cappedTracker.resolveAll();
		await cappedScheduler;
		expect(cappedTracker.maxObserved).toBeLessThanOrEqual(2);
		await expect(
			cappedStore.readStepRecord({ ...ref(cappedRun), stepId: "build-c" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-016
	test("caps shared-worktree committing backends to sequential while isolated non-committing backends run in parallel", async () => {
		const sharedStore = new FileRunStore({ rootDir: temp.path });
		const sharedRun = await parallelRunFixture(sharedStore, {
			runId: "run-shared-committing-cap",
			stepIds: ["commit-a", "commit-b"],
			policy: { maxParallelSteps: 2, worktree: { mode: "shared" } },
		});
		const sharedTracker = activeTracker();
		const committingBackend = pendingBackend("shell-command", {
			tracker: sharedTracker,
			capabilities: { canCommit: true, isolatedFromHostSource: false },
		});

		const sharedScheduler = runDurableGraphScheduler({
			store: sharedStore,
			ref: ref(sharedRun),
			backends: new Map([["shell-command", committingBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T03:02:00.000Z",
		});

		await vi.waitFor(() => expect(sharedTracker.started).toHaveLength(1));
		expect(sharedTracker.active).toBe(1);
		expect(sharedTracker.maxObserved).toBe(1);
		expect(committingBackend.start).toHaveBeenCalledTimes(1);

		sharedTracker.resolve("commit-a");
		const sharedResult = await sharedScheduler;
		expect(sharedTracker.maxObserved).toBe(1);
		expect(sharedResult.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "shared_worktree_mutable_concurrency_capped",
				}),
			]),
		);
		await expect(
			sharedStore.readStepRecord({ ...ref(sharedRun), stepId: "commit-b" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));

		const isolatedStore = new FileRunStore({ rootDir: temp.path });
		const isolatedRun = await parallelRunFixture(isolatedStore, {
			runId: "run-isolated-non-committing-parallel",
			stepIds: ["safe-a", "safe-b"],
			policy: { maxParallelSteps: 2, worktree: { mode: "shared" } },
		});
		const isolatedTracker = activeTracker();
		const safeBackend = pendingBackend("shell-command", {
			tracker: isolatedTracker,
			capabilities: { canCommit: false, isolatedFromHostSource: true },
		});

		const isolatedScheduler = runDurableGraphScheduler({
			store: isolatedStore,
			ref: ref(isolatedRun),
			backends: new Map([["shell-command", safeBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T03:03:00.000Z",
		});

		await vi.waitFor(() => expect(isolatedTracker.started).toHaveLength(2));
		expect(isolatedTracker.active).toBe(2);
		expect(isolatedTracker.maxObserved).toBe(2);
		expect(safeBackend.start).toHaveBeenCalledTimes(2);

		isolatedTracker.resolveAll();
		await isolatedScheduler;
		expect(isolatedTracker.maxObserved).toBeLessThanOrEqual(2);
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

async function parallelRunFixture(
	store: FileRunStore,
	options: {
		runId: string;
		stepIds: string[];
		policy?: Parameters<FileRunStore["createRun"]>[0]["policy"];
	},
): Promise<RunRecord> {
	const run = await store.createRun({
		scope: "plan-a",
		runId: options.runId,
		status: "running",
		policy: options.policy,
	});
	await store.writeRunGraph(ref(run), {
		steps: options.stepIds.map((stepId) => graphStep(run, stepId)),
		edges: [],
	});
	for (const stepId of options.stepIds) {
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, stepId),
			status: "ready",
		});
	}
	await store.writeSchedulerState(ref(run), {
		readyStepIds: options.stepIds,
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt: "2026-06-04T03:00:00.000Z",
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

interface ActiveTracker {
	active: number;
	maxObserved: number;
	started: string[];
	resultsByStepId: Map<string, Deferred<StepResult>>;
	resolve(stepId: string): void;
	resolveAll(): void;
}

function activeTracker(): ActiveTracker {
	const tracker: ActiveTracker = {
		active: 0,
		maxObserved: 0,
		started: [],
		resultsByStepId: new Map(),
		resolve(stepId: string) {
			this.resultsByStepId.get(stepId)?.resolve({
				outcome: "success",
				summary: `${stepId} completed`,
				artifacts: [],
			});
		},
		resolveAll() {
			for (const stepId of this.started) {
				this.resolve(stepId);
			}
		},
	};
	return tracker;
}

function pendingBackend(
	name: KnownBackendName,
	options: {
		tracker: ActiveTracker;
		capabilities: { canCommit: boolean; isolatedFromHostSource: boolean };
	},
): RunGraphSchedulerBackend {
	return {
		name,
		capabilities: {
			canResume: false,
			canCancel: false,
			canCommit: options.capabilities.canCommit,
			isolatedFromHostSource: options.capabilities.isolatedFromHostSource,
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
			const result = deferred<StepResult>();
			options.tracker.resultsByStepId.set(prepared.step.id, result);
			options.tracker.started.push(prepared.step.id);
			options.tracker.active += 1;
			options.tracker.maxObserved = Math.max(
				options.tracker.maxObserved,
				options.tracker.active,
			);
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: result.promise.finally(() => {
					options.tracker.active -= 1;
				}),
			};
		}),
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
