import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BackendRunResult } from "../../lib/driver/backends/types.ts";
import { EventLogWriteError } from "../../lib/driver/event-stream.ts";
import { getRepoCommitLockPath } from "../../lib/driver/lock.ts";
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
const execFileAsync = promisify(execFile);

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
			"finalize",
			"run_completed",
		]);
		expect(events[1]).toMatchObject({
			type: "finalize",
			phase: "state_commit",
			status: "skipped",
			details: { reason: "policy_none" },
		});
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
			"finalize",
			"run_completed",
		]);
		expect(events[1]).toMatchObject({
			type: "finalize",
			phase: "state_commit",
			status: "skipped",
			details: { reason: "not_all_tasks_done" },
		});
		expect(events[2]).toMatchObject({
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

	// @cosmo-behavior plan:drive-resilience-state-model#B-004
	test("reports finalization_failed outcome with exact finalization details", async () => {
		const events: DriverEvent[] = [];
		const spec = createSpec({ taskIds: ["TASK-1", "TASK-2"] });
		const ctx = createCtx(events);
		const pendingFinalizationPath = join(
			spec.workdir,
			"pending-finalization.json",
		);
		mocks.runOneTask.mockResolvedValueOnce({
			status: "finalization_failed",
			finalizationPhase: "task_status",
			finalizationReason: "status update failed after commit: disk full",
			finalizationTaskId: "TASK-1",
			finalizationCommitSha: "abc123",
			pendingFinalizationPath,
		});

		const result = await runRunLoop(spec, ctx);

		expect(mocks.runOneTask).toHaveBeenCalledTimes(1);
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"run_finalization_failed",
		]);
		expect(events[1]).toMatchObject({
			type: "run_finalization_failed",
			phase: "task_status",
			reason: "status update failed after commit: disk full",
			taskId: "TASK-1",
			commitSha: "abc123",
		});
		expect(result).toEqual({
			runId: spec.runId,
			outcome: "finalization_failed",
			tasksDone: 0,
			tasksBlocked: 0,
			finalizationPhase: "task_status",
			finalizationReason: "status update failed after commit: disk full",
			finalizationTaskId: "TASK-1",
			finalizationCommitSha: "abc123",
			pendingFinalizationPath,
		});
		expect(result).not.toHaveProperty("blockedTaskId");
		expect(result).not.toHaveProperty("blockedReason");
		expect(
			JSON.parse(
				await readFile(join(spec.workdir, "run.completion.json"), "utf-8"),
			),
		).toEqual(result);
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-014
	test("creates a final state commit only for run task status updates when state policy is final-state-commit", async () => {
		const projectRoot = temp.path;
		await initGit(projectRoot);
		await mkdir(join(projectRoot, "missions", "tasks"), { recursive: true });
		await mkdir(join(projectRoot, "missions", "sessions", "plan", "runs"), {
			recursive: true,
		});
		await mkdir(join(projectRoot, "missions", "archive", "tasks"), {
			recursive: true,
		});
		await mkdir(join(projectRoot, "missions", "reviews"), { recursive: true });
		await mkdir(join(projectRoot, "memory"), { recursive: true });
		await writeFile(
			join(projectRoot, "missions", "tasks", "TASK-1 - One.md"),
			"---\nstatus: Done\n---\n# One\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "missions", "tasks", "TASK-2 - Two.md"),
			"---\nstatus: Done\n---\n# Two\n",
			"utf-8",
		);
		await writeFile(join(projectRoot, "src.ts"), "source dirty\n", "utf-8");
		await writeFile(
			join(projectRoot, "missions", "sessions", "transcript.jsonl"),
			"dirty\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "missions", "archive", "tasks", "TASK-OLD.md"),
			"dirty\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "missions", "reviews", "review.md"),
			"dirty\n",
			"utf-8",
		);
		await writeFile(join(projectRoot, "memory", "note.md"), "dirty\n", "utf-8");
		await installStateCommitLockHook(projectRoot);
		const events: DriverEvent[] = [];
		const spec = createSpec({
			projectRoot,
			workdir: join(
				projectRoot,
				"missions",
				"sessions",
				"plan",
				"runs",
				"run-1",
			),
			eventLogPath: join(
				projectRoot,
				"missions",
				"sessions",
				"plan",
				"runs",
				"run-1",
				"events.jsonl",
			),
			planSlug: "plan",
			taskIds: ["TASK-1", "TASK-2"],
			commitPolicy: "driver-commits",
			stateCommitPolicy: "final-state-commit",
		});
		mocks.runOneTask.mockResolvedValue({ status: "done" });

		const result = await runRunLoop(spec, createCtx(events));

		expect(result).toMatchObject({
			outcome: "completed",
			tasksDone: 2,
			tasksBlocked: 0,
			stateCommitSha: expect.any(String),
		});
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "finalize",
					phase: "state_commit",
					status: "started",
				}),
				expect.objectContaining({
					type: "finalize",
					phase: "state_commit",
					status: "passed",
				}),
			]),
		);
		expect(
			await git(projectRoot, ["show", "--name-only", "--format=", "HEAD"]),
		).toEqual(
			"missions/tasks/TASK-1 - One.md\nmissions/tasks/TASK-2 - Two.md\n",
		);
		expect(
			await git(projectRoot, ["status", "--porcelain", "--", "missions/tasks"]),
		).toBe("");
		expect(
			await git(projectRoot, [
				"status",
				"--porcelain",
				"--",
				"src.ts",
				"missions/sessions",
				"missions/archive",
				"missions/reviews",
				"memory",
			]),
		).toContain("src.ts");
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-015
	test("records retryable state commit finalization failure", async () => {
		const projectRoot = temp.path;
		await initGit(projectRoot);
		await mkdir(join(projectRoot, "missions", "tasks"), { recursive: true });
		await writeFile(
			join(projectRoot, "missions", "tasks", "TASK-1 - One.md"),
			"---\nstatus: Done\n---\n# One\n",
			"utf-8",
		);
		await installFailingCommitHook(projectRoot);
		const events: DriverEvent[] = [];
		const spec = createSpec({
			projectRoot,
			workdir: projectRoot,
			taskIds: ["TASK-1"],
			commitPolicy: "driver-commits",
			stateCommitPolicy: "final-state-commit",
		});
		mocks.runOneTask.mockResolvedValue({ status: "done" });

		const result = await runRunLoop(spec, createCtx(events));

		expect(result).toMatchObject({
			outcome: "finalization_failed",
			finalizationPhase: "state_commit",
			finalizationReason: expect.stringContaining("state commit failed"),
			pendingFinalizationPath: join(projectRoot, "pending-finalization.json"),
		});
		expect(events.at(-1)).toMatchObject({
			type: "run_finalization_failed",
			phase: "state_commit",
		});
		const pending = JSON.parse(
			await readFile(join(projectRoot, "pending-finalization.json"), "utf-8"),
		);
		expect(pending).toMatchObject({
			phase: "state_commit",
			taskIds: ["TASK-1"],
			reason: expect.stringContaining("state commit failed"),
			headBeforeFinalization: expect.any(String),
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

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installStateCommitLockHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	const lockPath = getRepoCommitLockPath(projectRoot);
	await writeFile(
		hookPath,
		`#!/bin/sh
if ! test -f ${shellQuote(lockPath)}; then
	printf 'missing project commit lock\n' >&2
	exit 1
fi
if git diff --cached --name-only | grep -Ev '^missions/tasks/TASK-[12] - (One|Two)\\.md$'; then
	printf 'unexpected staged path\n' >&2
	exit 1
fi
`,
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(
		hookPath,
		"#!/bin/sh\nprintf 'state commit rejected by test hook\\n' >&2\nexit 1\n",
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
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
