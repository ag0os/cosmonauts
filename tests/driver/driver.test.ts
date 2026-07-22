import { EventEmitter } from "node:events";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BackendRunResult } from "../../lib/driver/backends/types.ts";
import type { RunDriveOnGraphCtx } from "../../lib/driver/drive-graph-runner.ts";
import {
	type DriverDeps,
	runInline,
	startDetached,
} from "../../lib/driver/driver.ts";
import type { CreateEventSinkOptions } from "../../lib/driver/event-stream.ts";
import type {
	DriverResult,
	DriverRunSpec,
	EventSink,
	LockHandle,
} from "../../lib/driver/types.ts";
import { useTempDir } from "../helpers/fs.ts";

type ChildProcess = import("node:child_process").ChildProcess;
type SpawnFn = typeof import("node:child_process").spawn;

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
type BridgeJsonlToActivityBusFn = () => {
	stop(): void;
	finish(): Promise<void>;
};
type RecordDriveTerminalEpisodeFn = (
	spec: DriverRunSpec,
	result: DriverResult,
) => Promise<void>;
type StampDriveEpisodeResultFn = (
	spec: DriverRunSpec,
	result: DriverResult,
) => DriverResult;

const mocks = vi.hoisted(() => ({
	acquirePlanLock: vi.fn<AcquirePlanLockFn>(),
	bridgeJsonlToActivityBus: vi.fn<BridgeJsonlToActivityBusFn>(),
	createEventSink: vi.fn<CreateEventSinkFn>(),
	createDriveEpisodeWarningReporter: vi.fn(),
	driveGraphActivityEventSinkOptions:
		vi.fn<DriveGraphActivityEventSinkOptionsFn>(),
	eventSink: vi.fn<EventSink>(),
	isProcessAlive: vi.fn<(pid: number) => boolean>(),
	recordDriveTerminalEpisode: vi.fn<RecordDriveTerminalEpisodeFn>(),
	renderPromptForTask: vi.fn<() => Promise<void>>(),
	runDriveOnGraph: vi.fn<RunDriveOnGraphFn>(),
	spawn: vi.fn<SpawnFn>(),
	stampDriveEpisodeResult: vi.fn<StampDriveEpisodeResultFn>(),
}));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawn: mocks.spawn };
});

vi.mock("../../lib/driver/lock.ts", () => ({
	acquirePlanLock: mocks.acquirePlanLock,
	isProcessAlive: mocks.isProcessAlive,
}));

vi.mock("../../lib/driver/event-stream.ts", () => ({
	bridgeJsonlToActivityBus: mocks.bridgeJsonlToActivityBus,
	createEventSink: mocks.createEventSink,
	driveEventBridgeOptions: () => ({ bridgeDriverDiagnostics: false }),
	driveGraphActivityEventSinkOptions: mocks.driveGraphActivityEventSinkOptions,
}));

vi.mock("../../lib/driver/drive-graph-runner.ts", () => ({
	createDriveEpisodeWarningReporter: mocks.createDriveEpisodeWarningReporter,
	recordDriveTerminalEpisode: mocks.recordDriveTerminalEpisode,
	runDriveOnGraph: mocks.runDriveOnGraph,
	stampDriveEpisodeResult: mocks.stampDriveEpisodeResult,
}));

vi.mock("../../lib/driver/prompt-template.ts", () => ({
	renderPromptForTask: mocks.renderPromptForTask,
}));

const temp = useTempDir("driver-test-");

describe("driver", () => {
	beforeEach(() => {
		mocks.acquirePlanLock.mockReset();
		mocks.bridgeJsonlToActivityBus.mockReset();
		mocks.createEventSink.mockReset();
		mocks.createDriveEpisodeWarningReporter.mockReset();
		mocks.driveGraphActivityEventSinkOptions.mockReset();
		mocks.eventSink.mockReset();
		mocks.isProcessAlive.mockReset();
		mocks.recordDriveTerminalEpisode.mockReset();
		mocks.renderPromptForTask.mockReset();
		mocks.runDriveOnGraph.mockReset();
		mocks.spawn.mockReset();
		mocks.stampDriveEpisodeResult.mockReset();
		mocks.bridgeJsonlToActivityBus.mockReturnValue({
			stop: vi.fn(),
			finish: vi.fn().mockResolvedValue(undefined),
		});
		mocks.createEventSink.mockReturnValue(mocks.eventSink);
		mocks.createDriveEpisodeWarningReporter.mockReturnValue(vi.fn());
		mocks.driveGraphActivityEventSinkOptions.mockReturnValue({
			rootDir: "/project/missions/sessions",
			scope: "driver-primitives",
			runId: "run-257",
		});
		mocks.isProcessAlive.mockReturnValue(true);
		mocks.recordDriveTerminalEpisode.mockResolvedValue(undefined);
		mocks.renderPromptForTask.mockResolvedValue(undefined);
		mocks.stampDriveEpisodeResult.mockImplementation((_spec, result) => result);
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
			bridgeDriverDiagnostics: false,
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

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-008
	test("terminates a detached child published during the pre-spawn abort window", async () => {
		const fixture = await createDetachedFixture("run-pre-spawn-abort");
		const spawned = deferred<void>();
		const terminationSent = deferred<void>();
		const mockChild = createMockChild(41008);
		let handle: ReturnType<typeof startDetached>;
		let abortPromise: Promise<void> | undefined;
		const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
			expect(pid).toBe(mockChild.child.pid);
			expect(signal).toBe("SIGTERM");
			terminationSent.resolve();
			return true;
		});
		mocks.spawn.mockImplementation(() => {
			abortPromise = handle.abort();
			spawned.resolve();
			return mockChild.child;
		});

		try {
			handle = startDetached(fixture.spec, fixture.deps);
			void handle.result.catch(() => undefined);
			await spawned.promise;
			await terminationSent.promise;

			let abortSettled = false;
			const abort = requirePromise(abortPromise).then(() => {
				abortSettled = true;
			});
			await flushMicrotasks();
			expect(abortSettled).toBe(false);
			expect(kill).toHaveBeenCalledTimes(1);
			expect(mocks.bridgeJsonlToActivityBus).not.toHaveBeenCalled();

			mockChild.exit();
			await abort;
			await expect(handle.result).rejects.toThrow(
				"Detached driver start aborted",
			);
			expect(mockChild.child.listenerCount("exit")).toBe(0);
			expect(mockChild.child.listenerCount("error")).toBe(0);
			await expect(
				stat(join(fixture.spec.workdir, "run.pid")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			kill.mockRestore();
		}
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-028
	test("stops a bridge published during the abort window", async () => {
		const fixture = await createDetachedFixture("run-bridge-publication-abort");
		const mockChild = createMockChild(41028, true);
		const bridge = {
			watcherActive: true,
			timerActive: true,
			stop: vi.fn(() => {
				bridge.watcherActive = false;
				bridge.timerActive = false;
			}),
			finish: vi.fn().mockResolvedValue(undefined),
		};
		let handle: ReturnType<typeof startDetached>;
		let abortPromise: Promise<void> | undefined;
		mocks.isProcessAlive.mockReturnValue(false);
		mocks.spawn.mockReturnValue(mockChild.child);
		mocks.bridgeJsonlToActivityBus.mockImplementation(() => {
			abortPromise = handle.abort();
			return bridge;
		});

		handle = startDetached(fixture.spec, fixture.deps);
		await expect(handle.result).rejects.toThrow(
			"Detached driver start aborted",
		);
		await requirePromise(abortPromise);

		expect(bridge.stop).toHaveBeenCalledTimes(1);
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		expect(bridge.watcherActive).toBe(false);
		expect(bridge.timerActive).toBe(false);
		await expect(
			stat(join(fixture.spec.workdir, "run.pid")),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(mockChild.child.listenerCount("exit")).toBe(0);
		expect(mockChild.child.listenerCount("error")).toBe(0);
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

async function createDetachedFixture(runId: string): Promise<{
	spec: DriverRunSpec;
	deps: DriverDeps;
}> {
	const projectRoot = join(temp.path, runId, "project");
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		"driver-primitives",
		"runs",
		runId,
	);
	const cosmonautsRoot = join(temp.path, runId, "cosmonauts");
	await mkdir(join(cosmonautsRoot, "bin"), { recursive: true });
	await writeFile(
		join(cosmonautsRoot, "bin", "cosmonauts-drive-step"),
		"prebuilt runner",
		"utf-8",
	);
	return {
		spec: createSpec({
			runId,
			parentSessionId: `parent-${runId}`,
			projectRoot,
			backendName: "codex",
			promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
		}),
		deps: { ...createDeps(), cosmonautsRoot },
	};
}

function createMockChild(
	pid: number,
	exited = false,
): {
	child: ChildProcess;
	exit(): void;
} {
	const emitter = new EventEmitter();
	Object.assign(emitter, {
		pid,
		exitCode: exited ? 0 : null,
		signalCode: null,
		unref: vi.fn(),
	});
	const child = emitter as ChildProcess;
	return {
		child,
		exit() {
			Object.assign(child, { exitCode: 0 });
			emitter.emit("exit", 0, null);
		},
	};
}

function requirePromise<T>(promise: Promise<T> | undefined): Promise<T> {
	if (!promise) throw new Error("Expected the race seam to publish a promise");
	return promise;
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
