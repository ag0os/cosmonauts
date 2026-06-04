import { execFile } from "node:child_process";
import {
	appendFile,
	chmod,
	mkdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runDriveOnGraph } from "../../lib/driver/drive-graph-runner.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	Report,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("drive-graph-finalization-result-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-graph-finalization-parent";

describe("Drive graph finalization results", () => {
	test("reports completed task-status count and emits one run_finalization_failed for state-commit failure", async () => {
		const fixture = await setupFixture("state-commit-fails", 2);
		await initGit(fixture.projectRoot);
		await installFailingCommitHook(fixture.projectRoot);

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, createBackend()),
		);
		const events = await readLegacyEvents(fixture.spec.eventLogPath);
		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const stateCommit = await requireStep(
			store,
			fixture.spec.runId,
			"finalizer-state-commit",
		);
		const attempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: fixture.spec.runId,
			stepId: "finalizer-state-commit",
		});
		const pending = JSON.parse(
			await readFile(
				join(fixture.spec.workdir, "pending-finalization.json"),
				"utf-8",
			),
		) as Record<string, unknown>;

		// F-003/F-002 regression: state-commit failure keeps prior task-status count
		// and has a single legacy terminal finalization-failed event.
		expect(result).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "finalization_failed",
			tasksDone: fixture.taskIds.length,
			tasksBlocked: 0,
			finalizationPhase: "state_commit",
			finalizationReason: expect.stringContaining("state commit failed"),
		});
		expect(
			events.filter((event) => event.type === "run_finalization_failed"),
		).toHaveLength(1);
		expect(pending).toMatchObject({
			phase: "state_commit",
			reason: expect.stringContaining("state commit failed"),
			taskIds: fixture.taskIds,
			headBeforeFinalization: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(stateCommit).toMatchObject({
			status: "ready",
			result: {
				outcome: "failed",
				nextAction: "retry",
			},
		});
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			attemptId: "attempt-001",
			result: {
				outcome: "failed",
				nextAction: "retry",
			},
		});
	});

	test("continues after a driver-committed partial task without marking it Done or all tasks passed", async () => {
		const fixture = await setupFixture("partial-continue", 2, {
			commitPolicy: "driver-commits",
		});
		const [partialTaskId, completedTaskId] = fixture.taskIds as [
			string,
			string,
		];
		await initGit(fixture.projectRoot);
		const backend = createBackend({
			onRun: async (invocation) => {
				if (invocation.taskId === partialTaskId) {
					await writeProjectFile(
						fixture.projectRoot,
						"src/partial.txt",
						"partial work\n",
					);
					return reportResult({
						outcome: "partial",
						files: [{ path: "src/partial.txt", change: "created" }],
						verification: [],
						notes: "phase 1/2",
						progress: { phase: 1, of: 2, remaining: "phase 2" },
					});
				}
				return reportResult({
					outcome: "success",
					files: [],
					verification: [],
					notes: "second task complete",
				});
			},
		});

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, backend),
		);
		const events = await readLegacyEvents(fixture.spec.eventLogPath);
		const firstTask = await fixture.taskManager.getTask(partialTaskId);
		const secondTask = await fixture.taskManager.getTask(completedTaskId);
		const log = await git(fixture.projectRoot, ["log", "--oneline"]);

		// F-001 regression: a partial-continue drive task advances scheduling but
		// task-status finalization remains semantically partial.
		expect(backend.startedTaskIds).toEqual(fixture.taskIds);
		expect(result).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 1,
			blockedTaskId: partialTaskId,
		});
		expect(firstTask?.status).toBe("In Progress");
		expect(firstTask?.implementationNotes).toContain("phase 1/2");
		expect(secondTask?.status).toBe("Done");
		expect(log).toContain(`${partialTaskId}: partial`);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "not_all_tasks_done" },
			}),
		);
		expect(events).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "plan_completion_candidate" }),
			]),
		);
	});
});

interface Fixture {
	projectRoot: string;
	sessionsRoot: string;
	spec: DriverRunSpec;
	taskIds: string[];
	taskManager: TaskManager;
	events: DriverEvent[];
}

async function setupFixture(
	name: string,
	taskCount: number,
	specOverrides: Partial<DriverRunSpec> = {},
): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Graph finalization task ${index + 1}`,
			description: "Finalization regression fixture.",
			labels: [`plan:${PLAN_SLUG}`],
		});
		taskIds.push(task.id);
	}
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds,
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "final-state-commit",
		partialMode: "continue",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
		...specOverrides,
	};
	return {
		projectRoot,
		sessionsRoot,
		spec,
		taskIds,
		taskManager,
		events: [],
	};
}

function createRunContext(fixture: Fixture, backend: Backend) {
	return {
		taskManager: fixture.taskManager,
		backend,
		eventSink: async (event: DriverEvent) => {
			fixture.events.push(event);
			await mkdir(dirname(fixture.spec.eventLogPath), { recursive: true });
			await appendFile(
				fixture.spec.eventLogPath,
				`${JSON.stringify(event)}\n`,
				"utf-8",
			);
		},
		parentSessionId: fixture.spec.parentSessionId,
		runId: fixture.spec.runId,
		abortSignal: new AbortController().signal,
		cosmonautsRoot: resolve("."),
		mode: "inline" as const,
	};
}

function createBackend(
	options: {
		onRun?: (invocation: BackendInvocation) => Promise<BackendRunResult>;
	} = {},
): Backend & { startedTaskIds: string[] } {
	const startedTaskIds: string[] = [];
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		startedTaskIds,
		async run(invocation) {
			startedTaskIds.push(invocation.taskId);
			return (
				(await options.onRun?.(invocation)) ??
				reportResult({
					outcome: "success",
					files: [],
					verification: [],
					notes: `completed ${invocation.taskId}`,
				})
			);
		},
	};
}

function reportResult(report: Report): BackendRunResult {
	return {
		exitCode: 0,
		stdout: ["```json", JSON.stringify(report), "```"].join("\n"),
		durationMs: 1,
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

async function readLegacyEvents(
	path: string,
): Promise<Array<{ type: string }>> {
	return (await readFile(path, "utf-8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { type: string });
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md", "envelope.md", "missions/tasks"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(
		hookPath,
		"#!/bin/sh\nprintf 'commit rejected by graph finalization test\\n' >&2\nexit 1\n",
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}
