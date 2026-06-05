import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { readRetryableDriveFinalizerFailure } from "../../lib/driver/drive-finalization.ts";
import { compileDriveRunToGraph } from "../../lib/driver/drive-graph-compiler.ts";
import { createDriveShellCommandBackend } from "../../lib/driver/shell-command-finalizer.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import {
	type BackendContext,
	FileRunStore,
	type RunRecord,
	runDurableGraphScheduler,
	type SchedulerStepInput,
	type StepRecord,
	type StepResult,
} from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("shell-command-finalizer-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "shell-finalizer-parent";
const TASK_ID = "TASK-1";

describe("Drive shell-command finalizer", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-014
	test("commits source changes and marks task status through shell finalizer steps", async () => {
		const fixture = await setupFixture("success");
		await writeProjectFile(fixture.projectRoot, "src/changed.txt", "commit\n");
		await writeProjectFile(
			fixture.projectRoot,
			"missions/ignored.txt",
			"ignore\n",
		);
		await writeProjectFile(
			fixture.projectRoot,
			"memory/ignored.txt",
			"ignore\n",
		);
		await writeProjectFile(
			fixture.projectRoot,
			".cosmonauts/run.lock",
			"ignore\n",
		);
		const { store, run, taskStep, sourceCommit, taskStatus } =
			await seedFinalizerGraph(fixture, {
				summary: "shell finalizer success",
			});
		const backend = createDriveShellCommandBackend({
			spec: fixture.spec,
			taskManager: fixture.taskManager,
			eventSink: fixture.recordEvent,
		});

		const commitResult = await runFinalizerStep({
			backend,
			run,
			step: sourceCommit,
		});
		await store.writeStepRecord(
			{ scope: PLAN_SLUG, runId: fixture.spec.runId },
			{
				...sourceCommit,
				status: "completed",
				result: commitResult,
				outputArtifacts: commitResult.artifacts,
			},
		);
		const statusResult = await runFinalizerStep({
			backend,
			run,
			step: taskStatus,
		});

		expect(commitResult).toMatchObject({
			outcome: "success",
			nextAction: "continue",
			commits: [
				{
					sha: expect.stringMatching(/^[0-9a-f]{40}$/),
					subject: `${TASK_ID}: shell finalizer success`,
				},
			],
		});
		expect(commitResult.artifacts).toContainEqual(
			expect.objectContaining({
				id: expect.stringMatching(/^commit:/),
				kind: "commit",
				metadata: expect.objectContaining({
					subject: `${TASK_ID}: shell finalizer success`,
				}),
			}),
		);
		expect(statusResult).toMatchObject({
			outcome: "success",
			nextAction: "continue",
			commits: [{ sha: commitResult.commits?.[0]?.sha }],
		});
		expect((await fixture.taskManager.getTask(TASK_ID))?.status).toBe("Done");
		expect(fixture.events.map((event) => event.type)).toEqual([
			"finalize",
			"commit_made",
			"finalize",
			"finalize",
			"finalize",
			"task_done",
		]);
		expect(fixture.events).toContainEqual(
			expect.objectContaining({
				type: "commit_made",
				taskId: TASK_ID,
				subject: `${TASK_ID}: shell finalizer success`,
			}),
		);
		expect(fixture.events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "task_status",
				status: "passed",
			}),
		);
		expect(taskStep.result?.summary).toBe("shell finalizer success");

		const committedFiles = await git(fixture.projectRoot, [
			"show",
			"--name-only",
			"--format=",
			"HEAD",
		]);
		expect(committedFiles.trim().split("\n")).toEqual(["src/changed.txt"]);
		const ignoredStatus = await git(fixture.projectRoot, [
			"status",
			"--porcelain",
			"--",
			"missions",
			"memory",
			".cosmonauts",
		]);
		expect(ignoredStatus).toContain("missions/");
		expect(ignoredStatus).toContain("memory/");
		expect(ignoredStatus).toContain(".cosmonauts/");
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-015
	test("records retryable finalizer failures from persisted attempt evidence as finalization_failed", async () => {
		const fixture = await setupFixture("retryable-failure");
		await installFailingCommitHook(fixture.projectRoot);
		await writeProjectFile(fixture.projectRoot, "src/fails.txt", "commit\n");
		const { store, sourceCommit } = await seedFinalizerGraph(fixture, {
			summary: "retryable shell finalizer failure",
		});
		const backend = createDriveShellCommandBackend({
			spec: fixture.spec,
			taskManager: fixture.taskManager,
			eventSink: fixture.recordEvent,
		});

		await runDurableGraphScheduler({
			store,
			ref: { scope: PLAN_SLUG, runId: fixture.spec.runId },
			backends: new Map([["shell-command", backend]]),
			holderId: "shell-finalizer-test",
			now: () => "2026-06-04T00:00:00.000Z",
		});

		const persistedFinalizer = await requireStep(
			store,
			fixture.spec.runId,
			sourceCommit.id,
		);
		const attempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: fixture.spec.runId,
			stepId: sourceCommit.id,
		});
		const pending = JSON.parse(
			await readFile(
				join(fixture.spec.workdir, "pending-finalization.json"),
				"utf-8",
			),
		) as Record<string, unknown>;
		const reloadedStore = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const mapped = await readRetryableDriveFinalizerFailure({
			store: reloadedStore,
			ref: { scope: PLAN_SLUG, runId: fixture.spec.runId },
			workdir: fixture.spec.workdir,
		});

		expect(pending).toMatchObject({
			phase: "commit",
			taskId: TASK_ID,
			reason: expect.stringContaining("commit failed"),
			commitSubject: `${TASK_ID}: retryable shell finalizer failure`,
			headBeforeFinalization: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(persistedFinalizer).toMatchObject({
			status: "ready",
			result: {
				outcome: "failed",
				nextAction: "retry",
				artifacts: [
					{
						id: "pending-finalization",
						path: "pending-finalization.json",
						kind: "pending-finalization",
					},
				],
			},
		});
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.result).toMatchObject({
			outcome: "failed",
			nextAction: "retry",
		});
		expect(mapped).toMatchObject({
			outcome: "finalization_failed",
			finalizationPhase: "commit",
			finalizationReason: expect.stringContaining("commit failed"),
			finalizationTaskId: TASK_ID,
			pendingFinalizationPath: join(
				fixture.spec.workdir,
				"pending-finalization.json",
			),
			stepId: sourceCommit.id,
			attemptId: "attempt-001",
		});
		expect(fixture.events).toContainEqual(
			expect.objectContaining({
				type: "task_finalization_failed",
				phase: "commit",
				retryable: true,
			}),
		);
	});
});

interface Fixture {
	projectRoot: string;
	sessionsRoot: string;
	spec: DriverRunSpec;
	taskManager: TaskManager;
	events: DriverEvent[];
	recordEvent: (event: DriverEvent) => Promise<void>;
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(projectRoot, { recursive: true });
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	await initGit(projectRoot);
	await git(projectRoot, ["add", "envelope.md"]);
	await git(projectRoot, ["commit", "-m", "add envelope"]);
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	await taskManager.createTask({ title: "Shell Finalizer Fixture" });
	const events: DriverEvent[] = [];
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [TASK_ID],
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "driver-commits",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	return {
		projectRoot,
		sessionsRoot,
		spec,
		taskManager,
		events,
		recordEvent: async (event) => {
			events.push(event);
		},
	};
}

async function seedFinalizerGraph(
	fixture: Fixture,
	options: { summary: string },
): Promise<{
	store: FileRunStore;
	run: RunRecord;
	taskStep: StepRecord;
	sourceCommit: StepRecord;
	taskStatus: StepRecord;
}> {
	const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
	const compiled = await compileDriveRunToGraph({ spec: fixture.spec, store });
	const taskStep = await store.writeStepRecord(
		{ scope: PLAN_SLUG, runId: fixture.spec.runId },
		{
			...(await requireStep(store, fixture.spec.runId, TASK_ID)),
			status: "completed",
			result: successfulTaskResult(options.summary),
			outputArtifacts: [{ id: "report", path: "steps/TASK-1/result.json" }],
		},
	);
	return {
		store,
		run: compiled.run,
		taskStep,
		sourceCommit: await requireStep(
			store,
			fixture.spec.runId,
			`finalizer-source-commit-${TASK_ID}`,
		),
		taskStatus: await requireStep(
			store,
			fixture.spec.runId,
			`finalizer-task-status-${TASK_ID}`,
		),
	};
}

async function runFinalizerStep(options: {
	backend: ReturnType<typeof createDriveShellCommandBackend>;
	run: RunRecord;
	step: StepRecord;
}): Promise<StepResult> {
	const input: SchedulerStepInput = {
		runId: options.step.runId,
		stepId: options.step.id,
		inputArtifacts: options.step.inputArtifacts,
		backendOptions: options.step.backend.options,
	};
	const prepared = await options.backend.prepare(
		options.step,
		createBackendContext(options.run, options.step, input),
	);
	const handle = await options.backend.start(prepared);
	return await handle.result;
}

function createBackendContext(
	run: RunRecord,
	step: StepRecord,
	input: SchedulerStepInput,
): BackendContext<SchedulerStepInput> {
	return {
		run,
		step,
		input,
		attemptId: "attempt-001",
		signal: new AbortController().signal,
		now: () => "2026-06-04T00:00:00.000Z",
	};
}

function successfulTaskResult(summary: string): StepResult {
	return {
		outcome: "success",
		summary,
		artifacts: [{ id: "report", path: "steps/TASK-1/result.json" }],
		files: [{ path: "src/changed.txt", status: "modified" }],
		verification: [],
		nextAction: "continue",
	};
}

async function requireStep(
	store: FileRunStore,
	runId: string,
	stepId: string,
): Promise<StepRecord> {
	const step = await store.readStepRecord({ scope: PLAN_SLUG, runId, stepId });
	if (!step) {
		throw new Error(`Missing step record: ${stepId}`);
	}
	return step;
}

async function writeProjectFile(
	projectRoot: string,
	relativePath: string,
	content: string,
): Promise<void> {
	const absolutePath = join(projectRoot, relativePath);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, content, "utf-8");
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(
		hookPath,
		"#!/bin/sh\nprintf 'commit rejected by shell finalizer test\\n' >&2\nexit 1\n",
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}
