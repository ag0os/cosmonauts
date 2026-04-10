import { describe, expect, test } from "vitest";
import {
	chainEventToProgressLine,
	summarizeToolCall,
} from "../../domains/shared/extensions/orchestration/rendering.ts";
import type {
	ChainEvent,
	ParallelGroupStep,
} from "../../lib/orchestration/types.ts";

describe("summarizeToolCall", () => {
	test("read extracts file basename", () => {
		expect(summarizeToolCall("read", { file_path: "/src/auth/login.ts" })).toBe(
			"read login.ts",
		);
	});

	test("write extracts file basename from path", () => {
		expect(summarizeToolCall("write", { path: "/src/index.ts" })).toBe(
			"write index.ts",
		);
	});

	test("edit extracts file basename", () => {
		expect(
			summarizeToolCall("edit", { file_path: "/src/components/Button.tsx" }),
		).toBe("edit Button.tsx");
	});

	test("read with no args returns tool name only", () => {
		expect(summarizeToolCall("read")).toBe("read");
	});

	test("read with empty args returns tool name only", () => {
		expect(summarizeToolCall("read", {})).toBe("read");
	});

	test("bash shows command text", () => {
		expect(summarizeToolCall("bash", { command: "npm test" })).toBe(
			"bash npm test",
		);
	});

	test("bash truncates long commands", () => {
		const longCmd = "a".repeat(100);
		const result = summarizeToolCall("bash", { command: longCmd });
		expect(result).toBe(`bash ${"a".repeat(57)}...`);
		expect(result.length).toBeLessThanOrEqual(65);
	});

	test("grep shows pattern", () => {
		expect(summarizeToolCall("grep", { pattern: "import.*from" })).toBe(
			"grep import.*from",
		);
	});

	test("grep truncates long patterns", () => {
		const longPattern = "x".repeat(80);
		const result = summarizeToolCall("grep", { pattern: longPattern });
		expect(result).toBe(`grep ${"x".repeat(47)}...`);
	});

	test("spawn_agent shows role", () => {
		expect(summarizeToolCall("spawn_agent", { role: "worker" })).toBe(
			"spawn worker",
		);
	});

	test("spawn_agent with no role returns fallback", () => {
		expect(summarizeToolCall("spawn_agent", {})).toBe("spawn_agent");
	});

	test("unknown tool returns tool name", () => {
		expect(summarizeToolCall("some_custom_tool", { foo: "bar" })).toBe(
			"some_custom_tool",
		);
	});

	test("undefined args returns tool name", () => {
		expect(summarizeToolCall("bash")).toBe("bash ");
	});
});

describe("chainEventToProgressLine — chain_start", () => {
	test("sequential steps renders DSL string via formatChainSteps", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: false },
			],
		};
		expect(chainEventToProgressLine(event)).toBe(
			"▶ Chain started: planner -> coordinator",
		);
	});

	test("single sequential step renders just the role name", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [{ name: "worker", loop: false }],
		};
		expect(chainEventToProgressLine(event)).toBe("▶ Chain started: worker");
	});

	test("bracket group step renders bracket DSL string", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [
				{ name: "planner", loop: false },
				{
					kind: "parallel",
					stages: [
						{ name: "task-manager", loop: false },
						{ name: "reviewer", loop: false },
					],
					syntax: { kind: "group" },
				},
			],
		};
		expect(chainEventToProgressLine(event)).toBe(
			"▶ Chain started: planner -> [task-manager, reviewer]",
		);
	});

	test("fanout step renders fanout DSL string", () => {
		const event: ChainEvent = {
			type: "chain_start",
			steps: [
				{
					kind: "parallel",
					stages: [
						{ name: "reviewer", loop: false },
						{ name: "reviewer", loop: false },
					],
					syntax: { kind: "fanout", role: "reviewer", count: 2 },
				},
			],
		};
		expect(chainEventToProgressLine(event)).toBe(
			"▶ Chain started: reviewer[2]",
		);
	});
});

describe("chainEventToProgressLine — parallel events", () => {
	const parallelStep: ParallelGroupStep = {
		kind: "parallel",
		stages: [
			{ name: "task-manager", loop: false },
			{ name: "reviewer", loop: false },
		],
		syntax: { kind: "group" },
	};

	test("parallel_start produces a TUI progress entry for the group", () => {
		const event: ChainEvent = {
			type: "parallel_start",
			step: parallelStep,
			stepIndex: 0,
		};
		expect(chainEventToProgressLine(event)).toBe(
			"▶ Parallel [task-manager, reviewer] starting...",
		);
	});

	test("parallel_end success:true shows group success in TUI output", () => {
		const event: ChainEvent = {
			type: "parallel_end",
			step: parallelStep,
			stepIndex: 0,
			results: [],
			success: true,
		};
		expect(chainEventToProgressLine(event)).toBe(
			"● Parallel [task-manager, reviewer] done",
		);
	});

	test("parallel_end success:false shows group failure in TUI output", () => {
		const event: ChainEvent = {
			type: "parallel_end",
			step: parallelStep,
			stepIndex: 0,
			results: [],
			success: false,
		};
		expect(chainEventToProgressLine(event)).toBe(
			"✗ Parallel [task-manager, reviewer] failed",
		);
	});

	test("parallel_end success:false with error message includes error in TUI output", () => {
		const event: ChainEvent = {
			type: "parallel_end",
			step: parallelStep,
			stepIndex: 0,
			results: [],
			success: false,
			error: "timeout",
		};
		expect(chainEventToProgressLine(event)).toBe(
			"✗ Parallel [task-manager, reviewer] failed: timeout",
		);
	});
});

describe("chainEventToProgressLine — agent_tool_use", () => {
	test("renders tool_execution_start with summary", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "worker",
			sessionId: "s1",
			event: {
				type: "tool_execution_start",
				toolName: "read",
				toolCallId: "tc1",
				args: { file_path: "/src/auth.ts" },
				sessionId: "s1",
			},
		};
		expect(chainEventToProgressLine(event)).toBe("  🔧 Worker: read auth.ts");
	});

	test("returns undefined for tool_execution_end", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "worker",
			sessionId: "s1",
			event: {
				type: "tool_execution_end",
				toolName: "read",
				toolCallId: "tc1",
				isError: false,
				sessionId: "s1",
			},
		};
		expect(chainEventToProgressLine(event)).toBeUndefined();
	});

	test("uses role label for known roles", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "quality-manager",
			sessionId: "s1",
			event: {
				type: "tool_execution_start",
				toolName: "bash",
				toolCallId: "tc1",
				args: { command: "npm test" },
				sessionId: "s1",
			},
		};
		expect(chainEventToProgressLine(event)).toBe(
			"  🔧 Quality Manager: bash npm test",
		);
	});

	test("renders tool_execution_start without args", () => {
		const event: ChainEvent = {
			type: "agent_tool_use",
			role: "worker",
			sessionId: "s1",
			event: {
				type: "tool_execution_start",
				toolName: "read",
				toolCallId: "tc1",
				sessionId: "s1",
			},
		};
		expect(chainEventToProgressLine(event)).toBe("  🔧 Worker: read");
	});
});
