/**
 * Tests for observability extension.
 * Verifies handler registration and structured log output for each event type.
 */

import { describe, expect, test } from "vitest";
import observabilityExtension from "../../domains/shared/extensions/observability/index.ts";

type HandlerFn = (...args: unknown[]) => Promise<unknown> | unknown;

function createMockPi() {
	const handlers = new Map<string, HandlerFn[]>();
	const entries: Array<{ type: string; data: unknown }> = [];

	return {
		on(event: string, handler: HandlerFn) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		appendEntry(type: string, data: unknown) {
			entries.push({ type, data });
		},
		getHandler(event: string): HandlerFn {
			const list = handlers.get(event) ?? [];
			if (list.length === 0) throw new Error(`No handler for ${event}`);
			return list[0] as HandlerFn;
		},
		getEntries() {
			return entries;
		},
		hasHandler(event: string) {
			return (handlers.get(event)?.length ?? 0) > 0;
		},
	};
}

function findEntry(
	entries: Array<{ type: string; data: unknown }>,
	eventName: string,
) {
	const entry = entries.find(
		(e) => (e.data as Record<string, unknown>).event === eventName,
	);
	if (!entry) throw new Error(`No entry for event ${eventName}`);
	return entry;
}

describe("observability extension", () => {
	test("registers handlers for all required events", () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		expect(pi.hasHandler("turn_start")).toBe(true);
		expect(pi.hasHandler("turn_end")).toBe(true);
		expect(pi.hasHandler("tool_call")).toBe(true);
		expect(pi.hasHandler("tool_execution_end")).toBe(true);
		expect(pi.hasHandler("session_shutdown")).toBe(true);
	});

	test("turn_start handler logs structured entry", async () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		await pi.getHandler("turn_start")({
			type: "turn_start",
			turnIndex: 0,
			timestamp: 1234567890,
		});

		const entry = findEntry(pi.getEntries(), "turn_start");
		expect(entry.type).toBe("observability");
		expect(entry.data).toEqual({
			event: "turn_start",
			turnIndex: 0,
			timestamp: 1234567890,
		});
	});

	test("turn_end handler logs structured entry with tool result count", async () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		await pi.getHandler("turn_end")({
			type: "turn_end",
			turnIndex: 1,
			message: {},
			toolResults: [{}, {}],
		});

		const entry = findEntry(pi.getEntries(), "turn_end");
		expect(entry.data).toEqual({
			event: "turn_end",
			turnIndex: 1,
			toolResultCount: 2,
		});
	});

	test("tool_call handler logs structured entry", async () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		await pi.getHandler("tool_call")({
			type: "tool_call",
			toolCallId: "tc-1",
			toolName: "bash",
			input: { command: "ls" },
		});

		const entry = findEntry(pi.getEntries(), "tool_call");
		expect(entry.data).toEqual({
			event: "tool_call",
			toolCallId: "tc-1",
			toolName: "bash",
		});
	});

	test("tool_execution_end handler logs structured entry", async () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		await pi.getHandler("tool_execution_end")({
			type: "tool_execution_end",
			toolCallId: "tc-1",
			toolName: "bash",
			result: { output: "ok" },
			isError: false,
		});

		const entry = findEntry(pi.getEntries(), "tool_execution_end");
		expect(entry.data).toEqual({
			event: "tool_execution_end",
			toolCallId: "tc-1",
			toolName: "bash",
			isError: false,
		});
	});

	test("session_shutdown handler logs structured entry with duration", async () => {
		const pi = createMockPi();
		observabilityExtension(pi as never);

		await pi.getHandler("session_shutdown")({ type: "session_shutdown" });

		const entry = findEntry(pi.getEntries(), "session_shutdown");
		expect(entry.type).toBe("observability");
		const data = entry.data as Record<string, unknown>;
		expect(data.event).toBe("session_shutdown");
		expect(typeof data.durationMs).toBe("number");
		expect(data.durationMs as number).toBeGreaterThanOrEqual(0);
	});
});
