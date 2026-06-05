import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import { normalizeDriverEvent } from "../../lib/driver/durable-events.ts";
import { createEventSink } from "../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import { WATCH_EVENTS_COMPAT_DEGRADED_MARKER } from "../../lib/driver/watch-events-compat.ts";
import {
	FileRunStore,
	type RuntimeDiagnostic,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const PLAN_SLUG = "normalized-watch-events";
const RUN_ID = "run-normalized-watch";
const PARENT_SESSION_ID = "parent-normalized-watch";

const temp = useTempDir("orchestration-watch-events-normalized-");

interface ToolResult {
	events: DriverEvent[];
	cursor: number;
	source: "normalized" | "legacy_fallback";
	diagnostics: RuntimeDiagnostic[];
	content: { type: "text"; text: string }[];
	details: {
		events: DriverEvent[];
		cursor: number;
		source: "normalized" | "legacy_fallback";
		diagnostics: RuntimeDiagnostic[];
	};
}

describe("watch_events normalized compatibility", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-008
	test("preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics", async () => {
		const graphEvents = [
			event({
				type: "run_started",
				planSlug: PLAN_SLUG,
				backend: "codex",
				mode: "inline",
			}),
			event({ type: "task_started", taskId: "TASK-1" }),
			event({
				type: "lock_warning",
				reason: "stale lock ignored",
				details: { previousRunId: "run-old" },
			}),
			event({
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "turn_start" },
			}),
			event({ type: "task_done", taskId: "TASK-1" }),
			event({
				type: "run_completed",
				summary: { total: 1, done: 1, blocked: 0 },
			}),
		];
		await writeGraphActivityOnlyRun(graphEvents);

		const first = await callWatchEvents();
		const second = await callWatchEvents(2);
		const beyond = await callWatchEvents(99);
		const normalizedTypes = await readNormalizedTypes();

		expect(first.source).toBe("normalized");
		expect(first.cursor).toBe(graphEvents.length);
		expect(first.details.events).toEqual(graphEvents);
		expect(second.source).toBe("normalized");
		expect(second.cursor).toBe(graphEvents.length);
		expect(second.details.events).toEqual(graphEvents.slice(2));
		expect(beyond.source).toBe("normalized");
		expect(beyond.cursor).toBe(99);
		expect(beyond.details.events).toEqual([]);
		expect(normalizedTypes).toContain("run_activity");
		expect(normalizedTypes).toContain("step_tool_activity");
		expect(normalizedTypes).not.toContain("run_started");
		expect(normalizedTypes).not.toContain("run_completed");

		const partialRunId = "run-partial-loss";
		await setupNormalizedRun(
			[
				event({ type: "task_started", taskId: "TASK-1" }, partialRunId),
				event({ type: "task_done", taskId: "TASK-1" }, partialRunId),
			],
			{
				normalizedEvents: [
					event({ type: "task_started", taskId: "TASK-1" }, partialRunId),
				],
				runId: partialRunId,
			},
		);
		const partialFallback = await callWatchEventsFor("run-partial-loss");
		expect(partialFallback.source).toBe("legacy_fallback");
		expect(partialFallback.details.events.map((entry) => entry.type)).toEqual([
			"task_started",
			"task_done",
		]);
		expect(partialFallback.diagnostics).toEqual([
			expect.objectContaining({
				code: "watch_events_compat_incomplete",
				details: expect.objectContaining({
					normalizedLegacyEventCount: 1,
					legacyJsonlLineCount: 2,
				}),
			}),
		]);

		const setupFailureRunId = "run-setup-failure";
		await writeSetupFailureRun(setupFailureRunId);
		const setupFallback = await callWatchEventsFor(setupFailureRunId);
		expect(setupFallback.source).toBe("legacy_fallback");
		expect(setupFallback.details.events.map((entry) => entry.type)).toEqual([
			"task_done",
		]);
		expect(setupFallback.diagnostics).toEqual([
			expect.objectContaining({ code: "watch_events_compat_degraded" }),
		]);
		expect(
			await readFile(
				join(runDir(setupFailureRunId), WATCH_EVENTS_COMPAT_DEGRADED_MARKER),
				"utf-8",
			),
		).toContain("drive_durable_run_setup_failed");
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-009
	test("reconstructs legacy watch_events details and summaries from normalized Drive compatibility activity", async () => {
		const legacyEvents = [
			event({
				type: "run_started",
				planSlug: PLAN_SLUG,
				backend: "codex",
				mode: "detached",
			}),
			event({ type: "task_started", taskId: "TASK-1" }),
			event({
				type: "preflight",
				taskId: "TASK-1",
				status: "failed",
				details: { command: "bun run test", stderr: "tests failed" },
			}),
			event({ type: "spawn_started", taskId: "TASK-1", backend: "codex" }),
			event({
				type: "driver_activity",
				taskId: "TASK-1",
				activity: {
					kind: "tool_start",
					toolName: "edit_file",
					summary: "patching watch compatibility",
				},
			}),
			event({
				type: "spawn_completed",
				taskId: "TASK-1",
				report: {
					outcome: "partial",
					files: [
						{ path: "lib/driver/watch-events-compat.ts", change: "created" },
					],
					verification: [{ command: "bun run test", status: "pass" }],
				},
			}),
			event({
				type: "commit_made",
				taskId: "TASK-1",
				sha: "abcdef123456",
				subject: "TASK-378 watch compat",
			}),
			event({
				type: "finalize",
				taskId: "TASK-1",
				phase: "commit",
				status: "skipped",
				details: { reason: "no_changes" },
			}),
			event({
				type: "task_finalization_failed",
				taskId: "TASK-1",
				phase: "commit",
				reason: "commit failed",
				commitSha: "123456abcdef",
				retryable: true,
			}),
			event({ type: "task_done", taskId: "TASK-1" }),
			event({
				type: "task_blocked",
				taskId: "TASK-2",
				reason: "needs human input",
				progress: { phase: 1, of: 2 },
			}),
			event({
				type: "lock_warning",
				reason: "stale lock ignored",
				details: { previousRunId: "run-old" },
			}),
			event({
				type: "plan_completion_candidate",
				planSlug: PLAN_SLUG,
				taskCount: 2,
				reason: "all_plan_tasks_done",
			}),
			event({
				type: "run_finalization_failed",
				phase: "state_commit",
				reason: "state commit failed",
				taskId: "TASK-1",
				commitSha: "fedcba654321",
			}),
			event({ type: "run_aborted", reason: "operator stopped run" }),
		];
		await setupNormalizedRun(legacyEvents, {
			appendNonLegacyRunActivity: true,
		});

		const result = await callWatchEvents();
		const text = result.content[0]?.text ?? "";

		expect(result.source).toBe("normalized");
		expect(result.details.events).toEqual(legacyEvents);
		expect(result.cursor).toBe(legacyEvents.length);
		expect(text).toContain("preflight: TASK-1, failed, cmd: bun run test");
		expect(text).toContain("driver_activity: TASK-1 tool_start edit_file");
		expect(text).toContain("spawn_completed: TASK-1 report: partial");
		expect(text).toContain(
			"commit_made: TASK-1 abcdef12 TASK-378 watch compat",
		);
		expect(text).toContain(
			"finalize: TASK-1 commit skipped, reason: no_changes",
		);
		expect(text).toContain("task_finalization_failed: TASK-1, phase commit");
		expect(text).toContain("task_blocked: TASK-2, reason: needs human input");
		expect(text).toContain("lock_warning: reason: stale lock ignored");
		expect(text).toContain(
			"plan_completion_candidate: normalized-watch-events",
		);
		expect(text).toContain("run_finalization_failed: phase state_commit");
		expect(text).toContain("run_aborted: reason: operator stopped run");
		expect(JSON.stringify(result.details.events)).not.toContain("ignore-me");
	});
});

async function setupNormalizedRun(
	legacyEvents: DriverEvent[],
	options: {
		runId?: string;
		normalizedEvents?: DriverEvent[];
		appendNonLegacyRunActivity?: boolean;
	} = {},
): Promise<void> {
	const targetRunId = options.runId ?? RUN_ID;
	await writeLegacyEvents(targetRunId, legacyEvents);

	const store = new FileRunStore({ rootDir: rootDir() });
	await store.createRun({
		scope: PLAN_SLUG,
		runId: targetRunId,
		eventsPath: "orchestration-events.jsonl",
	});
	for (const legacyEvent of options.normalizedEvents ?? legacyEvents) {
		for (const normalized of normalizeDriverEvent(legacyEvent).events) {
			await store.appendEvent(
				{ scope: PLAN_SLUG, runId: targetRunId },
				normalized,
			);
		}
	}
	if (options.appendNonLegacyRunActivity) {
		await store.appendEvent(
			{ scope: PLAN_SLUG, runId: targetRunId },
			{
				type: "run_activity",
				runId: targetRunId,
				details: { kind: "other", event: "ignore-me" },
			},
		);
	}
}

async function writeGraphActivityOnlyRun(events: DriverEvent[]): Promise<void> {
	await mkdir(runDir(), { recursive: true });
	const sink = createEventSink({
		logPath: join(runDir(), "events.jsonl"),
		runId: RUN_ID,
		parentSessionId: PARENT_SESSION_ID,
		activityBus: { publish: () => {} },
		durable: {
			rootDir: rootDir(),
			scope: PLAN_SLUG,
			runId: RUN_ID,
			workdir: runDir(),
			mode: "graph-activity-only",
			eventsPath: "orchestration-events.jsonl",
		},
	});

	for (const legacyEvent of events) {
		await sink(legacyEvent);
	}
}

async function writeSetupFailureRun(runId: string): Promise<void> {
	const targetRunDir = runDir(runId);
	await mkdir(targetRunDir, { recursive: true });
	const blockedRoot = join(targetRunDir, "not-a-directory");
	await writeFile(blockedRoot, "file blocks durable root setup", "utf-8");
	const sink = createEventSink({
		logPath: join(targetRunDir, "events.jsonl"),
		runId,
		parentSessionId: PARENT_SESSION_ID,
		activityBus: { publish: () => {} },
		durable: {
			rootDir: blockedRoot,
			scope: PLAN_SLUG,
			runId,
			workdir: targetRunDir,
			eventsPath: "orchestration-events.jsonl",
		},
	});

	await sink(event({ type: "task_done", taskId: "TASK-SETUP" }, runId));
}

async function writeLegacyEvents(
	runId: string,
	events: readonly DriverEvent[],
): Promise<void> {
	await mkdir(runDir(runId), { recursive: true });
	await writeFile(
		join(runDir(runId), "events.jsonl"),
		`${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		"utf-8",
	);
}

async function callWatchEvents(since?: number): Promise<ToolResult> {
	return callWatchEventsFor(RUN_ID, since);
}

async function callWatchEventsFor(
	runId: string,
	since?: number,
): Promise<ToolResult> {
	const pi = createMockPi(temp.path, { sessionId: PARENT_SESSION_ID });
	registerWatchEventsTool(pi as never);
	const params: Record<string, unknown> = { planSlug: PLAN_SLUG, runId };
	if (since !== undefined) {
		params.since = since;
	}
	return (await pi.callTool("watch_events", params)) as ToolResult;
}

async function readNormalizedTypes(): Promise<string[]> {
	const lines = (
		await readFile(join(runDir(), "orchestration-events.jsonl"), "utf-8")
	)
		.trim()
		.split("\n");
	return lines
		.map((line) => JSON.parse(line) as { event?: { type?: unknown } })
		.map((entry) => String(entry.event?.type));
}

function event(
	overrides: Partial<DriverEvent> & Pick<DriverEvent, "type">,
	runId = RUN_ID,
): DriverEvent {
	return {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		timestamp: "2026-06-05T00:00:00.000Z",
		...overrides,
	} as DriverEvent;
}

function rootDir(): string {
	return join(temp.path, "missions", "sessions");
}

function runDir(runId = RUN_ID): string {
	return join(rootDir(), PLAN_SLUG, "runs", runId);
}
