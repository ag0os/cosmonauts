import { access, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type RunGraph,
	type RunRecord,
	type SchedulerState,
	type StepHeartbeat,
	type StepLease,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-scheduler-store-");

describe("durable scheduler store primitives", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-002
	test("persists graph scheduler state leases heartbeats and diagnostics through the store", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-scheduler-store",
		});
		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "leased",
		};
		const graph: RunGraph = {
			steps: [
				{
					id: "build",
					runId: record.runId,
					title: "Build",
					kind: "command",
					backend: { name: "shell-command" },
					dependsOn: [],
					inputArtifacts: [{ id: "prompt", path: "artifacts/prompt.md" }],
					status: "completed",
					result: {
						outcome: "success",
						summary: "graph file must not own this mutable field",
						artifacts: [],
					},
					latestAttemptId: "attempt-from-graph",
					lease,
					heartbeat,
					retryPolicy: { maxAttempts: 7 },
					outputArtifacts: [{ id: "out", path: "artifacts/out.md" }],
				} as never,
			],
			edges: [{ from: "build", to: "verify" }],
		};
		const step = stepRecord(record, { lease, heartbeat });
		const state: SchedulerState = {
			readyStepIds: [step.id],
			leasesByStepId: { [step.id]: lease },
			heartbeatsByStepId: { [step.id]: heartbeat },
			cursor: 4,
			updatedAt: "2026-06-04T00:01:00.000Z",
		};

		await store.writeRunGraph(ref(record), graph);
		await store.writeStepRecord(ref(record), step);
		await store.writeSchedulerState(ref(record), state);
		await store.writeStepHeartbeat(
			{ ...ref(record), stepId: step.id },
			heartbeat,
		);
		await store.writeStepAttemptRecord(
			{ ...ref(record), stepId: step.id },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		);
		await store.appendDiagnostic(ref(record), {
			code: "scheduler_contract_diagnostic",
			message: "diagnostic evidence is stored in the normalized stream",
			details: { stepId: step.id },
		});

		for (const path of [
			record.graphPath,
			record.schedulerStatePath,
			join(record.stepsDir, step.id, "step.json"),
			join(record.stepsDir, step.id, "heartbeat.json"),
			join(record.stepsDir, step.id, "attempts", "attempt-001", "attempt.json"),
		]) {
			await expect(access(path)).resolves.toBeUndefined();
			expect(relative(record.runDir, path)).not.toMatch(/^\.\./);
		}

		const reopened = new FileRunStore({ rootDir: temp.path });
		await expect(reopened.readRunGraph(ref(record))).resolves.toEqual({
			graph: {
				steps: [
					{
						id: "build",
						runId: record.runId,
						title: "Build",
						kind: "command",
						backend: { name: "shell-command" },
						dependsOn: [],
						inputArtifacts: [{ id: "prompt", path: "artifacts/prompt.md" }],
					},
				],
				edges: [{ from: "build", to: "verify" }],
			},
			diagnostics: [
				expect.objectContaining({
					code: "ignored_graph_mutable_state",
					message: expect.stringContaining("build"),
					details: expect.objectContaining({
						stepId: "build",
						fields: expect.arrayContaining([
							"status",
							"result",
							"latestAttemptId",
							"lease",
							"heartbeat",
							"retryPolicy",
							"outputArtifacts",
						]),
					}),
				}),
			],
		});
		await expect(
			reopened.readStepRecord({ ...ref(record), stepId: step.id }),
		).resolves.toEqual(step);
		await expect(reopened.listStepRecords(ref(record))).resolves.toEqual([
			step,
		]);
		await expect(reopened.readSchedulerState(ref(record))).resolves.toEqual(
			state,
		);
		await expect(
			reopened.readStepHeartbeat({ ...ref(record), stepId: step.id }),
		).resolves.toEqual(heartbeat);
		await expect(
			reopened.listStepAttemptRecords({ ...ref(record), stepId: step.id }),
		).resolves.toEqual([
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-04T00:00:00.000Z",
			},
		]);

		const events = await reopened.readEvents(ref(record));
		expect(events.diagnostics).toEqual([
			expect.objectContaining({
				code: "scheduler_contract_diagnostic",
				details: { stepId: step.id },
			}),
		]);

		await expect(
			reopened.writeStepHeartbeat(
				{ ...ref(record), stepId: "../escape" },
				heartbeat,
			),
		).rejects.toThrow(/unsafe stepId/i);
		await expect(
			reopened.writeRunGraph(ref(record), {
				steps: [{ ...graph.steps[0], id: "../escape" }],
				edges: [],
			} as RunGraph),
		).rejects.toThrow(/unsafe stepId/i);
		await expect(access(join(temp.path, "escape"))).rejects.toThrow();

		const schedulerSource = await readFile(
			"lib/durable-runtime/scheduler.ts",
			"utf-8",
		);
		expect(schedulerSource).not.toMatch(
			/from\s+["']node:(?:fs|fs\/promises)["']/,
		);
		expect(schedulerSource).not.toContain("record.graphPath");
		expect(schedulerSource).not.toContain("schedulerStatePath");
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

function stepRecord(
	record: RunRecord,
	overrides: Partial<StepRecord> = {},
): StepRecord {
	return {
		id: "build",
		runId: record.runId,
		title: "Build",
		kind: "command",
		backend: { name: "shell-command" },
		dependsOn: [],
		status: "running",
		inputArtifacts: [{ id: "prompt", path: "artifacts/prompt.md" }],
		outputArtifacts: [],
		latestAttemptId: "attempt-001",
		...overrides,
	};
}
