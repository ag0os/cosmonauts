import { describe, expect, test } from "vitest";
import {
	type DriverEventNormalizationDiagnostic,
	normalizeDriverEvent,
} from "../../lib/driver/durable-events.ts";
import type { DriverEvent, ParsedReport } from "../../lib/driver/types.ts";
import type {
	OrchestrationEvent,
	StepResult,
} from "../../lib/durable-runtime/index.ts";

type EventOf<T extends DriverEvent["type"]> = Extract<DriverEvent, { type: T }>;

const base = {
	runId: "run-1",
	parentSessionId: "session-1",
	timestamp: "2026-06-03T00:00:00.000Z",
};

describe("durable driver events", () => {
	// @cosmo-behavior plan:durable-run-store-events#B-004
	test("maps driver lifecycle events without fabricating backend or step data", () => {
		const events = [
			normalize(runStarted()),
			normalize(taskStarted()),
			normalize(spawnStarted()),
			normalize(driverActivity()),
			normalize(verify("started")),
			normalize(finalize("passed")),
			normalize(taskDone()),
			normalize(taskBlocked()),
			normalize(taskFinalizationFailed()),
			normalize(runCompleted()),
			normalize(runAborted()),
			normalize(runFinalizationFailed()),
		].flatMap((result) => result.events);

		expect(events).toEqual([
			{ type: "run_started", runId: "run-1" },
			{ type: "step_ready", runId: "run-1", stepId: "TASK-1" },
			{
				type: "step_started",
				runId: "run-1",
				stepId: "TASK-1",
				backend: "codex",
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "driver_activity",
					activity: { kind: "turn_start" },
				},
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "verify",
					phase: "post",
					status: "started",
				},
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "finalize",
					phase: "commit",
					status: "passed",
				},
			},
			{
				type: "step_completed",
				runId: "run-1",
				stepId: "TASK-1",
				result: {
					outcome: "success",
					summary: "Drive task completed.",
					artifacts: [],
				},
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "task_blocked",
					reason: "needs human input",
				},
			},
			{
				type: "step_blocked",
				runId: "run-1",
				stepId: "TASK-1",
				reason: "needs human input",
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "task_finalization_failed",
					phase: "commit",
					reason: "commit failed",
					retryable: true,
				},
			},
			{
				type: "step_failed",
				runId: "run-1",
				stepId: "TASK-1",
				reason: "commit failed",
			},
			{
				type: "run_completed",
				runId: "run-1",
				result: {
					outcome: "completed",
					tasksDone: 2,
					tasksBlocked: 0,
				},
			},
			{
				type: "run_failed",
				runId: "run-1",
				reason: "aborted by user",
			},
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "run_finalization_failed",
					phase: "state_commit",
					reason: "state commit failed",
					taskId: "TASK-1",
					commitSha: "abc123",
				},
			},
			{
				type: "run_failed",
				runId: "run-1",
				reason: "state commit failed",
			},
		]);

		for (const event of events) {
			expectTerminalShape(event);
		}

		const normalizedLockWarning = normalize(lockWarning());
		expect(normalizedLockWarning.events).toEqual([]);
		expect(normalizedLockWarning.diagnostics).toEqual([
			expect.objectContaining({
				code: "legacy_only_driver_event",
				message: expect.stringContaining("lock_warning"),
				details: { eventType: "lock_warning" },
			}),
		]);

		const candidate = normalize(planCompletionCandidate());
		expect(candidate.events).toEqual([]);
		expect(candidate.diagnostics).toEqual([
			expect.objectContaining({
				code: "legacy_only_driver_event",
				message: expect.stringContaining("plan_completion_candidate"),
				details: { eventType: "plan_completion_candidate" },
			}),
		]);
	});

	// @cosmo-behavior plan:durable-run-store-events#B-005
	test("preserves reports activity commits and finalization details without extending terminal events", () => {
		const report: ParsedReport = {
			outcome: "partial",
			files: [{ path: "lib/example.ts", change: "modified" }],
			verification: [{ command: "bun run test", status: "pass" }],
			notes: "implemented most of it",
			progress: { phase: 1, of: 2, remaining: "wire integration" },
		};
		const unknownReport: ParsedReport = {
			outcome: "unknown",
			raw: "backend returned no report",
		};
		const normalized = [
			normalize(spawnCompleted(report)),
			normalize(spawnCompleted(unknownReport)),
			normalize(
				driverActivity({ kind: "tool_end", toolName: "Edit", isError: true }),
			),
			normalize(commitMade()),
			normalize(finalize("failed", { error: "no changes" })),
			normalize(
				taskBlocked({
					progress: { phase: 1, of: 3, remaining: "needs config" },
					contradicted: { path: "missing.txt", existsOnDisk: true },
				}),
			),
			normalize(
				taskFinalizationFailed({
					commitSha: "def456",
				}),
			),
			normalize(runFinalizationFailed({ taskId: undefined })),
			normalize(taskDone()),
		];
		const events = normalized.flatMap((result) => result.events);
		const diagnostics = normalized.flatMap((result) => result.diagnostics);

		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: { kind: "spawn_completed", report },
		});
		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: { kind: "spawn_completed", report: unknownReport },
		});
		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: {
				kind: "driver_activity",
				activity: { kind: "tool_end", toolName: "Edit", isError: true },
			},
		});
		expect(events).toContainEqual({
			type: "artifact_written",
			runId: "run-1",
			stepId: "TASK-1",
			artifact: {
				id: "commit:TASK-1:abc123",
				path: "abc123",
				kind: "commit",
				metadata: { sha: "abc123", subject: "Finish task" },
			},
		});
		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: {
				kind: "finalize",
				phase: "commit",
				status: "failed",
				error: "no changes",
			},
		});
		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: {
				kind: "task_blocked",
				reason: "needs human input",
				progress: { phase: 1, of: 3, remaining: "needs config" },
				contradicted: { path: "missing.txt", existsOnDisk: true },
			},
		});
		expect(events).toContainEqual({
			type: "step_tool_activity",
			runId: "run-1",
			stepId: "TASK-1",
			details: {
				kind: "task_finalization_failed",
				phase: "commit",
				reason: "commit failed",
				commitSha: "def456",
				retryable: true,
			},
		});
		expect(events).toContainEqual({
			type: "step_completed",
			runId: "run-1",
			stepId: "TASK-1",
			result: {
				outcome: "success",
				summary: "Drive task completed.",
				artifacts: [],
			},
		});
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: "drive_finalization_evidence",
				message: expect.stringContaining("run_finalization_failed"),
				details: {
					eventType: "run_finalization_failed",
					phase: "state_commit",
					reason: "state commit failed",
					commitSha: "abc123",
				},
			}),
		]);

		for (const event of events) {
			expectTerminalShape(event);
		}
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-011
	test("uses enriched task completion results only for unknown report corrections", () => {
		const reportResult: StepResult = {
			outcome: "success",
			summary: "finished durable step projection",
			artifacts: [
				{
					id: "report",
					path: "steps/TASK-1/attempts/attempt-001/result.json",
					kind: "report",
				},
			],
			files: [{ path: "lib/driver/durable-steps.ts", status: "modified" }],
			verification: [{ command: "bun run test", status: "pass" }],
			nextAction: "continue",
		};
		const unknownResult: StepResult = {
			outcome: "unknown",
			summary: "Drive backend report was not machine-readable.",
			artifacts: reportResult.artifacts,
			nextAction: "wait_for_human",
		};

		expect(normalizedTaskDoneResult(reportResult)).toEqual({
			outcome: "success",
			summary: "Drive task completed.",
			artifacts: [],
		});
		expect(normalizedTaskDoneResult(unknownResult)).toEqual(unknownResult);
	});

	// @cosmo-behavior plan:durable-run-store-events#B-015
	test("maps failed preflight to activity detail followed by canonical step blocked", () => {
		const started = normalize(preflight("started"));
		const passed = normalize(preflight("passed"));
		const failed = normalize(
			preflight("failed", {
				details: {
					command: "bun run test",
					stderr: "preflight failed: bun run test",
				},
			}),
		);
		const branchMismatch = normalize(
			preflight("failed", {
				details: {
					branch: "main",
					stderr: "branch mismatch: expected feature, got main",
				},
			}),
		);

		expect(started.events).toEqual([
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: { kind: "preflight", status: "started" },
			},
		]);
		expect(passed.events).toEqual([
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: { kind: "preflight", status: "passed" },
			},
		]);
		expect(started.events).not.toContainEqual(
			expect.objectContaining({ type: "step_blocked" }),
		);
		expect(passed.events).not.toContainEqual(
			expect.objectContaining({ type: "step_blocked" }),
		);
		expect(failed.events).toEqual([
			{
				type: "step_tool_activity",
				runId: "run-1",
				stepId: "TASK-1",
				details: {
					kind: "preflight",
					status: "failed",
					command: "bun run test",
					stderr: "preflight failed: bun run test",
				},
			},
			{
				type: "step_blocked",
				runId: "run-1",
				stepId: "TASK-1",
				reason: "preflight failed: bun run test",
			},
		]);
		expect(branchMismatch.events.at(-1)).toEqual({
			type: "step_blocked",
			runId: "run-1",
			stepId: "TASK-1",
			reason: "branch mismatch: expected feature, got main",
		});
		expectTerminalShape(failed.events[1]);
		expectTerminalShape(branchMismatch.events[1]);
	});
});

function normalize(event: DriverEvent): {
	events: OrchestrationEvent[];
	diagnostics: DriverEventNormalizationDiagnostic[];
} {
	return normalizeDriverEvent(event);
}

function normalizedTaskDoneResult(result: StepResult): StepResult | undefined {
	const event = normalizeDriverEvent(taskDone(), {
		latestTaskResult: () => result,
	}).events[0];
	return event?.type === "step_completed" ? event.result : undefined;
}

function expectTerminalShape(event: OrchestrationEvent | undefined): void {
	expect(event).toBeDefined();
	if (!event) {
		return;
	}
	if (event.type === "step_blocked" || event.type === "step_failed") {
		expect(Object.keys(event).sort()).toEqual([
			"reason",
			"runId",
			"stepId",
			"type",
		]);
	}
	if (event.type === "run_failed") {
		expect(Object.keys(event).sort()).toEqual(["reason", "runId", "type"]);
	}
}

function runStarted(): EventOf<"run_started"> {
	return {
		...base,
		type: "run_started",
		planSlug: "durable-run-store-events",
		backend: "codex",
		mode: "inline",
	};
}

function taskStarted(): EventOf<"task_started"> {
	return { ...base, type: "task_started", taskId: "TASK-1" };
}

function preflight(
	status: EventOf<"preflight">["status"],
	overrides: Partial<EventOf<"preflight">> = {},
): EventOf<"preflight"> {
	return { ...base, type: "preflight", taskId: "TASK-1", status, ...overrides };
}

function spawnStarted(): EventOf<"spawn_started"> {
	return { ...base, type: "spawn_started", taskId: "TASK-1", backend: "codex" };
}

function driverActivity(
	activity: EventOf<"driver_activity">["activity"] = { kind: "turn_start" },
): EventOf<"driver_activity"> {
	return { ...base, type: "driver_activity", taskId: "TASK-1", activity };
}

function spawnCompleted(
	report: ParsedReport = successReport(),
): EventOf<"spawn_completed"> {
	return { ...base, type: "spawn_completed", taskId: "TASK-1", report };
}

function verify(status: EventOf<"verify">["status"]): EventOf<"verify"> {
	return { ...base, type: "verify", taskId: "TASK-1", phase: "post", status };
}

function commitMade(): EventOf<"commit_made"> {
	return {
		...base,
		type: "commit_made",
		taskId: "TASK-1",
		sha: "abc123",
		subject: "Finish task",
	};
}

function finalize(
	status: EventOf<"finalize">["status"],
	details?: EventOf<"finalize">["details"],
): EventOf<"finalize"> {
	return {
		...base,
		type: "finalize",
		taskId: "TASK-1",
		phase: "commit",
		status,
		...(details ? { details } : {}),
	};
}

function taskDone(): EventOf<"task_done"> {
	return { ...base, type: "task_done", taskId: "TASK-1" };
}

function taskBlocked(
	overrides: Partial<EventOf<"task_blocked">> = {},
): EventOf<"task_blocked"> {
	return {
		...base,
		type: "task_blocked",
		taskId: "TASK-1",
		reason: "needs human input",
		...overrides,
	};
}

function taskFinalizationFailed(
	overrides: Partial<EventOf<"task_finalization_failed">> = {},
): EventOf<"task_finalization_failed"> {
	return {
		...base,
		type: "task_finalization_failed",
		taskId: "TASK-1",
		phase: "commit",
		reason: "commit failed",
		retryable: true,
		...overrides,
	};
}

function runCompleted(): EventOf<"run_completed"> {
	return {
		...base,
		type: "run_completed",
		summary: { total: 2, done: 2, blocked: 0 },
	};
}

function runAborted(): EventOf<"run_aborted"> {
	return { ...base, type: "run_aborted", reason: "aborted by user" };
}

function runFinalizationFailed(
	overrides: Partial<EventOf<"run_finalization_failed">> = {},
): EventOf<"run_finalization_failed"> {
	return {
		...base,
		type: "run_finalization_failed",
		phase: "state_commit",
		reason: "state commit failed",
		taskId: "TASK-1",
		commitSha: "abc123",
		...overrides,
	};
}

function lockWarning(): EventOf<"lock_warning"> {
	return { ...base, type: "lock_warning", reason: "already running" };
}

function planCompletionCandidate(): EventOf<"plan_completion_candidate"> {
	return {
		...base,
		type: "plan_completion_candidate",
		planSlug: "durable-run-store-events",
		taskCount: 2,
		reason: "all_plan_tasks_done",
	};
}

function successReport(): ParsedReport {
	return {
		outcome: "success",
		files: [],
		verification: [],
	};
}
