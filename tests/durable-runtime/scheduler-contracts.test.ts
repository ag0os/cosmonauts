import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createDriveBackendOrchestrationAdapter } from "../../lib/driver/backends/orchestration-adapter.ts";
import type { Backend } from "../../lib/driver/backends/types.ts";
import type {
	ArtifactRef,
	ReadRunGraphResult,
	RetryPolicy,
	RunGraph,
	RunGraphSchedulerBackend,
	RunGraphSchedulerExitReason,
	RunGraphSchedulerResult,
	RunGraphStep,
	RunPolicy,
	SchedulerState,
	SchedulerStepInput,
	StepHeartbeat,
	StepLease,
	StepRecord,
} from "../../lib/durable-runtime/index.ts";

describe("durable runtime scheduler contracts", () => {
	// @cosmo-behavior plan:durable-graph-scheduler#B-001
	test("extends scheduler contracts without renaming durable runtime fields or statuses", async () => {
		const statuses = await statusUnions();
		expect(statuses.run).toEqual([
			"pending",
			"running",
			"completed",
			"blocked",
			"failed",
			"cancelled",
			"stale",
		]);
		expect(statuses.step).toEqual([
			"pending",
			"ready",
			"running",
			"completed",
			"blocked",
			"failed",
			"cancelled",
			"stale",
		]);
		expect([...statuses.run, ...statuses.step]).not.toContain("queued");
		expect([...statuses.run, ...statuses.step]).not.toContain("waiting");
		expect([...statuses.run, ...statuses.step]).not.toContain("leased");

		const lease: StepLease = {
			holderId: "scheduler-a",
			acquiredAt: "2026-06-04T00:00:00.000Z",
			expiresAt: "2026-06-04T00:05:00.000Z",
			renewable: true,
		};
		const heartbeat: StepHeartbeat = {
			at: "2026-06-04T00:01:00.000Z",
			note: "still running",
		};
		const retryPolicy: RetryPolicy = { maxAttempts: 2, backoffMs: 50 };
		const step: StepRecord = {
			id: "build",
			runId: "run-scheduler-contracts",
			title: "Build",
			kind: "command",
			backend: { name: "shell-command" },
			dependsOn: [],
			status: "running",
			inputArtifacts: [],
			outputArtifacts: [],
			lease,
			heartbeat,
			retryPolicy,
		};
		expect(step.lease?.holderId).toBe("scheduler-a");
		expect(step.heartbeat?.note).toBe("still running");
		expect(step.retryPolicy?.maxAttempts).toBe(2);

		const policy: RunPolicy = {
			reportInference: "strict",
			defaultBackend: { name: "shell-command" },
			worktree: { mode: "shared" },
			maxParallelSteps: 1,
			staleHeartbeatMs: 60_000,
			retryLimit: 1,
			idleTimeoutMs: 300_000,
			hardTimeoutMs: 3_600_000,
		};
		expect(policy.retryPotentiallyCommittedSteps).toBeUndefined();

		const artifacts: ArtifactRef[] = [{ id: "input", path: "artifacts/in.md" }];
		const graphStep: RunGraphStep = {
			id: step.id,
			runId: step.runId,
			title: step.title,
			kind: step.kind,
			backend: step.backend,
			dependsOn: step.dependsOn,
			inputArtifacts: artifacts,
		};
		expect(graphStep).not.toHaveProperty("status");
		expect(graphStep).not.toHaveProperty("result");
		expect(graphStep).not.toHaveProperty("latestAttemptId");
		expect(graphStep).not.toHaveProperty("lease");
		expect(graphStep).not.toHaveProperty("heartbeat");
		expect(graphStep).not.toHaveProperty("retryPolicy");

		const graph: RunGraph = {
			steps: [graphStep],
			edges: [{ from: "build", to: "verify" }],
		};
		const readGraph: ReadRunGraphResult = { graph, diagnostics: [] };
		expect(readGraph.graph.steps[0]).toEqual(graphStep);

		const state: SchedulerState = {
			readyStepIds: ["build"],
			leasesByStepId: { build: lease },
			heartbeatsByStepId: { build: heartbeat },
			cursor: 2,
			updatedAt: "2026-06-04T00:01:00.000Z",
		};
		expect(state.readyStepIds).toEqual(["build"]);
		expect(state.leasesByStepId.build).toEqual(lease);
		expect(state.heartbeatsByStepId.build).toEqual(heartbeat);

		const schedulerInput: SchedulerStepInput = {
			runId: step.runId,
			stepId: step.id,
			inputArtifacts: artifacts,
			backendOptions: { command: "bun run test" },
		};
		const schedulerBackend: RunGraphSchedulerBackend = {
			name: "shell-command",
			capabilities: {
				canResume: false,
				canCancel: false,
				canCommit: false,
				isolatedFromHostSource: true,
				emitsMachineReport: true,
			},
			async prepare(stepRecord, context) {
				expect(context.input).toEqual(schedulerInput);
				return {
					step: stepRecord,
					attemptId: context.attemptId,
					backend: stepRecord.backend,
					input: context.input,
					preparedAt: context.now?.() ?? "2026-06-04T00:00:00.000Z",
				};
			},
			async start(prepared) {
				return {
					backend: prepared.backend,
					stepId: prepared.step.id,
					attemptId: prepared.attemptId,
					startedAt: prepared.preparedAt,
					result: Promise.resolve({
						outcome: "success",
						summary: "completed",
						artifacts: [],
					}),
				};
			},
		};
		expect(schedulerBackend.name).toBe("shell-command");

		const exitReason: RunGraphSchedulerExitReason = "drained";
		const result = {
			run: {
				scope: "plan-a",
				runId: step.runId,
				status: "running",
				createdAt: "2026-06-04T00:00:00.000Z",
				updatedAt: "2026-06-04T00:00:00.000Z",
				runDir: "/tmp/run",
				graphPath: "/tmp/run/graph.json",
				eventsPath: "/tmp/run/events.jsonl",
				artifactsDir: "/tmp/run/artifacts",
				schedulerStatePath: "/tmp/run/scheduler.json",
				stepsDir: "/tmp/run/steps",
				policy,
			},
			steps: [step],
			diagnostics: [],
			exitReason,
		} satisfies RunGraphSchedulerResult;
		expect(result.exitReason).toBe("drained");
	});

	// @cosmo-behavior plan:durable-graph-scheduler#B-020
	test("does not accept Drive orchestration adapters without a Plan 4 BackendInvocation builder", async () => {
		const driveBackend: Backend = {
			name: "codex",
			capabilities: { canCommit: false, isolatedFromHostSource: true },
			async run(invocation) {
				return {
					exitCode: 0,
					stdout: invocation.promptPath,
					durationMs: 1,
				};
			},
		};
		const driveAdapter = createDriveBackendOrchestrationAdapter({
			name: "codex",
			backend: driveBackend,
		});

		// @ts-expect-error Plan 3 scheduler backends require SchedulerStepInput -> StepResult, not Drive BackendInvocation -> BackendRunResult.
		const unsafeRegistry: ReadonlyMap<string, RunGraphSchedulerBackend> =
			new Map([["codex", driveAdapter]]);
		expect(unsafeRegistry.size).toBe(1);

		const schedulerSource = await readFile(
			"lib/durable-runtime/scheduler.ts",
			"utf-8",
		);
		expect(schedulerSource).not.toMatch(/driver\/backends/);
		expect(schedulerSource).not.toContain("BackendInvocation");

		const driverBackendTypes = await readFile(
			"lib/driver/backends/types.ts",
			"utf-8",
		);
		for (const field of [
			"runId",
			"promptPath",
			"workdir",
			"projectRoot",
			"taskId",
			"parentSessionId",
			"planSlug",
			"eventSink",
		]) {
			expect(driverBackendTypes).toContain(field);
		}
	});
});

async function statusUnions(): Promise<{ run: string[]; step: string[] }> {
	const source = await readFile("lib/durable-runtime/types.ts", "utf-8");
	return {
		run: extractUnionLiterals(source, "RunStatus"),
		step: extractUnionLiterals(source, "StepStatus"),
	};
}

function extractUnionLiterals(source: string, name: string): string[] {
	const match = source.match(
		new RegExp(`export type ${name} =([\\s\\S]*?);`, "m"),
	);
	if (!match?.[1]) {
		throw new Error(`Missing ${name} union`);
	}
	return [...match[1].matchAll(/"([^"]+)"/g)].flatMap((literal) =>
		literal[1] === undefined ? [] : [literal[1]],
	);
}
