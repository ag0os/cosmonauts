import { describe, expect, test } from "vitest";
import type {
	OrchestrationEvent,
	StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import {
	adaptDurableChainEvents,
	type ChainAgentEvidenceDetails,
} from "../../lib/orchestration/chain-event-adapter.ts";
import type { ChainEvent, SpawnEvent } from "../../lib/orchestration/types.ts";

describe("chain-event-adapter", () => {
	test("maps durable chain spawn evidence to ChainEvents and refuses to fabricate missing session ids", () => {
		const adapted = adaptDurableChainEvents({
			runId: "run-durable-chain",
			steps: [
				{
					stepId: "chain-1-planner",
					topologyIndex: 0,
					stepIndex: 1,
					purpose: { kind: "default" },
					requiresPlanReviewTarget: false,
					stage: { name: "planner", loop: false },
				},
				{
					stepId: "chain-2-1-worker",
					topologyIndex: 1,
					stepIndex: 2,
					purpose: { kind: "default" },
					requiresPlanReviewTarget: false,
					memberIndex: 1,
					syntax: { kind: "group" },
					stage: { name: "worker", loop: false },
				},
				{
					stepId: "chain-2-2-reviewer",
					topologyIndex: 1,
					stepIndex: 2,
					purpose: { kind: "default" },
					requiresPlanReviewTarget: false,
					memberIndex: 2,
					syntax: { kind: "group" },
					stage: { name: "reviewer", loop: false },
				},
				{
					stepId: "chain-3-quality-manager",
					topologyIndex: 2,
					stepIndex: 3,
					purpose: { kind: "default" },
					requiresPlanReviewTarget: false,
					stage: { name: "quality-manager", loop: false },
				},
			],
			events: [
				stored(1, { type: "run_started", runId: "run-durable-chain" }),
				stored(2, {
					type: "step_started",
					runId: "run-durable-chain",
					stepId: "chain-1-planner",
					backend: "cosmonauts-subagent",
				}),
				stored(
					3,
					chainAgentEvent({
						stepId: "chain-1-planner",
						role: "planner",
						sessionId: "sess-planner",
						chainEvent: "agent_spawned",
						event: { type: "turn_start", sessionId: "sess-planner" },
					}),
				),
				stored(
					4,
					chainAgentEvent({
						stepId: "chain-1-planner",
						role: "planner",
						sessionId: "sess-planner",
						chainEvent: "agent_turn",
						event: { type: "turn_start", sessionId: "sess-planner" },
					}),
				),
				stored(
					5,
					chainAgentEvent({
						stepId: "chain-1-planner",
						role: "planner",
						sessionId: "sess-planner",
						chainEvent: "agent_tool_use",
						event: {
							type: "tool_execution_start",
							sessionId: "sess-planner",
							toolName: "read",
							toolCallId: "tool-1",
							args: { path: "ROADMAP.md" },
						},
					}),
				),
				stored(
					6,
					chainAgentEvent({
						stepId: "chain-1-planner",
						role: "planner",
						sessionId: "sess-planner",
						chainEvent: "agent_completed",
						event: { type: "turn_end", sessionId: "sess-planner" },
					}),
				),
				stored(7, {
					type: "step_completed",
					runId: "run-durable-chain",
					stepId: "chain-1-planner",
					result: {
						outcome: "success",
						summary: "planner done",
						artifacts: [],
					},
				}),
				stored(8, {
					type: "step_started",
					runId: "run-durable-chain",
					stepId: "chain-2-1-worker",
					backend: "cosmonauts-subagent",
				}),
				stored(9, {
					type: "step_started",
					runId: "run-durable-chain",
					stepId: "chain-2-2-reviewer",
					backend: "cosmonauts-subagent",
				}),
				stored(
					10,
					chainAgentEvent({
						stepId: "chain-2-1-worker",
						role: "worker",
						sessionId: "sess-worker",
						chainEvent: "agent_turn",
						event: { type: "turn_start", sessionId: "sess-worker" },
					}),
				),
				stored(11, {
					type: "step_tool_activity",
					runId: "run-durable-chain",
					stepId: "chain-2-2-reviewer",
					details: {
						source: "chain",
						kind: "chain_agent_event",
						chainEvent: "agent_turn",
						role: "reviewer",
						event: { type: "turn_start", sessionId: "sess-reviewer" },
					},
				}),
				stored(12, {
					type: "step_completed",
					runId: "run-durable-chain",
					stepId: "chain-2-2-reviewer",
					result: {
						outcome: "success",
						summary: "reviewer done",
						artifacts: [],
					},
				}),
				stored(13, {
					type: "step_completed",
					runId: "run-durable-chain",
					stepId: "chain-2-1-worker",
					result: {
						outcome: "success",
						summary: "worker done",
						artifacts: [],
					},
				}),
				stored(14, {
					type: "step_started",
					runId: "run-durable-chain",
					stepId: "chain-3-quality-manager",
					backend: "cosmonauts-subagent",
				}),
				stored(15, {
					type: "step_failed",
					runId: "run-durable-chain",
					stepId: "chain-3-quality-manager",
					reason: "quality gate failed",
				}),
				stored(16, {
					type: "run_failed",
					runId: "run-durable-chain",
					reason: "quality gate failed",
				}),
			],
		});

		expect(adapted.events.map((event) => event.type)).toEqual([
			"chain_start",
			"stage_start",
			"agent_spawned",
			"agent_turn",
			"agent_tool_use",
			"agent_completed",
			"stage_end",
			"parallel_start",
			"stage_start",
			"stage_start",
			"agent_turn",
			"stage_end",
			"stage_end",
			"parallel_end",
			"stage_start",
			"stage_end",
			"error",
			"error",
			"chain_end",
		]);

		expect(adapted.events[0]).toEqual({
			type: "chain_start",
			steps: [
				{ name: "planner", loop: false },
				{
					kind: "parallel",
					syntax: { kind: "group" },
					stages: [
						{ name: "worker", loop: false },
						{ name: "reviewer", loop: false },
					],
				},
				{ name: "quality-manager", loop: false },
			],
		});
		expect(
			adapted.events.filter((event) => event.type.startsWith("agent_")),
		).toEqual([
			{
				type: "agent_spawned",
				role: "planner",
				sessionId: "sess-planner",
			},
			{
				type: "agent_turn",
				role: "planner",
				sessionId: "sess-planner",
				event: { type: "turn_start", sessionId: "sess-planner" },
			},
			{
				type: "agent_tool_use",
				role: "planner",
				sessionId: "sess-planner",
				event: {
					type: "tool_execution_start",
					sessionId: "sess-planner",
					toolName: "read",
					toolCallId: "tool-1",
					args: { path: "ROADMAP.md" },
				},
			},
			{
				type: "agent_completed",
				role: "planner",
				sessionId: "sess-planner",
			},
			{
				type: "agent_turn",
				role: "worker",
				sessionId: "sess-worker",
				event: { type: "turn_start", sessionId: "sess-worker" },
			},
		] satisfies ChainEvent[]);
		expect(
			adapted.events.find(
				(event): event is Extract<ChainEvent, { type: "parallel_end" }> =>
					event.type === "parallel_end",
			),
		).toEqual(
			expect.objectContaining({
				type: "parallel_end",
				stepIndex: 2,
				results: [
					expect.objectContaining({
						stage: { name: "worker", loop: false },
						success: true,
					}),
					expect.objectContaining({
						stage: { name: "reviewer", loop: false },
						success: true,
					}),
				],
				success: true,
			}),
		);
		expect(
			adapted.events.find(
				(event): event is Extract<ChainEvent, { type: "chain_end" }> =>
					event.type === "chain_end",
			)?.result,
		).toEqual(
			expect.objectContaining({
				success: false,
				errors: ["quality gate failed"],
			}),
		);
		expect(adapted.diagnostics).toEqual([
			expect.objectContaining({
				code: "invalid_chain_agent_evidence",
				message: expect.stringContaining("sessionId"),
				details: expect.objectContaining({
					stepId: "chain-2-2-reviewer",
				}),
			}),
		]);
		expect(
			adapted.events.some(
				(event) =>
					event.type.startsWith("agent_") &&
					"sessionId" in event &&
					event.sessionId === "sess-reviewer",
			),
		).toBe(false);
	});

	test("projects structurally valid durable review blocks with stable error evidence across partial result persistence", () => {
		const block = {
			reason: "missing-addressed-evidence",
			planSlug: "durable-review-gate",
			reviewRound: 1,
			taskManagerTopologyIndex: 2,
		} as const;
		const adapted = adaptDurableChainEvents({
			runId: "run-durable-chain",
			steps: [
				{
					stepId: "chain-3-task-manager",
					topologyIndex: 2,
					stepIndex: 3,
					purpose: { kind: "default" },
					requiresPlanReviewTarget: true,
					stage: { name: "task-manager", loop: false },
				},
			],
			events: [
				stored(1, { type: "run_started", runId: "run-durable-chain" }),
				stored(2, {
					type: "step_started",
					runId: "run-durable-chain",
					stepId: "chain-3-task-manager",
					backend: "cosmonauts-subagent",
				}),
				stored(3, {
					type: "run_activity",
					runId: "run-durable-chain",
					details: {
						source: "chain",
						kind: "unaddressed_review_round",
						role: "task-manager",
						block,
						extra: true,
					},
				}),
				stored(4, {
					type: "run_activity",
					runId: "run-durable-chain",
					details: {
						source: "chain",
						kind: "unaddressed_review_round",
						role: "task-manager",
						block,
					},
				}),
				stored(5, {
					type: "run_blocked",
					runId: "run-durable-chain",
					reason:
						"Plan review target for durable-review-gate round 1 blocked: missing-addressed-evidence",
				}),
			],
		});

		expect(
			adapted.events.find((event) => event.type === "unaddressed_review_round"),
		).toEqual({
			type: "unaddressed_review_round",
			stage: { name: "task-manager", loop: false },
			block,
		});
		expect(adapted.events.at(-1)).toEqual(
			expect.objectContaining({
				type: "chain_end",
				result: expect.objectContaining({
					success: false,
					errors: [
						"Plan review target for durable-review-gate round 1 blocked: missing-addressed-evidence",
					],
				}),
			}),
		);
		expect(adapted.diagnostics).toEqual([
			expect.objectContaining({
				code: "invalid_chain_review_block_evidence",
			}),
		]);
	});
});

function chainAgentEvent(options: {
	stepId: string;
	role: string;
	sessionId: string;
	chainEvent: ChainAgentEvidenceDetails["chainEvent"];
	event: SpawnEvent;
}): OrchestrationEvent {
	return {
		type: "step_tool_activity",
		runId: "run-durable-chain",
		stepId: options.stepId,
		details: {
			source: "chain",
			kind: "chain_agent_event",
			chainEvent: options.chainEvent,
			role: options.role,
			sessionId: options.sessionId,
			event: options.event,
		} satisfies ChainAgentEvidenceDetails,
	};
}

function stored(
	seq: number,
	event: OrchestrationEvent,
): StoredOrchestrationEvent {
	return {
		seq,
		timestamp: `2026-06-04T00:${String(seq).padStart(2, "0")}:00.000Z`,
		runId: "run-durable-chain",
		event,
	};
}
