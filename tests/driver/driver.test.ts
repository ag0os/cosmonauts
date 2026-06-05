import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BackendRunResult } from "../../lib/driver/backends/types.ts";
import type { RunDriveOnGraphCtx } from "../../lib/driver/drive-graph-runner.ts";
import { type DriverDeps, runInline } from "../../lib/driver/driver.ts";
import type { CreateEventSinkOptions } from "../../lib/driver/event-stream.ts";
import type {
	DriverResult,
	DriverRunSpec,
	EventSink,
	LockHandle,
} from "../../lib/driver/types.ts";

type ActivePlanLock = {
	error: "active";
	activeRunId: string;
	activeAt: string;
};

type AcquirePlanLockFn = (
	planSlug: string,
	runId: string,
	cosmonautsRoot: string,
) => Promise<LockHandle | ActivePlanLock>;

type CreateEventSinkFn = (options: CreateEventSinkOptions) => EventSink;
type DriveGraphActivityEventSinkOptionsFn = (
	spec: DriverRunSpec,
) => NonNullable<CreateEventSinkOptions["durable"]>;
type RunDriveOnGraphFn = (
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
) => Promise<DriverResult>;
type BridgeJsonlToActivityBusFn = () => { stop(): void };

const mocks = vi.hoisted(() => ({
	acquirePlanLock: vi.fn<AcquirePlanLockFn>(),
	bridgeJsonlToActivityBus: vi.fn<BridgeJsonlToActivityBusFn>(),
	createEventSink: vi.fn<CreateEventSinkFn>(),
	driveGraphActivityEventSinkOptions:
		vi.fn<DriveGraphActivityEventSinkOptionsFn>(),
	eventSink: vi.fn<EventSink>(),
	runDriveOnGraph: vi.fn<RunDriveOnGraphFn>(),
}));

vi.mock("../../lib/driver/lock.ts", () => ({
	acquirePlanLock: mocks.acquirePlanLock,
}));

vi.mock("../../lib/driver/event-stream.ts", () => ({
	bridgeJsonlToActivityBus: mocks.bridgeJsonlToActivityBus,
	createEventSink: mocks.createEventSink,
	driveGraphActivityEventSinkOptions: mocks.driveGraphActivityEventSinkOptions,
}));

vi.mock("../../lib/driver/drive-graph-runner.ts", () => ({
	runDriveOnGraph: mocks.runDriveOnGraph,
}));

describe("driver", () => {
	beforeEach(() => {
		mocks.acquirePlanLock.mockReset();
		mocks.bridgeJsonlToActivityBus.mockReset();
		mocks.createEventSink.mockReset();
		mocks.driveGraphActivityEventSinkOptions.mockReset();
		mocks.eventSink.mockReset();
		mocks.runDriveOnGraph.mockReset();
		mocks.bridgeJsonlToActivityBus.mockReturnValue({ stop: vi.fn() });
		mocks.createEventSink.mockReturnValue(mocks.eventSink);
		mocks.driveGraphActivityEventSinkOptions.mockReturnValue({
			rootDir: "/project/missions/sessions",
			scope: "driver-primitives",
			runId: "run-257",
		});
	});

	test("runInline acquires the plan lock, starts the graph runner, and releases on success", async () => {
		const spec = createSpec();
		const deps = createDeps();
		const loop = deferred<DriverResult>();
		const lock = createLock();
		const order: string[] = [];
		const result: DriverResult = {
			runId: spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		};

		mocks.acquirePlanLock.mockImplementation(async () => {
			order.push("lock");
			return lock;
		});
		mocks.runDriveOnGraph.mockImplementation(() => {
			order.push("loop");
			return loop.promise;
		});

		const handle = runInline(spec, deps);

		expect(handle.runId).toBe(spec.runId);
		expect(handle.planSlug).toBe(spec.planSlug);
		expect(handle.workdir).toBe(spec.workdir);
		expect(handle.eventLogPath).toBe(spec.eventLogPath);
		expect(handle.abort).toEqual(expect.any(Function));
		expect(handle.result).toEqual(expect.any(Promise));
		expect(mocks.runDriveOnGraph).not.toHaveBeenCalled();

		await flushMicrotasks();

		expect(order).toEqual(["lock", "loop"]);
		expect(mocks.acquirePlanLock).toHaveBeenCalledWith(
			spec.planSlug,
			spec.runId,
			deps.cosmonautsRoot,
		);
		expect(mocks.createEventSink).toHaveBeenCalledWith({
			logPath: spec.eventLogPath,
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
			activityBus: deps.activityBus,
			durable: {
				rootDir: "/project/missions/sessions",
				scope: "driver-primitives",
				runId: "run-257",
			},
		});
		const ctx = requireRunCtx();
		expect(mocks.runDriveOnGraph).toHaveBeenCalledWith(spec, ctx);
		expect(ctx).toMatchObject({
			taskManager: deps.taskManager,
			backend: deps.backend,
			eventSink: mocks.eventSink,
			parentSessionId: spec.parentSessionId,
			runId: spec.runId,
			cosmonautsRoot: deps.cosmonautsRoot,
			mode: "inline",
		});
		expect(ctx.abortSignal.aborted).toBe(false);

		await handle.abort();
		expect(ctx.abortSignal.aborted).toBe(true);
		expect(lock.release).not.toHaveBeenCalled();

		loop.resolve(result);
		await expect(handle.result).resolves.toEqual(result);
		expect(lock.release).toHaveBeenCalledTimes(1);
	});

	test("runInline releases the plan lock when the loop fails", async () => {
		const error = new Error("loop failed");
		const lock = createLock();
		mocks.acquirePlanLock.mockResolvedValue(lock);
		mocks.runDriveOnGraph.mockRejectedValue(error);

		const handle = runInline(createSpec(), createDeps());

		await expect(handle.result).rejects.toBe(error);
		expect(lock.release).toHaveBeenCalledTimes(1);
	});

	test("runInline rejects concurrent same-plan invocations", async () => {
		const deps = createDeps();
		const firstLoop = deferred<DriverResult>();
		const firstLock = createLock();
		const active: ActivePlanLock = {
			error: "active",
			activeRunId: "run-1",
			activeAt: "2026-05-04T00:00:00.000Z",
		};
		let held = false;

		mocks.acquirePlanLock.mockImplementation(async () => {
			if (held) {
				return active;
			}
			held = true;
			return firstLock;
		});
		firstLock.release.mockImplementation(async () => {
			held = false;
		});
		mocks.runDriveOnGraph.mockReturnValue(firstLoop.promise);

		const first = runInline(createSpec({ runId: "run-1" }), deps);
		await flushMicrotasks();
		const second = runInline(createSpec({ runId: "run-2" }), deps);

		await expect(second.result).rejects.toEqual(active);
		expect(mocks.runDriveOnGraph).toHaveBeenCalledTimes(1);

		const result: DriverResult = {
			runId: "run-1",
			outcome: "completed",
			tasksDone: 0,
			tasksBlocked: 0,
		};
		firstLoop.resolve(result);
		await expect(first.result).resolves.toEqual(result);
		expect(firstLock.release).toHaveBeenCalledTimes(1);
	});

	test("runInline has no domains imports", async () => {
		const source = await readFile("lib/driver/driver.ts", "utf-8");

		expect(source).not.toContain("domains/");
		expect(source).not.toContain("/domains");
	});
});

function createSpec(overrides: Partial<DriverRunSpec> = {}): DriverRunSpec {
	return {
		runId: "run-257",
		parentSessionId: "parent-session-257",
		projectRoot: "/project",
		planSlug: "driver-primitives",
		taskIds: ["TASK-257"],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: "/project/envelope.md" },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: "/project/missions/sessions/driver-primitives/runs/run-257",
		eventLogPath:
			"/project/missions/sessions/driver-primitives/runs/run-257/events.jsonl",
		...overrides,
	};
}

function createDeps(): DriverDeps {
	return {
		taskManager: {} as DriverDeps["taskManager"],
		backend: {
			name: "test-backend",
			capabilities: { canCommit: false, isolatedFromHostSource: false },
			run: vi.fn<() => Promise<BackendRunResult>>(),
		},
		activityBus: { publish: vi.fn() },
		cosmonautsRoot: "/project",
	};
}

function createLock(): LockHandle & { release: ReturnType<typeof vi.fn> } {
	return { release: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
}

function requireRunCtx(): RunDriveOnGraphCtx {
	const ctx = mocks.runDriveOnGraph.mock.calls[0]?.[1];
	if (!ctx) {
		throw new Error("runDriveOnGraph was not called");
	}
	return ctx;
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
