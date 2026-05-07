import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BackendRunResult } from "../../lib/driver/backends/types.ts";
import { EventLogWriteError } from "../../lib/driver/event-stream.ts";
import {
	type RunRunLoopCtx,
	runRunLoop,
} from "../../lib/driver/run-run-loop.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	TaskOutcome,
} from "../../lib/driver/types.ts";
import { useTempDir } from "../helpers/fs.ts";

type RunOneTaskFn = (
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
	taskId: string,
) => Promise<TaskOutcome>;

const mocks = vi.hoisted(() => ({
	runOneTask: vi.fn<RunOneTaskFn>(),
}));

vi.mock("../../lib/driver/run-one-task.ts", () => ({
	runOneTask: mocks.runOneTask,
}));

const temp = useTempDir("run-run-loop-test-");

describe("run-run-loop", () => {
	beforeEach(() => {
		mocks.runOneTask.mockReset();
	});

	test("run-run-loop emits run_started before tasks and run_completed summary", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec({ taskIds: ["TASK-1", "TASK-2"] });
		const ctx = createCtx(events);
		mocks.runOneTask
			.mockImplementationOnce(async () => {
				expect(events).toEqual([
					expect.objectContaining({
						type: "run_started",
						planSlug: spec.planSlug,
						backend: spec.backendName,
						mode: "inline",
					}),
				]);
				return { status: "done" };
			})
			.mockResolvedValueOnce({ status: "done" });

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).toHaveBeenCalledTimes(2);
		expect(mocks.runOneTask).toHaveBeenNthCalledWith(1, spec, ctx, "TASK-1");
		expect(mocks.runOneTask).toHaveBeenNthCalledWith(2, spec, ctx, "TASK-2");
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"run_completed",
		]);
		expect(events.at(-1)).toMatchObject({
			type: "run_completed",
			summary: { total: 2, done: 2, blocked: 0 },
		});
		expect(result).toEqual({
			runId: spec.runId,
			outcome: "completed",
			tasksDone: 2,
			tasksBlocked: 0,
		});
	});

	test("run-run-loop blocked outcome emits run_aborted and stops", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec({ taskIds: ["TASK-1", "TASK-2", "TASK-3"] });
		const ctx = createCtx(events);
		mocks.runOneTask
			.mockResolvedValueOnce({ status: "done" })
			.mockResolvedValueOnce({ status: "blocked", reason: "needs input" })
			.mockResolvedValueOnce({ status: "done" });

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).toHaveBeenCalledTimes(2);
		expect(mocks.runOneTask).toHaveBeenNthCalledWith(2, spec, ctx, "TASK-2");
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"run_aborted",
		]);
		expect(events[1]).toMatchObject({
			type: "run_aborted",
			reason: "needs input",
		});
		expect(result).toMatchObject({
			runId: spec.runId,
			outcome: "blocked",
			tasksDone: 1,
			tasksBlocked: 1,
			blockedTaskId: "TASK-2",
			blockedReason: "needs input",
		});
	});

	test("run-run-loop partialMode stop emits run_aborted and stops", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec({
			taskIds: ["TASK-1", "TASK-2"],
			partialMode: "stop",
		});
		const ctx = createCtx(events);
		mocks.runOneTask
			.mockResolvedValueOnce({ status: "partial", reason: "half done" })
			.mockResolvedValueOnce({ status: "done" });

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).toHaveBeenCalledTimes(1);
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"run_aborted",
		]);
		expect(events[1]).toMatchObject({
			type: "run_aborted",
			reason: "partial: stopping per partialMode",
		});
		expect(result).toMatchObject({
			outcome: "aborted",
			tasksDone: 0,
			tasksBlocked: 1,
			blockedTaskId: "TASK-1",
			blockedReason: "partial: stopping per partialMode",
		});
	});

	test("run-run-loop partialMode continue proceeds without aborting", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec({
			taskIds: ["TASK-1", "TASK-2"],
			partialMode: "continue",
		});
		const ctx = createCtx(events);
		mocks.runOneTask
			.mockResolvedValueOnce({ status: "partial", reason: "half done" })
			.mockResolvedValueOnce({ status: "done" });

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).toHaveBeenCalledTimes(2);
		expect(mocks.runOneTask).toHaveBeenNthCalledWith(2, spec, ctx, "TASK-2");
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"run_completed",
		]);
		expect(events[1]).toMatchObject({
			type: "run_completed",
			summary: { total: 2, done: 1, blocked: 1 },
		});
		expect(result).toMatchObject({
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 1,
			blockedTaskId: "TASK-1",
		});
	});

	test("driver log write failure writes fallback run_aborted", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec();
		const ctx = createCtx(events, {
			eventSink: async (event) => {
				throw new EventLogWriteError(
					spec.eventLogPath,
					event,
					new Error("disk full"),
				);
			},
		});

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).not.toHaveBeenCalled();
		expect(result).toEqual({
			runId: spec.runId,
			outcome: "aborted",
			tasksDone: 0,
			tasksBlocked: 0,
			blockedReason: "log write failed",
		});
		const line = (await readFile(spec.eventLogPath, "utf-8")).trimEnd();
		expect(JSON.parse(line)).toMatchObject({
			type: "run_aborted",
			reason: "log write failed",
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
		});
	});

	test("run-run-loop has no domains imports", async () => {
		const source = await readFile("lib/driver/run-run-loop.ts", "utf-8");

		expect(source).not.toContain("domains/");
		expect(source).not.toContain("/domains");
	});
});

function createSpec(overrides: Partial<DriverRunSpec> = {}): DriverRunSpec {
	return {
		runId: "run-256",
		parentSessionId: "parent-session-256",
		projectRoot: temp.path,
		planSlug: "driver-primitives",
		taskIds: ["TASK-256"],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: join(temp.path, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: temp.path,
		eventLogPath: join(temp.path, "events.jsonl"),
		...overrides,
	};
}

function createCtx(
	events: DriverEvent[],
	overrides: Partial<RunRunLoopCtx> = {},
): RunRunLoopCtx {
	const eventSink: EventSink = async (event) => {
		events.push(event);
	};

	return {
		taskManager: {} as RunRunLoopCtx["taskManager"],
		backend: {
			name: "test-backend",
			capabilities: { canCommit: false, isolatedFromHostSource: false },
			run: vi.fn<() => Promise<BackendRunResult>>(),
		},
		eventSink,
		parentSessionId: "parent-session-256",
		runId: "run-256",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: temp.path,
		mode: "inline",
		...overrides,
	};
}
