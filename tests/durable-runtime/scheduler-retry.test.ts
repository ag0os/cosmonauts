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

const temp = useTempDir("durable-scheduler-retry-");

describe("durable scheduler retries", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-007
	test("retries with a new attempt record and preserves prior failed attempt evidence", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await retryRunFixture(store, {
			runId: "run-retry-preserves-attempts",
			policy: { retryLimit: 1 },
		});
		const backend = sequencedBackend("shell-command", [
			{
				outcome: "failed",
				summary: "transient failure",
				artifacts: [{ id: "log", path: "steps/build/attempt-001/log.txt" }],
				nextAction: "retry",
			},
			{
				outcome: "success",
				summary: "retry completed",
				artifacts: [
					{ id: "report", path: "steps/build/attempt-002/report.md" },
				],
			},
		]);

		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T01:00:00.000Z",
		});

		await expect(
			store.readStepAttemptRecord({
				...ref(run),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toEqual({
			attemptId: "attempt-001",
			startedAt: "2026-06-04T01:00:00.000Z",
			endedAt: "2026-06-04T01:00:00.000Z",
			result: {
				outcome: "failed",
				summary: "transient failure",
				artifacts: [{ id: "log", path: "steps/build/attempt-001/log.txt" }],
				nextAction: "retry",
			},
		});
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "ready",
				latestAttemptId: "attempt-001",
				result: expect.objectContaining({
					outcome: "failed",
					nextAction: "retry",
				}),
			}),
		);
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));

		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T01:01:00.000Z",
		});

		await expect(
			store.listStepAttemptRecords({ ...ref(run), stepId: "build" }),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T01:00:00.000Z",
				endedAt: "2026-06-04T01:00:00.000Z",
				result: {
					outcome: "failed",
					summary: "transient failure",
					artifacts: [{ id: "log", path: "steps/build/attempt-001/log.txt" }],
					nextAction: "retry",
				},
			},
			{
				attemptId: "attempt-002",
				startedAt: "2026-06-04T01:01:00.000Z",
				endedAt: "2026-06-04T01:01:00.000Z",
				result: {
					outcome: "success",
					summary: "retry completed",
					artifacts: [
						{ id: "report", path: "steps/build/attempt-002/report.md" },
					],
				},
			},
		]);
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "completed",
				latestAttemptId: "attempt-002",
				result: expect.objectContaining({ outcome: "success" }),
			}),
		);
		expect(backend.start).toHaveBeenCalledTimes(2);

		const completedRun = await store.createRun({
			scope: "plan-a",
			runId: "run-completed-not-retried",
			status: "running",
			policy: { retryLimit: 3 },
		});
		await store.writeRunGraph(ref(completedRun), {
			steps: [graphStep(completedRun, "done", [])],
			edges: [],
		});
		await store.writeStepRecord(ref(completedRun), {
			...stepRecord(completedRun, "done", []),
			status: "completed",
			latestAttemptId: "attempt-001",
			result: {
				outcome: "success",
				summary: "already completed",
				artifacts: [],
			},
		});
		await store.writeStepAttemptRecord(
			{ ...ref(completedRun), stepId: "done" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T01:02:00.000Z",
				endedAt: "2026-06-04T01:02:00.000Z",
				result: {
					outcome: "success",
					summary: "already completed",
					artifacts: [],
				},
			},
		);
		const forbiddenBackend = sequencedBackend("shell-command", [
			{
				outcome: "success",
				summary: "must not run",
				artifacts: [],
			},
		]);

		await runDurableGraphScheduler({
			store,
			ref: ref(completedRun),
			backends: new Map([["shell-command", forbiddenBackend]]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T01:03:00.000Z",
		});

		expect(forbiddenBackend.start).not.toHaveBeenCalled();
		await expect(
			store.listStepAttemptRecords({ ...ref(completedRun), stepId: "done" }),
		).resolves.toHaveLength(1);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-008
	test("blocks unknown results and exhausted retries instead of advancing dependents", async () => {
		const store = new FileRunStore({ rootDir: temp.path });

		const unknownRun = await retryRunFixture(store, {
			runId: "run-unknown-blocks",
			policy: { retryLimit: 1 },
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(unknownRun),
			backends: new Map([
				[
					"shell-command",
					sequencedBackend("shell-command", [
						{
							outcome: "unknown",
							summary: "report could not be parsed",
							artifacts: [],
						},
					]),
				],
			]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T02:00:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(unknownRun), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "blocked",
				result: expect.objectContaining({
					outcome: "blocked",
					summary: "report could not be parsed",
				}),
			}),
		);
		await expect(
			store.readStepAttemptRecord({
				...ref(unknownRun),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				result: expect.objectContaining({ outcome: "unknown" }),
			}),
		);
		await expect(
			store.readStepRecord({ ...ref(unknownRun), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));
		await expect(store.loadRun(ref(unknownRun))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);

		const malformedRun = await retryRunFixture(store, {
			runId: "run-malformed-blocks",
			policy: { retryLimit: 1 },
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(malformedRun),
			backends: new Map([
				["shell-command", malformedBackend("shell-command", { nope: true })],
			]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T02:01:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(malformedRun), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "blocked",
				result: expect.objectContaining({
					outcome: "blocked",
					summary: "Backend returned a malformed scheduler result.",
				}),
			}),
		);
		await expect(
			store.readStepAttemptRecord({
				...ref(malformedRun),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				result: expect.objectContaining({ outcome: "unknown" }),
			}),
		);
		await expect(
			store.readStepRecord({ ...ref(malformedRun), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));

		const exhaustedRun = await retryRunFixture(store, {
			runId: "run-exhausted-blocks",
			stepRetryPolicy: { maxAttempts: 1 },
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(exhaustedRun),
			backends: new Map([
				[
					"shell-command",
					sequencedBackend("shell-command", [
						{
							outcome: "failed",
							summary: "still failing",
							artifacts: [],
							nextAction: "retry",
						},
					]),
				],
			]),
			holderId: "scheduler-a",
			now: () => "2026-06-04T02:02:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(exhaustedRun), stepId: "build" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "blocked",
				result: expect.objectContaining({
					outcome: "blocked",
					summary: "Retry attempts exhausted after 1 attempt.",
				}),
			}),
		);
		await expect(
			store.readStepAttemptRecord({
				...ref(exhaustedRun),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				result: expect.objectContaining({
					outcome: "failed",
					nextAction: "retry",
				}),
			}),
		);
		await expect(
			store.readStepRecord({ ...ref(exhaustedRun), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));
		await expect(store.loadRun(ref(exhaustedRun))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
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

async function retryRunFixture(
	store: FileRunStore,
	options: {
		runId: string;
		policy?: Parameters<FileRunStore["createRun"]>[0]["policy"];
		stepRetryPolicy?: StepRecord["retryPolicy"];
	},
): Promise<RunRecord> {
	const run = await store.createRun({
		scope: "plan-a",
		runId: options.runId,
		status: "running",
		policy: options.policy,
	});
	await store.writeRunGraph(ref(run), {
		steps: [graphStep(run, "build", []), graphStep(run, "verify", ["build"])],
		edges: [{ from: "build", to: "verify" }],
	});
	await store.writeStepRecord(ref(run), {
		...stepRecord(run, "build", []),
		status: "ready",
		retryPolicy: options.stepRetryPolicy,
	});
	await store.writeStepRecord(ref(run), stepRecord(run, "verify", ["build"]));
	await store.writeSchedulerState(ref(run), {
		readyStepIds: ["build"],
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt: "2026-06-04T00:00:00.000Z",
	});
	return run;
}

function sequencedBackend(
	name: KnownBackendName,
	results: StepResult[],
): RunGraphSchedulerBackend {
	return backendWithResultFactory(name, () => {
		const result = results.shift();
		if (!result) {
			throw new Error("No scheduler result queued for backend.");
		}
		return result;
	});
}

function malformedBackend(
	name: KnownBackendName,
	result: unknown,
): RunGraphSchedulerBackend {
	return backendWithResultFactory(name, () => result as StepResult);
}

function backendWithResultFactory(
	name: KnownBackendName,
	resultForStart: () => StepResult,
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
		start: vi.fn(async (prepared) => ({
			backend: prepared.backend,
			stepId: prepared.step.id,
			attemptId: prepared.attemptId,
			startedAt: prepared.preparedAt,
			result: Promise.resolve(resultForStart()),
		})),
	};
}
