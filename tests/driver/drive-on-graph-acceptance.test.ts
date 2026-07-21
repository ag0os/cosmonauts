import { execFile } from "node:child_process";
import {
	appendFile,
	chmod,
	mkdir,
	readFile,
	rename,
	stat,
	utimes,
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
import {
	recordDriveTerminalEpisode,
	runDriveOnGraph,
} from "../../lib/driver/drive-graph-runner.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepAttemptRecord,
	type StepRecord,
	type StepResult,
} from "../../lib/durable-runtime/index.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-on-graph-acceptance-");
const execFileAsync = promisify(execFile);
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-on-graph-acceptance-parent";
const WORKER_SOURCE = "cod" + "ing/worker";

describe("Drive-on-graph acceptance", () => {
	test("records one terminal episode for every Drive result outcome after completion persistence @cosmo-behavior plan:episodic-log#B-017", async () => {
		const outcomes: DriverResult["outcome"][] = [];
		const cases = [
			{
				name: "completed",
				backend: () => createBackend(),
			},
			{
				name: "blocked",
				backend: () =>
					createBackend({
						onRun: async () => blockedBackendResult("worker needs input"),
					}),
			},
			{
				name: "aborted",
				backend: (controller: AbortController) =>
					createBackend({
						onRun: async () => {
							controller.abort(new Error("operator aborted"));
							return successfulBackendResult("aborted after worker return");
						},
					}),
			},
			{
				name: "finalization-failed",
				backend: () => createBackend(),
				failFinalization: true,
			},
		] as const;

		for (const testCase of cases) {
			const fixture = await setupFixture(`episode-${testCase.name}`, 2);
			await writeEpisodicConfig(fixture.projectRoot, true);
			fixture.spec = {
				...fixture.spec,
				episodeSource: WORKER_SOURCE,
				episodeAttemptId: `attempt-${testCase.name}`,
			};
			const controller = new AbortController();
			let backend = testCase.backend(controller);
			if ("failFinalization" in testCase && testCase.failFinalization) {
				await initGit(fixture.projectRoot);
				await installFailingCommitHook(fixture.projectRoot);
				fixture.spec = {
					...fixture.spec,
					commitPolicy: "driver-commits",
				};
				backend = createBackend({
					onRun: async (invocation) => {
						await writeFile(
							join(invocation.projectRoot, "finalization-change.ts"),
							"export const changed = true;\n",
							"utf-8",
						);
						return successfulBackendResult("commit must fail");
					},
				});
			}

			const result = await runDriveOnGraph(
				fixture.spec,
				createRunContext(fixture, backend, controller.signal),
			);
			outcomes.push(result.outcome);

			const completionPath = join(fixture.spec.workdir, "run.completion.json");
			const completionBytes = await readFile(completionPath, "utf-8");
			expect(JSON.parse(completionBytes)).toEqual(result);
			expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

			let episodes = await readProjectDriveEpisodes(fixture.projectRoot);
			expect(episodes).toHaveLength(2);
			expect(episodes.map((episode) => episode.outcome).sort()).toEqual(
				["started", result.outcome].sort(),
			);
			expect(new Set(episodes.map((episode) => episode.subject.id))).toEqual(
				new Set([fixture.spec.runId]),
			);
			expect(episodes.map((episode) => episode.source)).toEqual([
				WORKER_SOURCE,
				WORKER_SOURCE,
			]);
			expect(
				episodes.every((episode) =>
					episode.tags.includes(`attempt:${fixture.spec.episodeAttemptId}`),
				),
			).toBe(true);
			expect(
				episodes.filter((episode) =>
					episode.tags.includes("action:task.status-changed"),
				),
			).toEqual([]);
			expect(
				episodes.filter((episode) =>
					episode.tags.includes("action:plan.status-changed"),
				),
			).toEqual([]);

			await utimes(
				completionPath,
				new Date("2030-01-01T00:00:00.000Z"),
				new Date("2030-01-01T00:00:00.000Z"),
			);
			await recordDriveTerminalEpisode(fixture.spec, result);
			episodes = await readProjectDriveEpisodes(fixture.projectRoot);
			expect(episodes).toHaveLength(2);
			const terminal = episodes.find(
				(episode) => episode.outcome === result.outcome,
			);
			expect(terminal?.timestamp).toBe(result.completedAt);
			expect(await readFile(completionPath, "utf-8")).toBe(completionBytes);
		}

		expect(outcomes.sort()).toEqual([
			"aborted",
			"blocked",
			"completed",
			"finalization_failed",
		]);

		const thrown = await setupFixture("episode-thrown", 1);
		await writeEpisodicConfig(thrown.projectRoot, true);
		thrown.spec = {
			...thrown.spec,
			episodeSource: WORKER_SOURCE,
			episodeAttemptId: "attempt-thrown",
		};
		const originalError = new Error("primary event sink failed");
		const thrownContext = createRunContext(
			thrown,
			createBackend(),
			new AbortController().signal,
		);
		thrownContext.eventSink = async (event: DriverEvent) => {
			if (event.type === "run_started") throw originalError;
		};
		await expect(runDriveOnGraph(thrown.spec, thrownContext)).rejects.toBe(
			originalError,
		);
		const thrownEpisodes = await readProjectDriveEpisodes(thrown.projectRoot);
		expect(thrownEpisodes.map((episode) => episode.outcome).sort()).toEqual([
			"failed",
			"started",
		]);

		const captureFailure = await setupFixture("episode-capture-failure", 1);
		await writeEpisodicConfig(captureFailure.projectRoot, true);
		await writeFile(
			join(captureFailure.projectRoot, "memory", "agent"),
			"collision",
		);
		captureFailure.spec = {
			...captureFailure.spec,
			episodeSource: WORKER_SOURCE,
			episodeAttemptId: "attempt-capture-failure",
		};
		const captureFailureResult = await runDriveOnGraph(
			captureFailure.spec,
			createRunContext(
				captureFailure,
				createBackend(),
				new AbortController().signal,
			),
		);
		expect(captureFailureResult.outcome).toBe("completed");
		expect(
			JSON.parse(
				await readFile(
					join(captureFailure.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			),
		).toEqual(captureFailureResult);
		expect(captureFailure.events.at(-1)?.type).toBe("run_completed");
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-021
	test("survives scheduler host death and resumes a large sequential drive graph", async () => {
		const fixture = await setupFixture("large-resume", 12);
		const firstController = new AbortController();
		const firstBackend = createBackend({
			onRun: async (invocation, runNumber) => {
				if (runNumber === 6) {
					await Promise.resolve();
					firstController.abort(new Error("simulated scheduler host death"));
					return new Promise((_, reject) => {
						setTimeout(() => reject(new Error("host process terminated")), 0);
					});
				}
				return successfulBackendResult(`completed ${invocation.taskId}`);
			},
		});

		const interrupted = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, firstBackend, firstController.signal),
		);
		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const ref = { scope: PLAN_SLUG, runId: fixture.spec.runId };
		const runningAtDeath = await oneRunningDriveStep(store, fixture.spec.runId);
		const completedBeforeResume = await completedStepIds(
			store,
			fixture.spec.runId,
		);
		await persistTerminalAttemptEvidence(store, runningAtDeath);

		const resumedBackend = createBackend();
		const result = await runDriveOnGraph(
			{
				...fixture.spec,
				remainingTaskIds: fixture.taskIds.slice(6),
			},
			createRunContext(fixture, resumedBackend, new AbortController().signal),
		);
		const reloadedRun = await store.loadRun(ref);
		const graph = await store.readRunGraph(ref);
		const steps = await store.listStepRecords(ref);
		const schedulerState = await store.readSchedulerState(ref);
		const finalEvents = await readLegacyEvents(fixture.spec.eventLogPath);

		expect(interrupted).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
		});
		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: fixture.taskIds.length,
			tasksBlocked: 0,
		});
		expect(reloadedRun?.metadata?.driveTaskIds).toEqual(fixture.taskIds);
		expect(graph.graph.steps).toHaveLength(fixture.taskIds.length * 2);
		expect(graph.diagnostics).toEqual([]);
		expect(steps.every((step) => step.status === "completed")).toBe(true);
		expect(schedulerState.readyStepIds).toEqual([]);
		expect(Object.keys(schedulerState.leasesByStepId)).toEqual([]);
		expect(Object.keys(schedulerState.heartbeatsByStepId)).toContain(
			runningAtDeath.id,
		);
		expect(
			await store.readStepHeartbeat({
				...ref,
				stepId: runningAtDeath.id,
			}),
		).toBeDefined();
		await expect(
			stat(join(fixture.spec.workdir, "graph.json")),
		).resolves.toBeTruthy();
		await expect(
			stat(join(fixture.spec.workdir, "pending-finalization.json")),
		).rejects.toMatchObject({ code: "ENOENT" });

		expect(firstBackend.startedTaskIds).toEqual(fixture.taskIds.slice(0, 6));
		expect(resumedBackend.startedTaskIds).toEqual(fixture.taskIds.slice(6));
		expect(new Set(firstBackend.startedTaskIds).size).toBe(
			firstBackend.startedTaskIds.length,
		);
		expect(new Set(resumedBackend.startedTaskIds).size).toBe(
			resumedBackend.startedTaskIds.length,
		);
		expect(completedBeforeResume).toEqual(
			expect.arrayContaining([
				...fixture.taskIds.slice(0, 5),
				...fixture.taskIds
					.slice(0, 5)
					.map((taskId) => `finalizer-task-status-${taskId}`),
			]),
		);
		expect(
			finalEvents.filter((event) => event.type === "task_done"),
		).toHaveLength(fixture.taskIds.length);
		expect(finalEvents.filter((event) => event.type === "commit_made")).toEqual(
			[],
		);
		expect(
			JSON.parse(
				await readFile(
					join(fixture.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			),
		).toEqual(result);
	});

	test("continues an in-flight run from the envelope snapshot after the live file moves", async () => {
		const fixture = await setupFixture("envelope-snapshot", 2);
		const envelopePath = fixture.spec.promptTemplate.envelopePath;
		fixture.spec.promptTemplate = {
			...fixture.spec.promptTemplate,
			envelopeContent: "# Snapshotted Envelope\n",
		};
		const observedPrompts: string[] = [];
		const backend = createBackend({
			onRun: async (invocation, runNumber) => {
				const rendered = await readFile(invocation.promptPath, "utf-8");
				observedPrompts.push(rendered);
				expect(rendered).toContain("# Snapshotted Envelope");
				expect(rendered).not.toContain("# Live Envelope");
				expect(rendered).not.toContain("# Mutated Envelope");
				if (runNumber === 1) {
					await writeFile(envelopePath, "# Mutated Envelope\n", "utf-8");
					await rename(envelopePath, `${envelopePath}.moved`);
				}
				return successfulBackendResult(`completed ${invocation.taskId}`);
			},
		});

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, backend, new AbortController().signal),
		);
		const persistedSpec = JSON.parse(
			await readFile(join(fixture.spec.workdir, "spec.json"), "utf-8"),
		) as DriverRunSpec;

		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: fixture.taskIds.length,
			tasksBlocked: 0,
		});
		expect(observedPrompts).toHaveLength(2);
		expect(persistedSpec.promptTemplate).toMatchObject({
			envelopePath,
			envelopeContent: "# Snapshotted Envelope\n",
		});
	});

	test("resumes from the persisted envelope snapshot after the live file moves", async () => {
		const fixture = await setupFixture("envelope-snapshot-resume", 3);
		const envelopePath = fixture.spec.promptTemplate.envelopePath;
		fixture.spec.promptTemplate = {
			...fixture.spec.promptTemplate,
			envelopeContent: "# Persisted Resume Envelope\n",
		};
		const firstController = new AbortController();
		const firstBackend = createBackend({
			onRun: async (invocation, runNumber) => {
				const rendered = await readFile(invocation.promptPath, "utf-8");
				expect(rendered).toContain("# Persisted Resume Envelope");
				if (runNumber === 2) {
					await Promise.resolve();
					firstController.abort(new Error("simulated resume interruption"));
					return new Promise((_, reject) => {
						setTimeout(() => reject(new Error("host process terminated")), 0);
					});
				}
				return successfulBackendResult(`completed ${invocation.taskId}`);
			},
		});

		const interrupted = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture, firstBackend, firstController.signal),
		);
		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const runningAtDeath = await oneRunningDriveStep(store, fixture.spec.runId);
		await persistTerminalAttemptEvidence(store, runningAtDeath);
		const persistedSpec = JSON.parse(
			await readFile(join(fixture.spec.workdir, "spec.json"), "utf-8"),
		) as DriverRunSpec;
		await writeFile(envelopePath, "# Mutated Resume Envelope\n", "utf-8");
		await rename(envelopePath, `${envelopePath}.moved`);

		const resumedPrompts: string[] = [];
		const resumedBackend = createBackend({
			onRun: async (invocation) => {
				const rendered = await readFile(invocation.promptPath, "utf-8");
				resumedPrompts.push(rendered);
				return successfulBackendResult(`completed ${invocation.taskId}`);
			},
		});
		const result = await runDriveOnGraph(
			{
				...persistedSpec,
				remainingTaskIds: fixture.taskIds.slice(2),
			},
			createRunContext(fixture, resumedBackend, new AbortController().signal),
		);

		expect(interrupted).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
		});
		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: fixture.taskIds.length,
			tasksBlocked: 0,
		});
		expect(resumedBackend.startedTaskIds).toEqual(fixture.taskIds.slice(2));
		expect(resumedPrompts).toHaveLength(1);
		expect(resumedPrompts[0]).toContain("# Persisted Resume Envelope");
		expect(resumedPrompts[0]).not.toContain("# Mutated Resume Envelope");
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

async function setupFixture(name: string, taskCount: number): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(workdir, { recursive: true });
	await writeFile(
		join(projectRoot, "envelope.md"),
		"# Live Envelope\n",
		"utf-8",
	);
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Large graph task ${index + 1}`,
			description: "Acceptance fixture task.",
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
		stateCommitPolicy: "none",
		taskTimeoutMs: 10,
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
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

function createRunContext(
	fixture: Fixture,
	backend: Backend,
	abortSignal: AbortSignal,
) {
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
		abortSignal,
		cosmonautsRoot: resolve("."),
		mode: "inline" as const,
	};
}

function createBackend(
	options: {
		onRun?: (
			invocation: BackendInvocation,
			runNumber: number,
		) => Promise<BackendRunResult>;
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
				(await options.onRun?.(invocation, startedTaskIds.length)) ??
				successfulBackendResult(`completed ${invocation.taskId}`)
			);
		},
	};
}

function successfulBackendResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes,
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

function blockedBackendResult(notes: string): BackendRunResult {
	return {
		exitCode: 1,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "failure",
				files: [],
				verification: [],
				notes,
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

async function writeEpisodicConfig(
	projectRoot: string,
	enabled: boolean,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled } }),
		"utf-8",
	);
}

async function readProjectDriveEpisodes(projectRoot: string) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;

	return records.map((record) => {
		const metadata = parseEpisodeRecord(record);
		if (!metadata) throw new Error(`Invalid episode record: ${record.path}`);
		return {
			...metadata,
			source: record.source,
			tags: record.tags,
			timestamp: record.timestamp,
		};
	});
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "drive@example.com"]);
	await git(projectRoot, ["config", "user.name", "Drive Test"]);
	await git(projectRoot, ["add", "."]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(hookPath, "#!/bin/sh\nexit 1\n", "utf-8");
	await chmod(hookPath, 0o755);
}

async function git(projectRoot: string, args: string[]): Promise<void> {
	await execFileAsync("git", args, { cwd: projectRoot });
}

async function oneRunningDriveStep(
	store: FileRunStore,
	runId: string,
): Promise<StepRecord & { latestAttemptId: string }> {
	const running = (
		await store.listStepRecords({ scope: PLAN_SLUG, runId })
	).filter((step) => step.kind === "drive" && step.status === "running");
	expect(running).toHaveLength(1);
	const step = running[0];
	if (!step?.latestAttemptId) {
		throw new Error("Running step is missing latestAttemptId.");
	}
	return step as StepRecord & { latestAttemptId: string };
}

async function completedStepIds(
	store: FileRunStore,
	runId: string,
): Promise<string[]> {
	return (await store.listStepRecords({ scope: PLAN_SLUG, runId }))
		.filter((step) => step.status === "completed")
		.map((step) => step.id);
}

async function persistTerminalAttemptEvidence(
	store: FileRunStore,
	step: StepRecord & { latestAttemptId: string },
): Promise<StepAttemptRecord> {
	const result: StepResult = {
		outcome: "success",
		summary: `completed ${step.id} after host death`,
		artifacts: [
			{
				id: `drive-output:${step.id}:${step.latestAttemptId}`,
				path: `steps/${step.id}/attempts/${step.latestAttemptId}.json`,
				kind: "drive-task-output",
			},
		],
		nextAction: "continue",
	};
	return store.writeStepAttemptRecord(
		{ scope: PLAN_SLUG, runId: step.runId, stepId: step.id },
		{
			attemptId: step.latestAttemptId,
			startedAt: step.heartbeat?.at ?? "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:00:01.000Z",
			result,
		},
	);
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
