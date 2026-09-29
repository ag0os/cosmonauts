import { describe, expect, test } from "vitest";
import type {
	OrchestrationEvent,
	StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { adaptDurableChainEvents } from "../../lib/orchestration/chain-event-adapter.ts";
import type { ChainCompilerStepMetadata } from "../../lib/orchestration/durable-chain-compiler.ts";

const RUN_ID = "run-char";

const SEQUENTIAL: ChainCompilerStepMetadata[] = [
	{
		stepId: "chain-1-planner",
		topologyIndex: 0,
		stepIndex: 1,
		purpose: { kind: "default" },
		requiresPlanReviewTarget: false,
		stage: { name: "planner", loop: false },
	},
];

const PARALLEL: ChainCompilerStepMetadata[] = [
	{
		stepId: "chain-1-1-worker",
		topologyIndex: 0,
		stepIndex: 1,
		purpose: { kind: "default" },
		requiresPlanReviewTarget: false,
		memberIndex: 1,
		syntax: { kind: "group" },
		stage: { name: "worker", loop: false },
	},
	{
		stepId: "chain-1-2-reviewer",
		topologyIndex: 0,
		stepIndex: 1,
		purpose: { kind: "default" },
		requiresPlanReviewTarget: false,
		memberIndex: 2,
		syntax: { kind: "group" },
		stage: { name: "reviewer", loop: false },
	},
];

function at(seq: number): string {
	return `2026-06-04T00:00:${String(seq * 2).padStart(2, "0")}.000Z`;
}

function stored(
	seq: number,
	event: OrchestrationEvent,
	runId = RUN_ID,
): StoredOrchestrationEvent {
	return { seq, timestamp: at(seq), runId, event };
}

function adapt(
	steps: ChainCompilerStepMetadata[],
	events: StoredOrchestrationEvent[],
) {
	return adaptDurableChainEvents({ runId: RUN_ID, steps, events });
}

const types = (events: { type: string }[]) => events.map((e) => e.type);

describe("adaptStoredEvent lifecycle variants (characterization)", () => {
	test("run_started emits chain_start carrying the topology", () => {
		const { events } = adapt(SEQUENTIAL, [
			stored(1, { type: "run_started", runId: RUN_ID }),
		]);
		expect(events).toEqual([
			{
				type: "chain_start",
				steps: [{ name: "planner", loop: false }],
			},
		]);
	});

	test("step_started then step_completed success yields stage_start, stage_end and a successful chain_end", () => {
		const { events, diagnostics } = adapt(SEQUENTIAL, [
			stored(1, { type: "run_started", runId: RUN_ID }),
			stored(2, {
				type: "step_started",
				runId: RUN_ID,
				stepId: "chain-1-planner",
				backend: "cosmonauts-subagent",
			}),
			stored(4, {
				type: "step_completed",
				runId: RUN_ID,
				stepId: "chain-1-planner",
				result: { outcome: "success", summary: "planned", artifacts: [] },
			}),
			stored(5, {
				type: "run_completed",
				runId: RUN_ID,
				result: { outcome: "completed" },
			}),
		]);
		expect(diagnostics).toEqual([]);
		expect(types(events)).toEqual([
			"chain_start",
			"stage_start",
			"stage_end",
			"chain_end",
		]);
		const stageEnd = events[2];
		expect(stageEnd).toMatchObject({
			type: "stage_end",
			result: {
				success: true,
				iterations: 1,
				summary: "planned",
				stage: { name: "planner" },
			},
		});
		expect(stageEnd?.type === "stage_end" && stageEnd.result.durationMs).toBe(
			at(4) === at(2) ? 0 : Date.parse(at(4)) - Date.parse(at(2)),
		);
		const end = events[3];
		expect(end).toMatchObject({
			type: "chain_end",
			result: { success: true, errors: [] },
		});
	});

	test("step_completed with a non-success outcome records the summary as the stage error", () => {
		const { events } = adapt(SEQUENTIAL, [
			stored(1, {
				type: "step_completed",
				runId: RUN_ID,
				stepId: "chain-1-planner",
				result: { outcome: "failed", summary: "nope", artifacts: [] },
			}),
			stored(2, {
				type: "run_completed",
				runId: RUN_ID,
				result: { outcome: "completed" },
			}),
		]);
		expect(events[0]).toMatchObject({
			type: "stage_end",
			result: { success: false, error: "nope", summary: "nope" },
		});
		expect(events[1]).toMatchObject({
			type: "chain_end",
			result: { success: false, errors: ["nope"] },
		});
	});

	test("step_completed with an empty summary omits the summary field", () => {
		const { events } = adapt(SEQUENTIAL, [
			stored(1, {
				type: "step_completed",
				runId: RUN_ID,
				stepId: "chain-1-planner",
				result: { outcome: "success", summary: "", artifacts: [] },
			}),
		]);
		const result = events[0]?.type === "stage_end" ? events[0].result : null;
		expect(result).not.toBeNull();
		expect(result).not.toHaveProperty("summary");
		expect(result).not.toHaveProperty("error");
	});

	test.each([
		["step_failed", "kaboom", "kaboom"],
		["step_blocked", "held up", "held up"],
		["step_cancelled", undefined, "Step cancelled"],
		["step_stale", undefined, "Step stale"],
	] as const)("%s yields stage_end, then an error event carrying the reason", (type, reason, expected) => {
		const event = {
			type,
			runId: RUN_ID,
			stepId: "chain-1-planner",
			...(reason !== undefined && { reason }),
		} as OrchestrationEvent;
		const { events } = adapt(SEQUENTIAL, [stored(1, event)]);
		expect(types(events)).toEqual(["stage_end", "error"]);
		expect(events[0]).toMatchObject({
			result: { success: false, error: expected },
		});
		expect(events[1]).toMatchObject({
			type: "error",
			message: expected,
			stage: { name: "planner" },
		});
	});

	test("failure events for a step without metadata are ignored", () => {
		const { events } = adapt(SEQUENTIAL, [
			stored(1, {
				type: "step_failed",
				runId: RUN_ID,
				stepId: "unknown-step",
				reason: "x",
			}),
			stored(2, {
				type: "step_completed",
				runId: RUN_ID,
				stepId: "unknown-step",
				result: { outcome: "success", summary: "", artifacts: [] },
			}),
			stored(3, {
				type: "step_started",
				runId: RUN_ID,
				stepId: "unknown-step",
				backend: "b",
			}),
		]);
		expect(events).toEqual([]);
	});

	test.each([
		[
			"run_failed",
			{ type: "run_failed", runId: RUN_ID, reason: "dead" },
			"dead",
		],
		[
			"run_blocked",
			{ type: "run_blocked", runId: RUN_ID, reason: "stuck" },
			"stuck",
		],
		[
			"run_cancelled",
			{ type: "run_cancelled", runId: RUN_ID },
			"Run cancelled",
		],
		["run_stale", { type: "run_stale", runId: RUN_ID }, "Run stale"],
	] as const)("%s emits an error then a failed chain_end", (_name, event, message) => {
		const { events } = adapt(SEQUENTIAL, [stored(1, event)]);
		expect(events).toEqual([
			{ type: "error", message },
			{
				type: "chain_end",
				result: {
					success: false,
					stageResults: [],
					totalDurationMs: 0,
					errors: [message],
				},
			},
		]);
	});

	test.each([
		{ type: "step_ready", runId: RUN_ID, stepId: "chain-1-planner" },
		{ type: "step_heartbeat", runId: RUN_ID, stepId: "chain-1-planner" },
		{
			type: "step_output",
			runId: RUN_ID,
			stepId: "chain-1-planner",
			chunk: "hi",
		},
		{
			type: "artifact_written",
			runId: RUN_ID,
			artifact: { id: "a", path: "p" },
		},
		{
			type: "child_run_started",
			runId: RUN_ID,
			stepId: "chain-1-planner",
			childRunId: "c",
		},
	] as OrchestrationEvent[])("$type produces no chain events", (event) => {
		const result = adapt(SEQUENTIAL, [stored(1, event)]);
		expect(result).toEqual({ events: [], diagnostics: [] });
	});

	test("skips events from a different run and orders by seq", () => {
		const { events } = adapt(SEQUENTIAL, [
			stored(3, { type: "run_cancelled", runId: RUN_ID }),
			stored(1, { type: "run_started", runId: RUN_ID }),
			stored(2, { type: "run_started", runId: "other" }, "other"),
		]);
		expect(types(events)).toEqual(["chain_start", "error", "chain_end"]);
	});

	test("parallel group emits parallel_start once and parallel_end after every member finishes", () => {
		const { events } = adapt(PARALLEL, [
			stored(1, {
				type: "step_started",
				runId: RUN_ID,
				stepId: "chain-1-1-worker",
				backend: "b",
			}),
			stored(2, {
				type: "step_started",
				runId: RUN_ID,
				stepId: "chain-1-2-reviewer",
				backend: "b",
			}),
			stored(3, {
				type: "step_completed",
				runId: RUN_ID,
				stepId: "chain-1-1-worker",
				result: { outcome: "success", summary: "", artifacts: [] },
			}),
			stored(4, {
				type: "step_failed",
				runId: RUN_ID,
				stepId: "chain-1-2-reviewer",
				reason: "review broke",
			}),
		]);
		expect(types(events)).toEqual([
			"parallel_start",
			"stage_start",
			"stage_start",
			"stage_end",
			"stage_end",
			"parallel_end",
			"error",
		]);
		expect(events.at(-2)).toMatchObject({
			type: "parallel_end",
			stepIndex: 1,
			success: false,
			error: "review broke",
		});
	});
});

describe("validateChainAgentEvidence through step_tool_activity (characterization)", () => {
	function evidence(details: unknown): StoredOrchestrationEvent {
		return stored(1, {
			type: "step_tool_activity",
			runId: RUN_ID,
			stepId: "chain-1-planner",
			details,
		});
	}

	function good(overrides: Record<string, unknown> = {}) {
		return {
			source: "chain",
			kind: "chain_agent_event",
			chainEvent: "agent_turn",
			role: "planner",
			sessionId: "sess-1",
			event: { type: "turn_start", sessionId: "sess-1" },
			...overrides,
		};
	}

	test("projects each supported chainEvent variant", () => {
		const cases: Array<[Record<string, unknown>, unknown]> = [
			[
				{
					chainEvent: "agent_spawned",
				},
				{ type: "agent_spawned", role: "planner", sessionId: "sess-1" },
			],
			[
				{ chainEvent: "agent_completed" },
				{ type: "agent_completed", role: "planner", sessionId: "sess-1" },
			],
			[
				{},
				{
					type: "agent_turn",
					role: "planner",
					sessionId: "sess-1",
					event: { type: "turn_start", sessionId: "sess-1" },
				},
			],
			[
				{
					chainEvent: "agent_tool_use",
					event: {
						type: "tool_execution_start",
						sessionId: "sess-1",
						toolName: "bash",
						toolCallId: "c1",
					},
				},
				{
					type: "agent_tool_use",
					role: "planner",
					sessionId: "sess-1",
					event: {
						type: "tool_execution_start",
						sessionId: "sess-1",
						toolName: "bash",
						toolCallId: "c1",
					},
				},
			],
		];
		for (const [overrides, expected] of cases) {
			const result = adapt(SEQUENTIAL, [evidence(good(overrides))]);
			expect(result).toEqual({ events: [expected], diagnostics: [] });
		}
	});

	test.each([
		["turn_end", { type: "turn_end", sessionId: "sess-1" }],
		[
			"compaction_start",
			{ type: "compaction_start", sessionId: "sess-1", reason: "manual" },
		],
		[
			"compaction_end",
			{
				type: "compaction_end",
				sessionId: "sess-1",
				reason: "overflow",
				aborted: false,
				willRetry: true,
				errorMessage: "too long",
			},
		],
	])("accepts %s as an agent_turn payload", (_name, event) => {
		const { events, diagnostics } = adapt(SEQUENTIAL, [
			evidence(good({ event })),
		]);
		expect(diagnostics).toEqual([]);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: "agent_turn", event });
	});

	test("accepts tool_execution_end for agent_tool_use", () => {
		const event = {
			type: "tool_execution_end",
			sessionId: "sess-1",
			toolName: "bash",
			toolCallId: "c1",
			isError: false,
		};
		const { events } = adapt(SEQUENTIAL, [
			evidence(good({ chainEvent: "agent_tool_use", event })),
		]);
		expect(events).toEqual([
			{ type: "agent_tool_use", role: "planner", sessionId: "sess-1", event },
		]);
	});

	function diagnosticFor(details: unknown) {
		const { events, diagnostics } = adapt(SEQUENTIAL, [evidence(details)]);
		expect(events).toEqual([]);
		return diagnostics;
	}

	test.each([
		[
			"a non-chain source",
			{ source: "other", kind: "chain_agent_event" },
			"source must be chain",
		],
		[
			"an unsupported chainEvent",
			{ chainEvent: "agent_nap" },
			"chainEvent must be a supported agent event type",
		],
		["an empty role", { role: "" }, "role must be a non-empty string"],
		["a missing role", { role: undefined }, "role must be a non-empty string"],
		[
			"an empty sessionId",
			{ sessionId: "", event: { type: "turn_start", sessionId: "" } },
			"sessionId must be a non-empty string",
		],
		[
			"a malformed SpawnEvent",
			{ event: { type: "turn_start" } },
			"event must be a valid SpawnEvent payload",
		],
		[
			"a mismatched event.sessionId",
			{ event: { type: "turn_start", sessionId: "other" } },
			"event.sessionId must match sessionId",
		],
		[
			"a role that does not match the step metadata",
			{ role: "worker" },
			"role must match scheduler stage metadata",
		],
		[
			"agent_turn with a tool event",
			{
				event: {
					type: "tool_execution_start",
					sessionId: "sess-1",
					toolName: "bash",
					toolCallId: "c1",
				},
			},
			"agent_turn requires a turn or compaction SpawnEvent",
		],
		[
			"agent_tool_use with a turn event",
			{ chainEvent: "agent_tool_use" },
			"agent_tool_use requires a tool execution SpawnEvent",
		],
	])("reports %s with an invalid_chain_agent_evidence diagnostic", (_name, overrides, message) => {
		const diagnostics = diagnosticFor(good(overrides));
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("invalid_chain_agent_evidence");
		expect(diagnostics[0]?.message).toContain(message);
		expect(diagnostics[0]?.details).toMatchObject({
			stepId: "chain-1-planner",
		});
	});

	test("diagnostic details record whether a sessionId was present", () => {
		const [diagnostic] = diagnosticFor(good({ sessionId: undefined }));
		expect(diagnostic?.details).toEqual({
			stepId: "chain-1-planner",
			chainEvent: "agent_turn",
			role: "planner",
			hasSessionId: false,
		});
	});

	test("joins every failed check into one message", () => {
		const [diagnostic] = diagnosticFor(
			good({ role: undefined, chainEvent: "nope", event: 5 }),
		);
		expect(diagnostic?.message).toBe(
			"Durable chain agent evidence is invalid: chainEvent must be a supported agent event type; role must be a non-empty string; event must be a valid SpawnEvent payload.",
		);
	});

	test("ignores details that are not records without a diagnostic", () => {
		expect(adapt(SEQUENTIAL, [evidence("text")])).toEqual({
			events: [],
			diagnostics: [],
		});
		expect(adapt(SEQUENTIAL, [evidence(null)])).toEqual({
			events: [],
			diagnostics: [],
		});
	});

	test("skips the metadata role check when the step has no metadata", () => {
		const { events, diagnostics } = adapt(SEQUENTIAL, [
			stored(1, {
				type: "step_tool_activity",
				runId: RUN_ID,
				stepId: "unknown-step",
				details: good({ role: "anything" }),
			}),
		]);
		expect(diagnostics).toEqual([]);
		expect(events).toHaveLength(1);
	});

	test("a non-chain source with a chain_agent_event kind still reaches validation and is rejected", () => {
		const diagnostics = diagnosticFor(good({ source: "other" }));
		expect(diagnostics[0]?.message).toContain("source must be chain");
	});

	test("details failing both the source and kind checks are dropped before validation", () => {
		expect(
			adapt(SEQUENTIAL, [evidence(good({ source: "x", kind: "y" }))]),
		).toEqual({ events: [], diagnostics: [] });
	});
});
