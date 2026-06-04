import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type KnownBackendName,
	type RunGraph,
	type RunGraphSchedulerBackend,
	type RunRecord,
	runDurableGraphScheduler,
	type StepRecord,
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
