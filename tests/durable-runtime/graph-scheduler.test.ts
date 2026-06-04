import { readFile } from "node:fs/promises";
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

const temp = useTempDir("durable-graph-scheduler-");

describe("durable graph scheduler", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-003
	test("marks dependency-satisfied steps ready and leaves blocked dependencies pending", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-graph-readiness",
			status: "running",
		});
		const graph: RunGraph = {
			steps: [
				graphStep(run, "build", []),
				graphStep(run, "verify", ["build"]),
				graphStep(run, "publish", ["verify"]),
			],
			edges: [
				{ from: "build", to: "verify" },
				{ from: "verify", to: "publish" },
			],
		};
		await store.writeRunGraph(ref(run), graph);
		await store.writeStepRecord(ref(run), stepRecord(run, "build", []));
		await store.writeStepRecord(ref(run), stepRecord(run, "verify", ["build"]));
		await store.writeStepRecord(
			ref(run),
			stepRecord(run, "publish", ["verify"]),
		);

		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: emptyBackends(),
			holderId: "scheduler-a",
			now: () => "2026-06-04T00:00:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "publish" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));
		await expect(store.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: ["build"],
				updatedAt: "2026-06-04T00:00:00.000Z",
			}),
		);

		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "build", []),
			status: "completed",
			result: {
				outcome: "success",
				summary: "build completed",
				artifacts: [],
			},
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: emptyBackends(),
			holderId: "scheduler-a",
			now: () => "2026-06-04T00:01:00.000Z",
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: emptyBackends(),
			holderId: "scheduler-a",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(run), stepId: "build" }),
		).resolves.toEqual(expect.objectContaining({ status: "completed" }));
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));
		await expect(
			store.readStepRecord({ ...ref(run), stepId: "publish" }),
		).resolves.toEqual(expect.objectContaining({ status: "pending" }));
		await expect(store.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				readyStepIds: ["verify"],
				updatedAt: "2026-06-04T00:01:00.000Z",
			}),
		);

		const events = await store.readEvents(ref(run));
		expect(
			events.events.map((stored) => ({
				seq: stored.seq,
				event: stored.event,
			})),
		).toEqual([
			{
				seq: 1,
				event: { type: "step_ready", runId: run.runId, stepId: "build" },
			},
			{
				seq: 2,
				event: { type: "step_ready", runId: run.runId, stepId: "verify" },
			},
		]);

		const schedulerStateSource = await readFile(
			"lib/durable-runtime/scheduler-state.ts",
			"utf-8",
		);
		expect(schedulerStateSource).not.toMatch(/from\s+["']node:/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*driver/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*cli/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*domains/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*prompts/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*tasks/);
		expect(schedulerStateSource).not.toMatch(/from\s+["'][^"']*orchestration/);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-004
	test("acquires renews and releases step leases only for the matching holder", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const run = await store.createRun({
			scope: "plan-a",
			runId: "run-lease-lifecycle",
			status: "running",
		});
		const graph: RunGraph = {
			steps: [
				graphStep(run, "foreign-running", []),
				graphStep(run, "owned-running", []),
			],
			edges: [],
		};
		await store.writeRunGraph(ref(run), graph);

		const foreignLease = {
			holderId: "holder-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const foreignHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "owned elsewhere",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "foreign-running", []),
			status: "running",
			lease: foreignLease,
			heartbeat: foreignHeartbeat,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "foreign-running" },
			foreignHeartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "foreign-running" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);

		const ownedLease = {
			holderId: "holder-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const ownedHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "old heartbeat",
		};
		await store.writeStepRecord(ref(run), {
			...stepRecord(run, "owned-running", []),
			status: "running",
			lease: ownedLease,
			heartbeat: ownedHeartbeat,
			latestAttemptId: "attempt-001",
		});
		await store.writeStepHeartbeat(
			{ ...ref(run), stepId: "owned-running" },
			ownedHeartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(run), stepId: "owned-running" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);

		await store.writeSchedulerState(ref(run), {
			readyStepIds: [],
			leasesByStepId: {
				"foreign-running": foreignLease,
				"owned-running": ownedLease,
			},
			heartbeatsByStepId: {
				"foreign-running": foreignHeartbeat,
				"owned-running": ownedHeartbeat,
			},
			updatedAt: "2026-06-04T00:01:00.000Z",
		});

		const startChecks: string[] = [];
		const backend = schedulerBackend("shell-command");

		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "holder-b",
			now: () => "2026-06-04T00:02:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(run), stepId: "foreign-running" }),
		).resolves.toEqual(
			expect.objectContaining({
				lease: foreignLease,
				heartbeat: foreignHeartbeat,
				status: "running",
			}),
		);

		await runDurableGraphScheduler({
			store,
			ref: ref(run),
			backends: new Map([["shell-command", backend]]),
			holderId: "holder-a",
			now: () => "2026-06-04T00:03:00.000Z",
		});

		await expect(
			store.readStepRecord({ ...ref(run), stepId: "foreign-running" }),
		).resolves.toEqual(
			expect.objectContaining({
				status: "running",
				lease: expect.objectContaining({
					holderId: "holder-a",
					acquiredAt: "2026-06-04T00:03:00.000Z",
				}),
				heartbeat: { at: "2026-06-04T00:03:00.000Z", note: "renewed" },
				latestAttemptId: "attempt-001",
			}),
		);
		await expect(
			store.listStepAttemptRecords({ ...ref(run), stepId: "foreign-running" }),
		).resolves.toHaveLength(1);

		const executionRun = await store.createRun({
			scope: "plan-a",
			runId: "run-lease-execution",
			status: "running",
		});
		await store.writeRunGraph(ref(executionRun), {
			steps: [graphStep(executionRun, "build", [])],
			edges: [],
		});
		await store.writeStepRecord(ref(executionRun), {
			...stepRecord(executionRun, "build", []),
			status: "ready",
		});
		await store.writeSchedulerState(ref(executionRun), {
			readyStepIds: ["build"],
			leasesByStepId: {},
			heartbeatsByStepId: {},
			updatedAt: "2026-06-04T00:03:30.000Z",
		});
		const executionBackend = schedulerBackend("shell-command", {
			started: async (stepId) => {
				const step = await store.readStepRecord({
					...ref(executionRun),
					stepId,
				});
				const attempt = await store.readStepAttemptRecord({
					...ref(executionRun),
					stepId,
					attemptId: "attempt-001",
				});
				const state = await store.readSchedulerState(ref(executionRun));

				expect(step).toMatchObject({
					status: "running",
					latestAttemptId: "attempt-001",
					lease: { holderId: "holder-a" },
					heartbeat: { at: "2026-06-04T00:04:00.000Z" },
				});
				expect(attempt).toEqual({
					attemptId: "attempt-001",
					startedAt: "2026-06-04T00:04:00.000Z",
				});
				expect(state.leasesByStepId[stepId]?.holderId).toBe("holder-a");
				startChecks.push(stepId);
			},
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(executionRun),
			backends: new Map([["shell-command", executionBackend]]),
			holderId: "holder-a",
			now: () => "2026-06-04T00:04:00.000Z",
		});

		expect(startChecks).toEqual(["build"]);
		await expect(
			store.readStepAttemptRecord({
				...ref(executionRun),
				stepId: "build",
				attemptId: "attempt-001",
			}),
		).resolves.toMatchObject({
			attemptId: "attempt-001",
			startedAt: "2026-06-04T00:04:00.000Z",
			endedAt: "2026-06-04T00:04:00.000Z",
			result: { outcome: "success" },
		});
		const completedBuild = await store.readStepRecord({
			...ref(executionRun),
			stepId: "build",
		});
		expect(completedBuild).toEqual(
			expect.objectContaining({
				status: "completed",
				latestAttemptId: "attempt-001",
			}),
		);
		expect(completedBuild).not.toHaveProperty("lease");
		await expect(store.readSchedulerState(ref(run))).resolves.toEqual(
			expect.objectContaining({
				leasesByStepId: {
					"foreign-running": expect.objectContaining({ holderId: "holder-a" }),
					"owned-running": ownedLease,
				},
			}),
		);
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-013
	test("finalizes run from terminal step outcomes without nonterminal demotion", async () => {
		const store = new FileRunStore({ rootDir: temp.path });

		const completed = await terminalRunFixture(store, {
			runId: "run-finalizes-completed",
			stepId: "build",
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(completed),
			backends: new Map([
				[
					"shell-command",
					schedulerBackend("shell-command", {
						result: {
							outcome: "success",
							summary: "build completed",
							artifacts: [],
						},
					}),
				],
			]),
			holderId: "holder-a",
			now: () => "2026-06-04T00:10:00.000Z",
		});
		await expect(store.loadRun(ref(completed))).resolves.toEqual(
			expect.objectContaining({ status: "completed" }),
		);
		await expect(store.readEvents(ref(completed))).resolves.toEqual(
			expect.objectContaining({
				events: expect.arrayContaining([
					expect.objectContaining({
						event: expect.objectContaining({ type: "run_completed" }),
					}),
				]),
			}),
		);

		const blocked = await terminalRunFixture(store, {
			runId: "run-finalizes-blocked",
			stepId: "verify",
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(blocked),
			backends: new Map([
				[
					"shell-command",
					schedulerBackend("shell-command", {
						result: {
							outcome: "blocked",
							summary: "needs human input",
							artifacts: [],
							nextAction: "wait_for_human",
						},
					}),
				],
			]),
			holderId: "holder-a",
			now: () => "2026-06-04T00:11:00.000Z",
		});
		await expect(store.loadRun(ref(blocked))).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);
		await expect(
			store.readStepRecord({ ...ref(blocked), stepId: "verify" }),
		).resolves.toEqual(expect.objectContaining({ status: "blocked" }));

		const terminal = await terminalRunFixture(store, {
			runId: "run-terminal-not-demoted",
			stepId: "publish",
			status: "completed",
		});
		const forbiddenBackend = schedulerBackend("shell-command", {
			started: () => {
				throw new Error("terminal runs must not start backend work");
			},
		});
		await runDurableGraphScheduler({
			store,
			ref: ref(terminal),
			backends: new Map([["shell-command", forbiddenBackend]]),
			holderId: "holder-a",
			now: () => "2026-06-04T00:12:00.000Z",
		});
		await expect(store.loadRun(ref(terminal))).resolves.toEqual(
			expect.objectContaining({ status: "completed" }),
		);
		await expect(store.readEvents(ref(terminal))).resolves.toEqual(
			expect.objectContaining({ events: [] }),
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

function emptyBackends(): ReadonlyMap<
	KnownBackendName,
	RunGraphSchedulerBackend
> {
	return new Map();
}

interface SchedulerBackendOptions {
	result?: StepResult;
	started?: (stepId: string) => void | Promise<void>;
}

function schedulerBackend(
	name: KnownBackendName,
	options: SchedulerBackendOptions = {},
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
			await options.started?.(prepared.step.id);
			const result: StepResult = options.result ?? {
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

async function terminalRunFixture(
	store: FileRunStore,
	options: { runId: string; stepId: string; status?: RunRecord["status"] },
): Promise<RunRecord> {
	const run = await store.createRun({
		scope: "plan-a",
		runId: options.runId,
		status: options.status ?? "running",
	});
	await store.writeRunGraph(ref(run), {
		steps: [graphStep(run, options.stepId, [])],
		edges: [],
	});
	await store.writeStepRecord(ref(run), {
		...stepRecord(run, options.stepId, []),
		status: "ready",
	});
	await store.writeSchedulerState(ref(run), {
		readyStepIds: [options.stepId],
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt: "2026-06-04T00:09:00.000Z",
	});
	return run;
}
