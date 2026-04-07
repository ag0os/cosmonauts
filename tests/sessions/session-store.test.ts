/**
 * Tests for lib/sessions/session-store.ts
 * Covers sessionsDirForPlan, generateTranscript, and writeTranscript.
 */

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	generateTranscript,
	sessionsDirForPlan,
	writeTranscript,
} from "../../lib/sessions/session-store.ts";

// ============================================================================
// Fixtures — mock AgentMessage arrays
// ============================================================================

/** UserMessage with string content */
const userStringMessage = {
	role: "user",
	content: "Please implement the auth module.",
	timestamp: 1000,
};

/** UserMessage with array content (TextContent blocks) */
const userArrayMessage = {
	role: "user",
	content: [
		{ type: "text", text: "Implement the task." },
		{ type: "image", data: "base64data", mimeType: "image/png" }, // image — no text
	],
	timestamp: 1001,
};

/** AssistantMessage with text content only */
const assistantTextMessage = {
	role: "assistant",
	content: [{ type: "text", text: "I'll implement auth using JWT tokens." }],
	timestamp: 2000,
};

/** AssistantMessage with thinking content only */
const assistantThinkingMessage = {
	role: "assistant",
	content: [
		{ type: "thinking", thinking: "Need to decide between JWT and sessions." },
	],
	timestamp: 2001,
};

/** AssistantMessage with tool call */
const assistantToolCallMessage = {
	role: "assistant",
	content: [
		{
			type: "toolCall",
			id: "tc1",
			name: "Read",
			arguments: { path: "/secret/path" },
		},
		{
			type: "toolCall",
			id: "tc2",
			name: "Bash",
			arguments: { command: "rm -rf /" },
		},
	],
	timestamp: 2002,
};

/** AssistantMessage with text + thinking + tool calls */
const assistantFullMessage = {
	role: "assistant",
	content: [
		{ type: "thinking", thinking: "I need to read the file first." },
		{ type: "text", text: "Let me check the existing code." },
		{
			type: "toolCall",
			id: "tc3",
			name: "Read",
			arguments: { path: "lib/auth.ts" },
		},
	],
	timestamp: 2003,
};

/** ToolResultMessage — content should be excluded */
const toolResultMessage = {
	role: "toolResult",
	toolCallId: "tc1",
	toolName: "Read",
	content: [{ type: "text", text: "File contents: super secret stuff here" }],
	isError: false,
	timestamp: 3000,
};

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "sessions-store-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

// ============================================================================
// sessionsDirForPlan
// ============================================================================

describe("sessionsDirForPlan", () => {
	test("returns missions/sessions/<planSlug> under projectRoot (AC#1)", () => {
		const result = sessionsDirForPlan("/home/user/project", "my-plan");
		expect(result).toBe("/home/user/project/missions/sessions/my-plan");
	});

	test("returns absolute path even for relative-looking projectRoot", () => {
		const result = sessionsDirForPlan("/abs/root", "auth-plan");
		expect(result).toBe("/abs/root/missions/sessions/auth-plan");
	});

	test("handles plan slugs with hyphens and underscores", () => {
		const result = sessionsDirForPlan("/root", "session-lineage_v2");
		expect(result).toBe("/root/missions/sessions/session-lineage_v2");
	});
});

// ============================================================================
// generateTranscript — structure and header
// ============================================================================

describe("generateTranscript — header", () => {
	test("output starts with a role-specific h1 heading", () => {
		const result = generateTranscript([], "worker");
		expect(result).toContain("# Session Transcript: worker");
	});

	test("planner role appears in heading", () => {
		const result = generateTranscript([], "planner");
		expect(result).toContain("# Session Transcript: planner");
	});
});

// ============================================================================
// generateTranscript — user messages
// ============================================================================

describe("generateTranscript — user messages (AC#2)", () => {
	test("includes user message with string content", () => {
		const result = generateTranscript([userStringMessage], "worker");
		expect(result).toContain("## User");
		expect(result).toContain("Please implement the auth module.");
	});

	test("includes user message with array content (text blocks only)", () => {
		const result = generateTranscript([userArrayMessage], "worker");
		expect(result).toContain("## User");
		expect(result).toContain("Implement the task.");
		// image block should not produce unexpected output
		expect(result).not.toContain("base64data");
	});

	test("skips user message with empty string content", () => {
		const msg = { role: "user", content: "", timestamp: 1 };
		const result = generateTranscript([msg], "worker");
		expect(result).not.toContain("## User");
	});

	test("skips user message with empty array content", () => {
		const msg = { role: "user", content: [], timestamp: 1 };
		const result = generateTranscript([msg], "worker");
		expect(result).not.toContain("## User");
	});
});

// ============================================================================
// generateTranscript — assistant text content
// ============================================================================

describe("generateTranscript — assistant text content (AC#2)", () => {
	test("includes assistant text in output", () => {
		const result = generateTranscript([assistantTextMessage], "worker");
		expect(result).toContain("## Assistant");
		expect(result).toContain("I'll implement auth using JWT tokens.");
	});

	test("skips assistant message with no includable content", () => {
		const emptyAssistant = { role: "assistant", content: [], timestamp: 2 };
		const result = generateTranscript([emptyAssistant], "worker");
		expect(result).not.toContain("## Assistant");
	});
});

// ============================================================================
// generateTranscript — assistant thinking content
// ============================================================================

describe("generateTranscript — assistant thinking content (AC#2)", () => {
	test("includes thinking content wrapped in <thinking> tags", () => {
		const result = generateTranscript([assistantThinkingMessage], "worker");
		expect(result).toContain("<thinking>");
		expect(result).toContain("Need to decide between JWT and sessions.");
		expect(result).toContain("</thinking>");
	});
});

// ============================================================================
// generateTranscript — tool call names
// ============================================================================

describe("generateTranscript — tool call names (AC#2)", () => {
	test("includes tool call names but not arguments", () => {
		const result = generateTranscript([assistantToolCallMessage], "worker");
		expect(result).toContain("`Read`");
		expect(result).toContain("`Bash`");
		// Arguments must NOT appear
		expect(result).not.toContain("rm -rf");
		expect(result).not.toContain("/secret/path");
	});

	test("tool call line uses 'Tool calls:' label", () => {
		const result = generateTranscript([assistantToolCallMessage], "worker");
		expect(result).toContain("**Tool calls:**");
	});
});

// ============================================================================
// generateTranscript — tool result exclusion
// ============================================================================

describe("generateTranscript — tool result messages (AC#2, AC#5)", () => {
	test("excludes tool result content", () => {
		const result = generateTranscript([toolResultMessage], "worker");
		expect(result).not.toContain("## Tool");
		expect(result).not.toContain("super secret stuff here");
	});

	test("tool result causes no section to be added", () => {
		const result = generateTranscript([toolResultMessage], "worker");
		// Only the header should be present
		const sectionCount = (result.match(/^##\s/gm) ?? []).length;
		expect(sectionCount).toBe(0);
	});
});

// ============================================================================
// generateTranscript — full message mix
// ============================================================================

describe("generateTranscript — mixed message sequence (AC#2)", () => {
	test("produces correct section order for a full conversation", () => {
		const messages = [
			userStringMessage,
			assistantFullMessage,
			toolResultMessage, // should be excluded
			userArrayMessage,
			assistantTextMessage,
		];
		const result = generateTranscript(messages, "worker");

		// Sections appear in order
		const userIdx = result.indexOf("## User");
		const assistantIdx = result.indexOf("## Assistant");
		expect(userIdx).toBeGreaterThan(-1);
		expect(assistantIdx).toBeGreaterThan(userIdx);

		// Content is present
		expect(result).toContain("Please implement the auth module.");
		expect(result).toContain("I need to read the file first.");
		expect(result).toContain("Let me check the existing code.");
		expect(result).toContain("`Read`");

		// Tool result content is absent
		expect(result).not.toContain("super secret stuff here");
	});

	test("does not include tool call arguments anywhere", () => {
		const messages = [assistantFullMessage, assistantToolCallMessage];
		const result = generateTranscript(messages, "worker");
		expect(result).not.toContain("lib/auth.ts"); // argument value
		expect(result).not.toContain("rm -rf");
	});
});

// ============================================================================
// generateTranscript — defensive handling of unknown shapes (AC#3)
// ============================================================================

describe("generateTranscript — defensive handling (AC#3)", () => {
	test("does not throw on null entries", () => {
		expect(() => generateTranscript([null], "worker")).not.toThrow();
	});

	test("does not throw on undefined entries", () => {
		expect(() => generateTranscript([undefined], "worker")).not.toThrow();
	});

	test("does not throw on primitive values", () => {
		expect(() =>
			generateTranscript([42, "string", true], "worker"),
		).not.toThrow();
	});

	test("does not throw on empty array", () => {
		expect(() => generateTranscript([], "worker")).not.toThrow();
	});

	test("does not throw on object without role field", () => {
		expect(() =>
			generateTranscript([{ content: "orphan" }], "worker"),
		).not.toThrow();
	});

	test("does not throw on assistant message with non-array content", () => {
		const bad = {
			role: "assistant",
			content: "unexpected string",
			timestamp: 1,
		};
		expect(() => generateTranscript([bad], "worker")).not.toThrow();
	});

	test("does not throw on assistant content blocks with unknown types", () => {
		const weird = {
			role: "assistant",
			content: [{ type: "alien", payload: {} }],
			timestamp: 1,
		};
		expect(() => generateTranscript([weird], "worker")).not.toThrow();
	});

	test("skips malformed entries and still renders valid entries", () => {
		const messages = [
			null,
			undefined,
			42,
			userStringMessage,
			{ badShape: true },
		];
		const result = generateTranscript(messages as unknown[], "worker");
		expect(result).toContain("## User");
		expect(result).toContain("Please implement the auth module.");
	});

	test("returns valid markdown string even for all-garbage input", () => {
		const result = generateTranscript([null, undefined, 42, {}], "worker");
		// Must be a string starting with the h1 header
		expect(typeof result).toBe("string");
		expect(result).toContain("# Session Transcript: worker");
	});
});

// ============================================================================
// writeTranscript (AC#4)
// ============================================================================

describe("writeTranscript", () => {
	test("writes content to <sessionsDir>/<filename>", async () => {
		const sessionsDir = join(tempDir, "sessions", "my-plan");
		await writeTranscript(sessionsDir, "worker-abc.transcript.md", "# Hello");

		const content = await readFile(
			join(sessionsDir, "worker-abc.transcript.md"),
			"utf-8",
		);
		expect(content).toBe("# Hello");
	});

	test("creates sessionsDir if it does not exist", async () => {
		const sessionsDir = join(tempDir, "deep", "nested", "sessions");
		await writeTranscript(sessionsDir, "planner-xyz.transcript.md", "content");

		const dirStat = await stat(sessionsDir);
		expect(dirStat.isDirectory()).toBe(true);
	});

	test("overwrites existing file with new content", async () => {
		const sessionsDir = join(tempDir, "sessions");
		await writeTranscript(sessionsDir, "file.md", "original");
		await writeTranscript(sessionsDir, "file.md", "updated");

		const content = await readFile(join(sessionsDir, "file.md"), "utf-8");
		expect(content).toBe("updated");
	});

	test("correctly writes multi-line transcript", async () => {
		const sessionsDir = join(tempDir, "sessions");
		const transcript = generateTranscript(
			[userStringMessage, assistantTextMessage],
			"worker",
		);

		await writeTranscript(sessionsDir, "session.transcript.md", transcript);

		const written = await readFile(
			join(sessionsDir, "session.transcript.md"),
			"utf-8",
		);
		expect(written).toBe(transcript);
		expect(written).toContain("# Session Transcript: worker");
		expect(written).toContain("## User");
		expect(written).toContain("## Assistant");
	});
});
