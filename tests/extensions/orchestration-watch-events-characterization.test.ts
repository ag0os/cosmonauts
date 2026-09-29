import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const PLAN_SLUG = "watch-char-plan";
const RUN_ID = "watch-char-run";
const PARENT_SESSION_ID = "watch-char-parent";

const temp = useTempDir("watch-events-characterization-");

function makeEvent(event: Record<string, unknown>): DriverEvent {
	return {
		runId: RUN_ID,
		parentSessionId: PARENT_SESSION_ID,
		timestamp: "2026-05-12T00:00:00.000Z",
		...event,
	} as DriverEvent;
}

async function renderLine(event: Record<string, unknown>): Promise<string> {
	const dir = join(
		temp.path,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		RUN_ID,
	);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "events.jsonl"),
		`${JSON.stringify(makeEvent(event))}\n`,
		"utf-8",
	);
	const pi = createMockPi(temp.path, { sessionId: PARENT_SESSION_ID });
	registerWatchEventsTool(pi as never);
	const result = (await pi.callTool("watch_events", {
		planSlug: PLAN_SLUG,
		runId: RUN_ID,
	})) as { content: { text: string }[] };
	const lines = (result.content[0]?.text ?? "").split("\n");
	expect(lines).toHaveLength(2);
	expect(lines[1]).toMatch(/^cursor \d+$/);
	return lines[0] ?? "";
}

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("describeDriverEvent through watch_events (characterization)", () => {
	const cases: Array<[string, Record<string, unknown>, string]> = [
		[
			"run_started",
			{ type: "run_started", planSlug: "p", backend: "codex", mode: "inline" },
			"- run_started: p via codex (inline)",
		],
		[
			"task_started",
			{ type: "task_started", taskId: "TASK-1" },
			"- task_started: TASK-1",
		],
		[
			"preflight with command",
			{
				type: "preflight",
				taskId: "TASK-1",
				status: "failed",
				details: { command: "bun run x" },
			},
			"- preflight: TASK-1, failed, cmd: bun run x",
		],
		[
			"preflight without details",
			{ type: "preflight", taskId: "TASK-1", status: "started" },
			"- preflight: TASK-1, started",
		],
		[
			"spawn_started",
			{ type: "spawn_started", taskId: "TASK-1", backend: "claude-cli" },
			"- spawn_started: TASK-1 via claude-cli",
		],
		[
			"driver_activity tool_start",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "tool_start", toolName: "edit", summary: "patch" },
			},
			"- driver_activity: TASK-1 tool_start edit: patch",
		],
		[
			"driver_activity tool_end error",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "tool_end", toolName: "edit", isError: true },
			},
			"- driver_activity: TASK-1 tool_end edit (error)",
		],
		[
			"driver_activity tool_end ok",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "tool_end", toolName: "edit", isError: false },
			},
			"- driver_activity: TASK-1 tool_end edit",
		],
		[
			"driver_activity turn_start",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "turn_start" },
			},
			"- driver_activity: TASK-1 turn_start",
		],
		[
			"driver_activity turn_end",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "turn_end" },
			},
			"- driver_activity: TASK-1 turn_end",
		],
		[
			"driver_activity compaction",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: { kind: "compaction" },
			},
			"- driver_activity: TASK-1 compaction",
		],
		[
			"driver_activity other kind",
			{
				type: "driver_activity",
				taskId: "TASK-1",
				activity: {
					kind: "agent_resolved",
					requestedRole: "a",
					resolvedAgentId: "b",
				},
			},
			"- driver_activity: TASK-1 activity",
		],
		[
			"spawn_completed success with progress",
			{
				type: "spawn_completed",
				taskId: "TASK-1",
				report: {
					outcome: "success",
					files: [],
					verification: [],
					progress: { phase: 1, of: 3 },
				},
			},
			"- spawn_completed: TASK-1 report: success, phase 1/3",
		],
		[
			"spawn_completed without progress",
			{
				type: "spawn_completed",
				taskId: "TASK-1",
				report: { outcome: "failure", files: [], verification: [] },
			},
			"- spawn_completed: TASK-1 report: failure",
		],
		[
			"spawn_completed unknown",
			{
				type: "spawn_completed",
				taskId: "TASK-1",
				report: { outcome: "unknown", raw: "junk" },
			},
			"- spawn_completed: TASK-1 report: unknown",
		],
		[
			"spawn_failed with zero exit code",
			{ type: "spawn_failed", taskId: "TASK-1", error: "crash", exitCode: 0 },
			"- spawn_failed: TASK-1, error: crash, exitCode: 0",
		],
		[
			"spawn_failed with non-zero exit code",
			{ type: "spawn_failed", taskId: "TASK-1", error: "crash", exitCode: 2 },
			"- spawn_failed: TASK-1, error: crash, exitCode: 2",
		],
		[
			"verify with command",
			{
				type: "verify",
				taskId: "TASK-1",
				phase: "post",
				status: "passed",
				details: { command: "bun run test" },
			},
			"- verify: TASK-1, passed, cmd: bun run test",
		],
		[
			"commit_made",
			{ type: "commit_made", taskId: "TASK-1", sha: SHA, subject: "msg" },
			"- commit_made: TASK-1 01234567 msg",
		],
		[
			"finalize with all details",
			{
				type: "finalize",
				taskId: "TASK-1",
				phase: "commit",
				status: "failed",
				details: {
					reason: "no_changes",
					error: "oops",
					sha: SHA,
					subject: "subj",
				},
			},
			"- finalize: TASK-1 commit failed, reason: no_changes, error: oops, sha: 01234567, subject: subj",
		],
		[
			"finalize without task or details",
			{ type: "finalize", phase: "commit", status: "skipped" },
			"- finalize: commit skipped",
		],
		[
			"task_finalization_failed with commit",
			{
				type: "task_finalization_failed",
				taskId: "TASK-1",
				phase: "commit",
				reason: "why",
				commitSha: SHA,
				retryable: true,
			},
			"- task_finalization_failed: TASK-1, phase commit, reason: why, commit 01234567",
		],
		[
			"task_finalization_failed without commit",
			{
				type: "task_finalization_failed",
				taskId: "TASK-1",
				phase: "task_status",
				reason: "why",
				retryable: true,
			},
			"- task_finalization_failed: TASK-1, phase task_status, reason: why",
		],
		[
			"task_done",
			{ type: "task_done", taskId: "TASK-1" },
			"- task_done: TASK-1",
		],
		[
			"task_blocked with progress",
			{
				type: "task_blocked",
				taskId: "TASK-1",
				reason: "stuck",
				progress: { phase: 2, of: 5 },
			},
			"- task_blocked: TASK-1, reason: stuck, progress: phase 2/5",
		],
		[
			"task_blocked without progress",
			{ type: "task_blocked", taskId: "TASK-1", reason: "stuck" },
			"- task_blocked: TASK-1, reason: stuck",
		],
		[
			"lock_warning with previous run",
			{
				type: "lock_warning",
				reason: "stale lock",
				details: { previousRunId: "run-old" },
			},
			"- lock_warning: reason: stale lock, previousRunId: run-old",
		],
		[
			"lock_warning without details",
			{ type: "lock_warning", reason: "stale lock" },
			"- lock_warning: reason: stale lock",
		],
		[
			"run_completed",
			{
				type: "run_completed",
				summary: { total: 3, done: 2, blocked: 1 },
			},
			"- run_completed: total 3, done 2, blocked 1",
		],
		[
			"run_aborted",
			{ type: "run_aborted", reason: "user" },
			"- run_aborted: reason: user",
		],
		[
			"run_finalization_failed with task and commit",
			{
				type: "run_finalization_failed",
				phase: "commit",
				reason: "why",
				taskId: "TASK-9",
				commitSha: SHA,
			},
			"- run_finalization_failed: phase commit, reason: why, task TASK-9, commit 01234567",
		],
		[
			"run_finalization_failed minimal",
			{ type: "run_finalization_failed", phase: "commit", reason: "why" },
			"- run_finalization_failed: phase commit, reason: why",
		],
		[
			"plan_completion_candidate",
			{
				type: "plan_completion_candidate",
				planSlug: "p",
				taskCount: 4,
				reason: "all_plan_tasks_done",
			},
			"- plan_completion_candidate: p, all 4 plan tasks closed (Done or Cancelled), reason: all_plan_tasks_done",
		],
	];

	test.each(cases)("renders %s", async (_name, event, expected) => {
		expect(await renderLine(event)).toBe(expected);
	});

	test("falls back to the JSON encoding for event types without a description", async () => {
		const line = await renderLine({
			type: "driver_diagnostic",
			level: "warning",
			code: "C1",
			message: "m",
		});
		expect(line.startsWith("- driver_diagnostic: {")).toBe(true);
		expect(line).toContain('"type":"driver_diagnostic"');
		expect(line.endsWith("…")).toBe(true);
	});

	test("clips a rendered line longer than 160 characters with an ellipsis", async () => {
		const line = await renderLine({
			type: "run_aborted",
			reason: "z".repeat(300),
		});
		expect(line.startsWith("- ")).toBe(true);
		expect(line.slice(2)).toHaveLength(160);
		expect(line.endsWith("…")).toBe(true);
	});
});
