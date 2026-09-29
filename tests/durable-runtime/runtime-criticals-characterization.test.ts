import { describe, expect, test } from "vitest";
import {
	type OrchestrationEvent,
	type RunGraph,
	type RunRecord,
	type RunRef,
	type RunStore,
	reconcileSchedulerState,
	runWatch,
	type SchedulerState,
	type StepRecord,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";

const RUN_ID = "run-characterize";
const REF: RunRef = { scope: "plan-a", runId: RUN_ID };

function envelope(
	seq: number,
	event: OrchestrationEvent,
): StoredOrchestrationEvent {
	return {
		seq,
		timestamp: "2026-06-04T00:00:00.000Z",
		runId: RUN_ID,
		event,
	};
}

async function summarize(event: OrchestrationEvent): Promise<string> {
	const stored = envelope(7, event);
	const store = {
		loadRun: async () => ({ scope: REF.scope, runId: RUN_ID }) as RunRecord,
		readEvents: async () => ({
			runId: RUN_ID,
			cursor: 7,
			events: [stored],
			diagnostics: [],
		}),
	} as unknown as RunStore;
	const summary = await runWatch(store, REF);
	expect(summary.events).toHaveLength(1);
	expect(summary.events[0]?.seq).toBe(7);
	expect(summary.events[0]?.envelope).toBe(stored);
	return summary.events[0]?.text ?? "";
}

describe("summarizeEvent through runWatch (characterization)", () => {
	const cases: Array<[string, OrchestrationEvent, string]> = [
		["run_started", { type: "run_started", runId: RUN_ID }, "7 run_started"],
		[
			"run_completed",
			{
				type: "run_completed",
				runId: RUN_ID,
				result: { outcome: "completed" },
			},
			"7 run_completed: completed",
		],
		[
			"run_blocked",
			{ type: "run_blocked", runId: RUN_ID, reason: "needs human" },
			"7 run_blocked: needs human",
		],
		[
			"run_failed",
			{ type: "run_failed", runId: RUN_ID, reason: "boom" },
			"7 run_failed: boom",
		],
		[
			"run_cancelled",
			{ type: "run_cancelled", runId: RUN_ID },
			"7 run_cancelled",
		],
		["run_stale", { type: "run_stale", runId: RUN_ID }, "7 run_stale"],
		[
			"step_ready",
			{ type: "step_ready", runId: RUN_ID, stepId: "S1" },
			"7 step_ready S1",
		],
		[
			"step_started",
			{
				type: "step_started",
				runId: RUN_ID,
				stepId: "S1",
				backend: "shell-command",
			},
			"7 step_started S1: shell-command",
		],
		[
			"step_heartbeat",
			{ type: "step_heartbeat", runId: RUN_ID, stepId: "S1" },
			"7 step_heartbeat S1",
		],
		[
			"step_output",
			{
				type: "step_output",
				runId: RUN_ID,
				stepId: "S1",
				chunk: "  line one\n\n line   two  ",
			},
			"7 step_output S1: line one line two",
		],
		[
			"step_tool_activity",
			{
				type: "step_tool_activity",
				runId: RUN_ID,
				stepId: "S1",
				details: { anything: true },
			},
			"7 step_tool_activity S1",
		],
		[
			"artifact_written with step",
			{
				type: "artifact_written",
				runId: RUN_ID,
				stepId: "S1",
				artifact: { id: "out", path: "artifacts/out.md" },
			},
			"7 artifact_written S1: out",
		],
		[
			"artifact_written without step",
			{
				type: "artifact_written",
				runId: RUN_ID,
				artifact: { id: "out", path: "artifacts/out.md" },
			},
			"7 artifact_written: out",
		],
		[
			"step_completed",
			{
				type: "step_completed",
				runId: RUN_ID,
				stepId: "S1",
				result: { outcome: "success", summary: "ok", artifacts: [] },
			},
			"7 step_completed S1: success",
		],
		[
			"step_failed",
			{ type: "step_failed", runId: RUN_ID, stepId: "S1", reason: "bad" },
			"7 step_failed S1: bad",
		],
		[
			"step_blocked",
			{ type: "step_blocked", runId: RUN_ID, stepId: "S1", reason: "wait" },
			"7 step_blocked S1: wait",
		],
		[
			"child_run_started",
			{
				type: "child_run_started",
				runId: RUN_ID,
				stepId: "S1",
				childRunId: "child-1",
			},
			"7 child_run_started S1: child-1",
		],
		[
			"step_cancelled",
			{ type: "step_cancelled", runId: RUN_ID, stepId: "S1" },
			"7 step_cancelled S1",
		],
		[
			"step_stale",
			{ type: "step_stale", runId: RUN_ID, stepId: "S1" },
			"7 step_stale S1",
		],
	];

	test.each(cases)("renders %s", async (_name, event, expected) => {
		expect(await summarize(event)).toBe(expected);
	});

	test("truncates step_output chunks longer than 80 characters to 77 plus an ellipsis", async () => {
		const text = await summarize({
			type: "step_output",
			runId: RUN_ID,
			stepId: "S1",
			chunk: "x".repeat(200),
		});
		expect(text).toBe(`7 step_output S1: ${"x".repeat(77)}...`);
	});

	test("keeps a step_output chunk of exactly 80 characters untruncated", async () => {
		const chunk = "y".repeat(80);
		expect(
			await summarize({
				type: "step_output",
				runId: RUN_ID,
				stepId: "S1",
				chunk,
			}),
		).toBe(`7 step_output S1: ${chunk}`);
	});

	const activityCases: Array<[string, unknown, string]> = [
		["non-object details", "plain", "7 run_activity"],
		["null details", null, "7 run_activity"],
		["other details kind", { kind: "artifact-disposition" }, "7 run_activity"],
		[
			"legacy_driver_event without event object",
			{ kind: "legacy_driver_event" },
			"7 run_activity: legacy_driver_event",
		],
		[
			"legacy_driver_event with null event",
			{ kind: "legacy_driver_event", event: null },
			"7 run_activity: legacy_driver_event",
		],
		[
			"legacy_driver_event with non-string event type",
			{ kind: "legacy_driver_event", event: { type: 3 } },
			"7 run_activity: legacy_driver_event",
		],
		[
			"legacy_driver_event with string event type",
			{ kind: "legacy_driver_event", event: { type: "task_done" } },
			"7 run_activity legacy_driver_event: task_done",
		],
	];

	test.each(
		activityCases,
	)("renders run_activity with %s", async (_n, details, expected) => {
		expect(
			await summarize({ type: "run_activity", runId: RUN_ID, details }),
		).toBe(expected);
	});
});

function validStep(overrides: Record<string, unknown> = {}): StepRecord {
	return {
		id: "S1",
		runId: RUN_ID,
		title: "Step",
		kind: "command",
		backend: { name: "shell-command" },
		dependsOn: [],
		status: "pending",
		inputArtifacts: [],
		outputArtifacts: [],
		...overrides,
	} as StepRecord;
}

async function reconcileWith(persisted: unknown) {
	const graph: RunGraph = {
		steps: [
			{
				id: "S1",
				runId: RUN_ID,
				title: "Step",
				kind: "command",
				backend: { name: "shell-command" },
				dependsOn: [],
				inputArtifacts: [],
			},
		],
		edges: [],
	};
	const state: SchedulerState = {
		readyStepIds: [],
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt: "2026-06-04T00:00:00.000Z",
	};
	const store = {
		readRunGraph: async () => ({ graph, diagnostics: [] }),
		readSchedulerState: async () => state,
		readStepRecord: async () => persisted,
		readStepHeartbeat: async () => undefined,
		writeStepRecord: async () => undefined,
		appendEvent: async () => undefined,
		writeSchedulerState: async () => undefined,
	} as unknown as RunStore;
	return reconcileSchedulerState({
		store,
		ref: REF,
		now: () => "2026-06-04T01:00:00.000Z",
	});
}

describe("isStepRecordLike through reconcileSchedulerState (characterization)", () => {
	test("accepts a well-formed persisted step record and promotes it to ready", async () => {
		const result = await reconcileWith(validStep());
		expect(result.diagnostics).toEqual([]);
		expect(result.steps.map((step) => [step.id, step.status])).toEqual([
			["S1", "ready"],
		]);
		expect(result.readyTransitionStepIds).toEqual(["S1"]);
	});

	test.each([
		"pending",
		"ready",
		"running",
		"completed",
		"blocked",
		"failed",
		"cancelled",
		"stale",
	])("accepts persisted status %s", async (status) => {
		const result = await reconcileWith(validStep({ status }));
		expect(result.diagnostics).toEqual([]);
		expect(result.steps).toHaveLength(1);
	});

	const invalid: Array<[string, unknown]> = [
		["a non-object record", "not-an-object"],
		["a mismatched step id", validStep({ id: "other" })],
		["a mismatched run id", validStep({ runId: "other-run" })],
		["a non-string title", validStep({ title: 5 })],
		["a non-string kind", validStep({ kind: 5 })],
		["a non-object backend", validStep({ backend: "shell" })],
		["a null backend", validStep({ backend: null })],
		["non-array dependsOn", validStep({ dependsOn: "x" })],
		["non-string dependency entries", validStep({ dependsOn: [1] })],
		["non-array inputArtifacts", validStep({ inputArtifacts: {} })],
		["non-array outputArtifacts", validStep({ outputArtifacts: {} })],
		["an unknown status", validStep({ status: "exploded" })],
	];

	test.each(
		invalid,
	)("rejects %s with an invalid_step_record diagnostic", async (_name, persisted) => {
		const result = await reconcileWith(persisted);
		expect(result.steps).toEqual([]);
		expect(result.diagnostics).toEqual([
			{
				code: "invalid_step_record",
				message: "Step record S1 is not a valid persisted step record.",
				details: { stepId: "S1" },
			},
			{
				code: "missing_step_record",
				message: "Graph step S1 does not have a persisted step record.",
				details: { stepId: "S1" },
			},
		]);
	});
});
