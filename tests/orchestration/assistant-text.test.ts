import { describe, expect, test } from "vitest";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "../../lib/orchestration/assistant-text.ts";

describe("extractAssistantText", () => {
	test("returns the text blocks of the last assistant message", () => {
		const messages = [
			{ role: "user", content: [{ type: "text", text: "do the thing" }] },
			{ role: "assistant", content: [{ type: "text", text: "first pass" }] },
			{ role: "user", content: [{ type: "text", text: "again" }] },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Created 3 tasks." },
					{ type: "text", text: "All tests pass." },
				],
			},
		];

		expect(extractAssistantText(messages, "task-manager")).toBe(
			"Created 3 tasks.\n\nAll tests pass.",
		);
	});

	test("skips assistant messages that end on a tool call", () => {
		const messages = [
			{ role: "assistant", content: [{ type: "text", text: "earlier note" }] },
			{
				role: "assistant",
				content: [{ type: "tool_use", id: "t1", name: "bash" }],
			},
		];

		expect(extractAssistantText(messages, "worker")).toBe("earlier note");
	});

	test("falls back to '<role> completed' when no assistant text exists", () => {
		expect(extractAssistantText([], "reviewer")).toBe("reviewer completed");
		expect(
			extractAssistantText(
				[{ role: "assistant", content: [{ type: "tool_use" }] }],
				"reviewer",
			),
		).toBe("reviewer completed");
	});
});

describe("summarizeAssistantText", () => {
	test("collapses whitespace and keeps short text intact", () => {
		expect(summarizeAssistantText("done\n\n  with   spacing", "fixer")).toBe(
			"done with spacing",
		);
	});

	test("truncates overlong text with an ellipsis", () => {
		const long = "x".repeat(300);
		const summary = summarizeAssistantText(long, "planner", 50);
		expect(summary).toHaveLength(50);
		expect(summary.endsWith("…")).toBe(true);
	});

	test("falls back to '<role> completed' for empty text", () => {
		expect(summarizeAssistantText("   ", "explorer")).toBe(
			"explorer completed",
		);
	});
});
