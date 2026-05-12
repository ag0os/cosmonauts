import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const PLAN_SLUG = "watch-events-plan";
const RUN_ID = "watch-events-run";
const PARENT_SESSION_ID = "watch-events-parent";

const temp = useTempDir("watch-events-test-");

interface ToolResult {
	events: DriverEvent[];
	cursor: number;
	content: { type: "text"; text: string }[];
	details: { events: DriverEvent[]; cursor: number };
}

function makeEvent(
	overrides: Partial<DriverEvent> & Pick<DriverEvent, "type">,
): DriverEvent {
	return {
		runId: RUN_ID,
		parentSessionId: PARENT_SESSION_ID,
		timestamp: "2026-05-12T00:00:00.000Z",
		...overrides,
	} as DriverEvent;
}

async function writeEventLog(events: DriverEvent[]): Promise<void> {
	const dir = join(
		temp.path,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		RUN_ID,
	);
	await mkdir(dir, { recursive: true });
	const body = events.map((event) => JSON.stringify(event)).join("\n");
	await writeFile(join(dir, "events.jsonl"), `${body}\n`, "utf-8");
}

async function callWatchEvents(since?: number): Promise<ToolResult> {
	const pi = createMockPi(temp.path, { sessionId: PARENT_SESSION_ID });
	registerWatchEventsTool(pi as never);
	const params: Record<string, unknown> = {
		planSlug: PLAN_SLUG,
		runId: RUN_ID,
	};
	if (since !== undefined) {
		params.since = since;
	}
	return (await pi.callTool("watch_events", params)) as ToolResult;
}

describe("watch_events tool", () => {
	test("renders mixed event types as one-liners including block reason and activity summary", async () => {
		await writeEventLog([
			makeEvent({
				type: "run_started",
				planSlug: PLAN_SLUG,
				backend: "x",
				mode: "inline",
			}),
			makeEvent({ type: "task_started", taskId: "TASK-1" }),
			makeEvent({
				type: "driver_activity",
				taskId: "TASK-1",
				activity: {
					kind: "tool_start",
					toolName: "edit_file",
					summary: "patching the parser module",
				},
			}),
			makeEvent({
				type: "task_blocked",
				taskId: "TASK-1",
				reason: "missing required env var COSMO_TOKEN",
			}),
		]);

		const result = await callWatchEvents();
		const text = result.content[0]?.text ?? "";

		expect(text).toContain("missing required env var COSMO_TOKEN");
		expect(text).toContain("patching the parser module");
		expect(text).toContain("edit_file");
		expect(text).toContain(`cursor ${result.cursor}`);
		expect(result.details.events).toHaveLength(4);
	});

	test("advances the cursor and pages newer events via since", async () => {
		await writeEventLog([
			makeEvent({ type: "task_started", taskId: "TASK-1" }),
			makeEvent({ type: "task_done", taskId: "TASK-1" }),
		]);

		const first = await callWatchEvents();
		expect(first.cursor).toBe(2);
		expect(first.details.events).toHaveLength(2);

		await writeEventLog([
			makeEvent({ type: "task_started", taskId: "TASK-1" }),
			makeEvent({ type: "task_done", taskId: "TASK-1" }),
			makeEvent({ type: "task_started", taskId: "TASK-2" }),
		]);

		const second = await callWatchEvents(first.cursor);
		expect(second.cursor).toBe(3);
		expect(second.details.events).toHaveLength(1);
		expect(second.details.events[0]?.type).toBe("task_started");
		const text = second.content[0]?.text ?? "";
		expect(text).toContain("TASK-2");
		expect(text).toContain("cursor 3");
	});

	test("caps rendered events and notes the overflow", async () => {
		const events: DriverEvent[] = [];
		for (let i = 0; i < 35; i++) {
			events.push(makeEvent({ type: "task_started", taskId: `TASK-${i}` }));
		}
		await writeEventLog(events);

		const result = await callWatchEvents();
		const text = result.content[0]?.text ?? "";

		expect(text).toContain("+5 earlier events not shown");
		// 35 events, capped at 30 shown
		const renderedLines = text
			.split("\n")
			.filter((line) => line.startsWith("- "));
		expect(renderedLines).toHaveLength(30);
		expect(result.details.events).toHaveLength(35);
		expect(text).toContain("cursor 35");
	});
});
