import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import type { Backend } from "../../../lib/driver/backends/types.ts";
import { compileDriveRunToGraph } from "../../../lib/driver/drive-graph-compiler.ts";
import type { DriverEvent, DriverRunSpec } from "../../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepRecord,
	type StepResult,
} from "../../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const backendMocks = vi.hoisted(() => ({
	backendRun: vi.fn(),
	resolveConfiguredExternalBackend: vi.fn(
		(name: string): Backend => ({
			name,
			capabilities: { canCommit: false, isolatedFromHostSource: true },
			run: backendMocks.backendRun,
		}),
	),
}));

vi.mock("../../../lib/driver/backend-resolution.ts", () => ({
	resolveConfiguredExternalBackend:
		backendMocks.resolveConfiguredExternalBackend,
}));

const execFileAsync = promisify(execFile);
const temp = useTempDir("drive-graph-resume-");
const PLAN_SLUG = "durable-frontend-migration";
const RUN_ID = "run-previous";
type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface JsonOutput {
	stdoutJson(): Record<string, unknown>;
	stdoutJsonLines(): Record<string, unknown>[];
}

describe("cosmonauts run drive compat graph resume", () => {
	let originalCwd: string;
	let output: ReturnType<typeof captureCliOutput> & JsonOutput;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
		backendMocks.backendRun.mockClear();
		backendMocks.resolveConfiguredExternalBackend.mockClear();
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-020
	test("resumes graph runs without rewriting original selected task ids", async () => {
		const fixture = await setupCompletedTaskWithPendingStateCommit();

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const emittedResults = output.stdoutJsonLines();
		const result = output.stdoutJson();
		const completion = await readJson(
			join(fixture.spec.workdir, "run.completion.json"),
		);
		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		const runRecord = (await readJson(
			join(fixture.spec.workdir, "run.json"),
		)) as { metadata?: { driveTaskIds?: unknown } };
		const taskAttempts = await fixture.store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			stepId: fixture.taskId,
		});
		const taskStatusAttempts = await fixture.store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			stepId: `finalizer-task-status-${fixture.taskId}`,
		});
		const stateCommitAttempts = await fixture.store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			stepId: "finalizer-state-commit",
		});
		const graph = (await readJson(
			join(fixture.spec.workdir, "graph.json"),
		)) as {
			steps: Array<{
				id: string;
				dependsOn: string[];
				inputArtifacts: unknown[];
			}>;
		};

		expect(result).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			stateCommitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(emittedResults).toHaveLength(1);
		expect(completion).toEqual(withoutScope(onlyJsonRecord(emittedResults)));
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
		expect(persistedSpec.taskIds).toEqual([fixture.taskId]);
		expect(persistedSpec.remainingTaskIds).toEqual([]);
		expect(runRecord.metadata?.driveTaskIds).toEqual([fixture.taskId]);
		expect(
			await readFile(join(fixture.spec.workdir, "task-queue.txt"), "utf-8"),
		).toBe("\n");
		expect(
			graph.steps.find((step) => step.id === "finalizer-state-commit"),
		).toMatchObject({
			dependsOn: [`finalizer-task-status-${fixture.taskId}`],
		});
		expect(taskAttempts).toHaveLength(1);
		expect(taskStatusAttempts).toHaveLength(1);
		expect(stateCommitAttempts).toHaveLength(2);
		expect(
			(
				await fixture.store.readStepRecord({
					scope: PLAN_SLUG,
					runId: RUN_ID,
					stepId: "finalizer-state-commit",
				})
			)?.status,
		).toBe("completed");
	});

	test("resumes pending task-status finalization with one terminal result", async () => {
		const fixture = await setupCompletedTaskWithPendingTaskStatus();

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const emittedResults = output.stdoutJsonLines();
		const completion = await readJson(
			join(fixture.spec.workdir, "run.completion.json"),
		);

		expect(emittedResults).toHaveLength(1);
		expect(emittedResults[0]).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		expect(completion).toEqual(withoutScope(onlyJsonRecord(emittedResults)));
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
		expect(
			(
				await fixture.store.readStepRecord({
					scope: PLAN_SLUG,
					runId: RUN_ID,
					stepId: `finalizer-task-status-${fixture.taskId}`,
				})
			)?.status,
		).toBe("completed");
	});

	test("resumes already completed graph runs with one terminal result", async () => {
		const fixture = await setupFullyCompletedGraphRun();

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const emittedResults = output.stdoutJsonLines();
		const completion = await readJson(
			join(fixture.spec.workdir, "run.completion.json"),
		);

		expect(emittedResults).toHaveLength(1);
		expect(emittedResults[0]).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			stateCommitSha: "b".repeat(40),
		});
		expect(completion).toEqual(withoutScope(onlyJsonRecord(emittedResults)));
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});
});

function onlyJsonRecord(
	records: readonly Record<string, unknown>[],
): Record<string, unknown> {
	const record = records[0];
	if (!record) {
		throw new Error("Expected one JSON record");
	}
	return record;
}

function withoutScope(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const { scope: _scope, ...rest } = record;
	return rest;
}

async function setupCompletedTaskWithPendingStateCommit(): Promise<{
	taskId: string;
	spec: DriverRunSpec;
	store: FileRunStore;
}> {
	const projectRoot = process.cwd();
	await mkdir(projectRoot, { recursive: true });
	await initGit(projectRoot);
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: "Graph resume task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	await git(["add", "envelope.md", "missions/tasks"]);
	await git(["commit", "-m", "add drive task"]);
	await taskManager.updateTask(task.id, { status: "Done" });

	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		RUN_ID,
	);
	const spec: DriverRunSpec = {
		runId: RUN_ID,
		parentSessionId: "previous-parent",
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "final-state-commit",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });
	const store = new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	await compileDriveRunToGraph({ spec, store });
	await completeStep(store, task.id, successfulResult(task.id, "attempt-001"));
	await completeStep(
		store,
		`finalizer-task-status-${task.id}`,
		successfulResult(`finalizer-task-status-${task.id}`, "attempt-001"),
	);
	await seedRetryableStateCommitFailure(store);
	await writeFile(
		join(workdir, "spec.json"),
		`${JSON.stringify({ ...spec, taskIds: [], remainingTaskIds: [] }, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(
		join(workdir, "events.jsonl"),
		`${JSON.stringify(event({ type: "task_done", taskId: task.id }))}\n`,
		"utf-8",
	);
	await writeFile(
		join(workdir, "pending-finalization.json"),
		`${JSON.stringify(
			{
				runId: RUN_ID,
				planSlug: PLAN_SLUG,
				createdAt: "2026-06-04T00:00:00.000Z",
				commitPolicy: "no-commit",
				stateCommitPolicy: "final-state-commit",
				reason: "state commit failed: previous hook rejection",
				phase: "state_commit",
				taskIds: [task.id],
				headBeforeFinalization: await gitStdout(["rev-parse", "HEAD"]),
			},
			null,
		)}\n`,
		"utf-8",
	);
	return { taskId: task.id, spec, store };
}

async function setupCompletedTaskWithPendingTaskStatus(): Promise<{
	taskId: string;
	spec: DriverRunSpec;
	store: FileRunStore;
}> {
	const projectRoot = process.cwd();
	await mkdir(projectRoot, { recursive: true });
	await initGit(projectRoot);
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: "Graph resume task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	await git(["add", "envelope.md", "missions/tasks"]);
	await git(["commit", "-m", "add drive task"]);

	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		RUN_ID,
	);
	const spec: DriverRunSpec = {
		runId: RUN_ID,
		parentSessionId: "previous-parent",
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "driver-commits",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });
	const store = new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	await compileDriveRunToGraph({ spec, store });
	await completeStep(store, task.id, successfulResult(task.id, "attempt-001"));
	await completeStep(store, `finalizer-source-commit-${task.id}`, {
		...successfulResult(`finalizer-source-commit-${task.id}`, "attempt-001"),
		commits: [{ sha: "a".repeat(40), subject: `${task.id}: source` }],
	});
	await seedRetryableTaskStatusFailure(store, task.id, "a".repeat(40));
	await writeFile(
		join(workdir, "spec.json"),
		`${JSON.stringify({ ...spec, taskIds: [], remainingTaskIds: [] }, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(join(workdir, "events.jsonl"), "", "utf-8");
	await writeFile(
		join(workdir, "pending-finalization.json"),
		`${JSON.stringify(
			{
				runId: RUN_ID,
				planSlug: PLAN_SLUG,
				createdAt: "2026-06-04T00:00:00.000Z",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "none",
				reason: "status update failed after commit: previous task write error",
				phase: "task_status",
				taskId: task.id,
				commitSha: "a".repeat(40),
			},
			null,
		)}\n`,
		"utf-8",
	);
	return { taskId: task.id, spec, store };
}

async function setupFullyCompletedGraphRun(): Promise<{
	taskId: string;
	spec: DriverRunSpec;
	store: FileRunStore;
}> {
	const fixture = await setupGraphRunWithCompletedTaskStatus();
	await completeStep(fixture.store, "finalizer-state-commit", {
		...successfulResult("finalizer-state-commit", "attempt-001"),
		commits: [{ sha: "b".repeat(40) }],
	});
	await writeFile(
		join(fixture.spec.workdir, "spec.json"),
		`${JSON.stringify(
			{ ...fixture.spec, taskIds: [], remainingTaskIds: [] },
			null,
			2,
		)}\n`,
		"utf-8",
	);
	await writeFile(
		join(fixture.spec.workdir, "events.jsonl"),
		`${JSON.stringify(event({ type: "task_done", taskId: fixture.taskId }))}\n`,
		"utf-8",
	);
	return fixture;
}

async function setupGraphRunWithCompletedTaskStatus(): Promise<{
	taskId: string;
	spec: DriverRunSpec;
	store: FileRunStore;
}> {
	const projectRoot = process.cwd();
	await mkdir(projectRoot, { recursive: true });
	await initGit(projectRoot);
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: "Graph resume task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	await git(["add", "envelope.md", "missions/tasks"]);
	await git(["commit", "-m", "add drive task"]);
	await taskManager.updateTask(task.id, { status: "Done" });

	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		RUN_ID,
	);
	const spec: DriverRunSpec = {
		runId: RUN_ID,
		parentSessionId: "previous-parent",
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "final-state-commit",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });
	const store = new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	await compileDriveRunToGraph({ spec, store });
	await completeStep(store, task.id, successfulResult(task.id, "attempt-001"));
	await completeStep(
		store,
		`finalizer-task-status-${task.id}`,
		successfulResult(`finalizer-task-status-${task.id}`, "attempt-001"),
	);
	return { taskId: task.id, spec, store };
}

async function completeStep(
	store: FileRunStore,
	stepId: string,
	result: StepResult,
): Promise<void> {
	const step = await requireStep(store, stepId);
	await store.writeStepAttemptRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID, stepId },
		{
			attemptId: "attempt-001",
			startedAt: "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:00:01.000Z",
			result,
		},
	);
	await store.writeStepRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID },
		{
			...step,
			status: "completed",
			latestAttemptId: "attempt-001",
			result,
			outputArtifacts: result.artifacts,
		},
	);
}

async function seedRetryableStateCommitFailure(
	store: FileRunStore,
): Promise<void> {
	const step = await requireStep(store, "finalizer-state-commit");
	const result: StepResult = {
		outcome: "failed",
		summary: "state commit failed: previous hook rejection",
		artifacts: [
			{
				id: "pending-finalization",
				path: "pending-finalization.json",
				kind: "pending-finalization",
			},
		],
		nextAction: "retry",
	};
	await store.writeStepAttemptRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID, stepId: step.id },
		{
			attemptId: "attempt-001",
			startedAt: "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:00:01.000Z",
			result,
		},
	);
	await store.writeStepRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID },
		{
			...step,
			status: "failed",
			latestAttemptId: "attempt-001",
			result,
			outputArtifacts: result.artifacts,
		},
	);
}

async function seedRetryableTaskStatusFailure(
	store: FileRunStore,
	taskId: string,
	commitSha: string,
): Promise<void> {
	const step = await requireStep(store, `finalizer-task-status-${taskId}`);
	const result: StepResult = {
		outcome: "failed",
		summary: "status update failed after commit: previous task write error",
		artifacts: [
			{
				id: "pending-finalization",
				path: "pending-finalization.json",
				kind: "pending-finalization",
			},
		],
		commits: [{ sha: commitSha, subject: `${taskId}: source` }],
		nextAction: "retry",
	};
	await store.writeStepAttemptRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID, stepId: step.id },
		{
			attemptId: "attempt-001",
			startedAt: "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:00:01.000Z",
			result,
		},
	);
	await store.writeStepRecord(
		{ scope: PLAN_SLUG, runId: RUN_ID },
		{
			...step,
			status: "failed",
			latestAttemptId: "attempt-001",
			result,
			outputArtifacts: result.artifacts,
		},
	);
}

function successfulResult(stepId: string, attemptId: string): StepResult {
	return {
		outcome: "success",
		summary: `${stepId} complete`,
		artifacts: [
			{ id: `artifact:${stepId}`, path: `steps/${stepId}/${attemptId}.json` },
		],
		verification: [],
		nextAction: "continue",
	};
}

async function requireStep(
	store: FileRunStore,
	stepId: string,
): Promise<StepRecord> {
	const step = await store.readStepRecord({
		scope: PLAN_SLUG,
		runId: RUN_ID,
		stepId,
	});
	if (!step) {
		throw new Error(`Missing step ${stepId}`);
	}
	return step;
}

function event(input: DriverEventInput): DriverEvent {
	return {
		...input,
		runId: RUN_ID,
		parentSessionId: "previous-parent",
		timestamp: "2026-06-04T00:00:00.000Z",
	} as DriverEvent;
}

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveCompatProgram();
	program.exitOverride();
	await program.parseAsync(args, { from: "user" });
}

async function initGit(cwd: string): Promise<void> {
	await git(["init", "-b", "main"], cwd);
	await git(["config", "user.email", "driver@example.com"], cwd);
	await git(["config", "user.name", "Driver Test"], cwd);
	await writeFile(join(cwd, "README.md"), "initial\n", "utf-8");
	await git(["add", "README.md"], cwd);
	await git(["commit", "-m", "initial"], cwd);
}

async function git(args: string[], cwd = process.cwd()): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

async function gitStdout(args: string[]): Promise<string> {
	return (await git(args)).trim();
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf-8")) as unknown;
}

function attachJsonHelpers(
	capture: ReturnType<typeof captureCliOutput>,
): ReturnType<typeof captureCliOutput> & JsonOutput {
	return Object.assign(capture, {
		stdoutJsonLines() {
			return capture
				.stdout()
				.trim()
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.map((line) => JSON.parse(line) as Record<string, unknown>);
		},
		stdoutJson() {
			return this.stdoutJsonLines().at(-1) ?? {};
		},
	});
}
