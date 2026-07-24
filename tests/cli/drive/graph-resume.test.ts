import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import { AgentRegistry } from "../../../lib/agents/index.ts";
import type { AgentDefinition } from "../../../lib/agents/types.ts";
import type { Backend } from "../../../lib/driver/backends/types.ts";
import { compileDriveRunToGraph } from "../../../lib/driver/drive-graph-compiler.ts";
import { deriveDriveEpisodeAttemptId } from "../../../lib/driver/episode-identity.ts";
import { writeDriveTerminalRecord } from "../../../lib/driver/run-state.ts";
import type { DriverEvent, DriverRunSpec } from "../../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepRecord,
	type StepResult,
} from "../../../lib/durable-runtime/index.ts";
import { recordEpisode } from "../../../lib/memory/episode.ts";
import { parseEpisodeRecord } from "../../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../../lib/memory/markdown-store.ts";
import { CosmonautsRuntime } from "../../../lib/runtime.ts";
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

const sessionFactoryMocks = vi.hoisted(() => ({
	createAgentSessionFromDefinition: vi.fn(),
}));

vi.mock("../../../lib/driver/backend-resolution.ts", () => ({
	resolveConfiguredExternalBackend:
		backendMocks.resolveConfiguredExternalBackend,
}));

vi.mock("../../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition:
		sessionFactoryMocks.createAgentSessionFromDefinition,
}));

const execFileAsync = promisify(execFile);
const temp = useTempDir("drive-graph-resume-");
const PLAN_SLUG = "durable-frontend-migration";
const RUN_ID = "run-previous";
const WORKER_SOURCE = "cod" + "ing/worker";
const UNAVAILABLE_WORKER_SOURCE = "retired-" + "cod" + "ing/worker";
const FALLBACK_WORKER_SOURCE = "fallback-" + "cod" + "ing/worker";
const PLANNER_SOURCE = "project-" + "cod" + "ing/planner";
const TERMINAL_COMPLETED_AT = "2026-07-22T19:00:00.000Z";
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
		sessionFactoryMocks.createAgentSessionFromDefinition.mockReset();
		sessionFactoryMocks.createAgentSessionFromDefinition.mockResolvedValue(
			successfulWorkerSession(),
		);
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

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-019
	test("drops an unavailable frozen worker before execution and never attributes the fallback to it", async () => {
		const fixture = await setupPendingExecutionGraphResume();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const runtimeCreate = vi
			.spyOn(CosmonautsRuntime, "create")
			.mockResolvedValue(fallbackExecutionRuntime() as CosmonautsRuntime);
		const persistedBefore = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;

		expect(persistedBefore.remainingTaskIds).toEqual([fixture.taskId]);
		expect(persistedBefore.backendName).toBe("cosmonauts-subagent");
		expect(persistedBefore).toMatchObject({
			episodeSource: UNAVAILABLE_WORKER_SOURCE,
			episodeAttemptId: "attempt-stale-worker",
		});
		expect(
			await readFile(join(fixture.spec.workdir, "task-queue.txt"), "utf-8"),
		).toBe(`${fixture.taskId}\n`);

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
			"--mode",
			"inline",
			"--backend",
			"cosmonauts-subagent",
		]);

		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		const episodes = await readProjectDriveEpisodes(fixture.spec.projectRoot);
		const events = await readFile(fixture.spec.eventLogPath, "utf-8");
		const [executedDefinition, spawnConfig] =
			sessionFactoryMocks.createAgentSessionFromDefinition.mock.calls[0] ?? [];
		const executedWorker = executedDefinition as AgentDefinition;

		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		expect(runtimeCreate).toHaveBeenCalledTimes(1);
		expect(
			sessionFactoryMocks.createAgentSessionFromDefinition,
		).toHaveBeenCalledTimes(1);
		expect(`${executedWorker.domain}/${executedWorker.id}`).toBe(
			FALLBACK_WORKER_SOURCE,
		);
		expect(spawnConfig).toMatchObject({
			role: "worker",
			agentReference: undefined,
		});
		expect(events).toContain(`"resolvedAgentId":"${FALLBACK_WORKER_SOURCE}"`);
		expect(persistedSpec).not.toHaveProperty("episodeSource");
		expect(persistedSpec).not.toHaveProperty("episodeAttemptId");
		// Pre-CDX-002 attributed this fallback execution to the unavailable source.
		expect(
			episodes.some((episode) => episode.source === UNAVAILABLE_WORKER_SOURCE),
		).toBe(false);
	});

	test("treats empty-legacy-queue graph continuation as worker execution", async () => {
		const fixture = await setupPendingExecutionGraphResume();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const staleAttemptId = "attempt-stale-planner";
		await writeFile(
			join(fixture.spec.workdir, "spec.json"),
			`${JSON.stringify(
				{
					...fixture.spec,
					remainingTaskIds: [],
					episodeSource: PLANNER_SOURCE,
					episodeAttemptId: staleAttemptId,
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		await writeFile(
			fixture.spec.eventLogPath,
			`${JSON.stringify(event({ type: "task_done", taskId: fixture.taskId }))}\n`,
			"utf-8",
		);
		vi.spyOn(CosmonautsRuntime, "create").mockResolvedValue({
			...fallbackExecutionRuntime(),
			agentRegistry: new AgentRegistry([workerDefinition(WORKER_SOURCE)]),
		} as CosmonautsRuntime);

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
			"--mode",
			"inline",
			"--backend",
			"cosmonauts-subagent",
		]);

		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		const episodes = await readProjectDriveEpisodes(fixture.spec.projectRoot);
		expect(persistedSpec.episodeSource).toBe(WORKER_SOURCE);
		expect(persistedSpec.episodeAttemptId).toMatch(/^attempt-/u);
		expect(persistedSpec.episodeAttemptId).not.toBe(staleAttemptId);
		expect(episodes).toHaveLength(1);
		expect(episodes[0]?.source).toBe(WORKER_SOURCE);
		expect(
			sessionFactoryMocks.createAgentSessionFromDefinition,
		).toHaveBeenCalledTimes(1);
	});

	test("resumes pending task-status finalization with one terminal result", async () => {
		const fixture = await setupCompletedTaskWithPendingTaskStatus();
		await enableFrozenEpisodeIdentity(fixture.spec);

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
		const completionBytes = await readFile(
			join(fixture.spec.workdir, "run.completion.json"),
			"utf-8",
		);
		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;

		expect(emittedResults).toHaveLength(1);
		expect(emittedResults[0]).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		expect(completion).toEqual(withoutScope(onlyJsonRecord(emittedResults)));
		expect(completion).toMatchObject({ completedAt: expect.any(String) });
		expect(persistedSpec.episodeSource).toBe(WORKER_SOURCE);
		expect(persistedSpec.episodeAttemptId).toBe("attempt-prior");
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

		let episodes = await readProjectDriveEpisodes(process.cwd());
		expect(episodes).toHaveLength(1);
		expect(episodes[0]).toMatchObject({
			action: "drive.run",
			outcome: "completed",
			source: WORKER_SOURCE,
			subject: { kind: "run", id: RUN_ID },
		});
		expect(episodes[0]?.tags).toContain("attempt:attempt-prior");
		expect(episodes[0]?.tags).not.toContain("outcome:started");

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);
		episodes = await readProjectDriveEpisodes(process.cwd());
		expect(episodes).toHaveLength(1);
		expect(
			await readFile(
				join(fixture.spec.workdir, "run.completion.json"),
				"utf-8",
			),
		).toBe(completionBytes);
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

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-007
	test("rehydrates the attempt ledger and skips a second terminal after thrown-exit resume", async () => {
		const fixture = await setupFullyCompletedGraphRun();
		await enableFrozenEpisodeIdentity(fixture.spec);
		const attemptId = "attempt-prior";
		const failedAt = "2026-07-22T17:10:00.000Z";
		await recordEpisode({
			projectRoot: fixture.spec.projectRoot,
			event: {
				scope: "project",
				source: WORKER_SOURCE,
				action: "drive.run",
				outcome: "failed",
				subject: { kind: "run", id: RUN_ID },
				tags: [`attempt:${attemptId}`],
				timestamp: failedAt,
				summary: `Drive run "${RUN_ID}" failed.`,
				details: `Attempt ${attemptId} reached terminal outcome failed.`,
			},
		});
		await writeDriveTerminalRecord(fixture.spec.workdir, {
			version: 1,
			attemptId,
			outcome: "failed",
			timestamp: failedAt,
			state: "recorded",
		});
		await writeFile(
			join(fixture.spec.workdir, "run.completion.json"),
			`${JSON.stringify(
				{
					runId: RUN_ID,
					outcome: "aborted",
					tasksDone: 0,
					tasksBlocked: 0,
					blockedReason: "thrown process exited",
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const completion = await readJson(
			join(fixture.spec.workdir, "run.completion.json"),
		);
		expect(completion).toMatchObject({
			runId: RUN_ID,
			outcome: "aborted",
			completedAt: expect.any(String),
		});
		const episodes = await readProjectDriveEpisodes(process.cwd());
		expect(episodes).toHaveLength(1);
		expect(episodes[0]).toMatchObject({
			outcome: "failed",
			source: WORKER_SOURCE,
			subject: { kind: "run", id: RUN_ID },
		});
		expect(episodes[0]?.tags).toContain(`attempt:${attemptId}`);
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-011
	test("records one run-id-derived terminal for an off-then-enabled completed resume", async () => {
		const fixture = await setupTerminalOnlyCompletedRun();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const runtimeCreate = vi
			.spyOn(CosmonautsRuntime, "create")
			.mockResolvedValue(terminalResumeRuntime());

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const attemptId = deriveDriveEpisodeAttemptId(RUN_ID);
		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		const completion = await readJson(
			join(fixture.spec.workdir, "run.completion.json"),
		);
		const episodes = await readProjectDriveEpisodes(process.cwd());

		expect(persistedSpec.episodeSource).toBe(WORKER_SOURCE);
		expect(persistedSpec.episodeAttemptId).toBe(attemptId);
		expect(completion).toMatchObject({
			runId: RUN_ID,
			outcome: "completed",
			completedAt: TERMINAL_COMPLETED_AT,
		});
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			completedAt: TERMINAL_COMPLETED_AT,
		});
		expect(episodes).toHaveLength(1);
		expect(episodes[0]).toMatchObject({
			action: "drive.run",
			outcome: "completed",
			source: persistedSpec.episodeSource,
			subject: { kind: "run", id: RUN_ID },
		});
		expect(episodes[0]?.tags).toContain(
			`attempt:${persistedSpec.episodeAttemptId}`,
		);
		expect(episodes[0]?.tags).not.toContain("outcome:started");
		expect(runtimeCreate).toHaveBeenCalledTimes(1);
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});

	test("records one run-id-derived terminal for a completed graph-backed resume", async () => {
		const fixture = await setupFullyCompletedGraphRun();
		await writeFile(
			join(fixture.spec.workdir, "run.completion.json"),
			`${JSON.stringify(
				{
					runId: RUN_ID,
					outcome: "completed",
					tasksDone: 1,
					tasksBlocked: 0,
					completedAt: TERMINAL_COMPLETED_AT,
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		await enableEpisodeCapture(fixture.spec.projectRoot);
		vi.spyOn(CosmonautsRuntime, "create").mockResolvedValue(
			terminalResumeRuntime(),
		);

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		const episodes = await readProjectDriveEpisodes(process.cwd());
		expect(persistedSpec).toMatchObject({
			episodeSource: WORKER_SOURCE,
			episodeAttemptId: deriveDriveEpisodeAttemptId(RUN_ID),
		});
		expect(episodes).toHaveLength(1);
		expect(episodes[0]).toMatchObject({
			action: "drive.run",
			outcome: "completed",
			source: WORKER_SOURCE,
			subject: { kind: "run", id: RUN_ID },
		});
		expect(await readTerminalLedger(fixture.spec.workdir)).toHaveLength(1);
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-012
	test("repeats deterministic terminal-only resume without changing bytes or episode count", async () => {
		const fixture = await setupTerminalOnlyCompletedRun();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const runtimeCreate = vi
			.spyOn(CosmonautsRuntime, "create")
			.mockResolvedValue(terminalResumeRuntime());
		const resumeArgs = [
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		];

		await parseDrive(resumeArgs);
		const attemptId = deriveDriveEpisodeAttemptId(RUN_ID);
		const firstSpecBytes = await readFile(
			join(fixture.spec.workdir, "spec.json"),
			"utf-8",
		);
		const firstCompletionBytes = await readFile(
			join(fixture.spec.workdir, "run.completion.json"),
			"utf-8",
		);
		const firstLedger = await readTerminalLedger(fixture.spec.workdir);
		const firstEpisodes = await readProjectDriveEpisodes(process.cwd());

		await parseDrive(resumeArgs);

		expect(
			await readFile(join(fixture.spec.workdir, "spec.json"), "utf-8"),
		).toBe(firstSpecBytes);
		expect(
			await readFile(
				join(fixture.spec.workdir, "run.completion.json"),
				"utf-8",
			),
		).toBe(firstCompletionBytes);
		expect(await readTerminalLedger(fixture.spec.workdir)).toEqual(firstLedger);
		expect(await readProjectDriveEpisodes(process.cwd())).toEqual(
			firstEpisodes,
		);
		expect(firstLedger).toHaveLength(1);
		expect(firstEpisodes).toHaveLength(1);
		expect(JSON.parse(firstSpecBytes)).toMatchObject({
			episodeSource: WORKER_SOURCE,
			episodeAttemptId: attemptId,
		});
		expect(runtimeCreate).toHaveBeenCalledTimes(1);
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-025
	test("warns and skips terminal capture when off-era resume source cannot resolve", async () => {
		const fixture = await setupTerminalOnlyCompletedRun();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const failureDetail = "runtime unavailable ".repeat(60);
		vi.spyOn(CosmonautsRuntime, "create").mockRejectedValue(
			new Error(failureDetail),
		);
		const completionPath = join(fixture.spec.workdir, "run.completion.json");
		const completionBytes = await readFile(completionPath, "utf-8");

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		const warnings = output
			.stderr()
			.trim()
			.split("\n")
			.filter((line) => line.includes("Drive episode capture skipped"));
		const persistedSpec = (await readJson(
			join(fixture.spec.workdir, "spec.json"),
		)) as DriverRunSpec;
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.length).toBeLessThan(600);
		expect(persistedSpec).not.toHaveProperty("episodeSource");
		expect(persistedSpec).not.toHaveProperty("episodeAttemptId");
		expect(await readFile(completionPath, "utf-8")).toBe(completionBytes);
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			scope: PLAN_SLUG,
			outcome: "completed",
			completedAt: TERMINAL_COMPLETED_AT,
		});
		await expect(
			access(join(fixture.spec.workdir, "run.terminal-episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(fixture.spec.projectRoot, "memory", "agent", "episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(backendMocks.backendRun).not.toHaveBeenCalled();
	});

	test("leaves graph resume inputs byte-identical when dirty or unsupported resume is refused", async () => {
		const fixture = await setupFullyCompletedGraphRun();
		await enableEpisodeCapture(fixture.spec.projectRoot);
		const taskQueuePath = join(fixture.spec.workdir, "task-queue.txt");
		await writeFile(taskQueuePath, "\n", "utf-8");
		const specPath = join(fixture.spec.workdir, "spec.json");
		const specBytes = await readFile(specPath, "utf-8");
		const taskQueueBytes = await readFile(taskQueuePath, "utf-8");
		const runtimeCreate = vi
			.spyOn(CosmonautsRuntime, "create")
			.mockRejectedValue(new Error("identity preparation must not run"));

		await parseDrive(["--plan", PLAN_SLUG, "--resume", RUN_ID]);

		expect(output.stderr()).toContain('"error":"dirty_worktree"');
		expect(await readFile(specPath, "utf-8")).toBe(specBytes);
		expect(await readFile(taskQueuePath, "utf-8")).toBe(taskQueueBytes);

		process.exitCode = undefined;
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
			"--mode",
			"detached",
			"--backend",
			"cosmonauts-subagent",
		]);

		expect(output.stderr()).toContain(
			'"error":"detached_backend_not_supported"',
		);
		expect(await readFile(specPath, "utf-8")).toBe(specBytes);
		expect(await readFile(taskQueuePath, "utf-8")).toBe(taskQueueBytes);
		expect(runtimeCreate).not.toHaveBeenCalled();
	});

	test("keeps persisted terminal identity artifact-free while episodic capture is off", async () => {
		const fixture = await setupTerminalOnlyCompletedRun();
		await writeFile(
			join(fixture.spec.workdir, "spec.json"),
			`${JSON.stringify(
				{
					...fixture.spec,
					episodeSource: WORKER_SOURCE,
					episodeAttemptId: "attempt-old-enabled-run",
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		const runtimeCreate = vi
			.spyOn(CosmonautsRuntime, "create")
			.mockRejectedValue(
				new Error("gate-off resume must not create a runtime"),
			);
		const specPath = join(fixture.spec.workdir, "spec.json");
		const completionPath = join(fixture.spec.workdir, "run.completion.json");
		const specBytes = await readFile(specPath, "utf-8");
		const completionBytes = await readFile(completionPath, "utf-8");

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		expect(runtimeCreate).not.toHaveBeenCalled();
		expect(await readFile(specPath, "utf-8")).toBe(specBytes);
		expect(await readFile(completionPath, "utf-8")).toBe(completionBytes);
		await expect(
			access(join(fixture.spec.workdir, "run.terminal-episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(fixture.spec.projectRoot, "memory", "agent", "episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("keeps a failing pending finalization artifact-free while episodic capture is off", async () => {
		const fixture = await setupCompletedTaskWithPendingStateCommit();
		// Point the pending finalization at a task that does not exist so the
		// retry cannot be accepted and the failure terminal writer runs.
		await writeFile(
			join(fixture.spec.workdir, "pending-finalization.json"),
			`${JSON.stringify({
				runId: RUN_ID,
				planSlug: PLAN_SLUG,
				createdAt: "2026-06-04T00:00:00.000Z",
				commitPolicy: "no-commit",
				stateCommitPolicy: "final-state-commit",
				reason: "state commit failed: previous hook rejection",
				phase: "state_commit",
				taskIds: ["TASK-DOES-NOT-EXIST"],
				headBeforeFinalization: await gitStdout(["rev-parse", "HEAD"]),
			})}\n`,
			"utf-8",
		);
		// A prior enabled run froze identity into the spec; the gate is now off.
		await writeFile(
			join(fixture.spec.workdir, "spec.json"),
			`${JSON.stringify(
				{
					...fixture.spec,
					taskIds: [],
					remainingTaskIds: [],
					episodeSource: WORKER_SOURCE,
					episodeAttemptId: "attempt-old-enabled-run",
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);

		await parseDrive([
			"--plan",
			PLAN_SLUG,
			"--resume",
			RUN_ID,
			"--resume-dirty",
		]);

		// Guard: this test is only meaningful if the retry actually failed and the
		// finalization-failure terminal writer ran.
		expect(
			JSON.parse(
				await readFile(
					join(fixture.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			),
		).toMatchObject({ outcome: "finalization_failed" });

		// The finalization retry fails again, so a terminal is persisted — but with
		// the gate off it must not create ledger or episode artifacts (B-001).
		await expect(
			access(join(fixture.spec.workdir, "run.terminal-episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(fixture.spec.projectRoot, "memory", "agent", "episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
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

async function setupPendingExecutionGraphResume(): Promise<{
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
		title: "Pending graph resume task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	await git(["add", "envelope.md", "missions/tasks"]);
	await git(["commit", "-m", "add pending drive task"]);

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
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
		remainingTaskIds: [task.id],
		episodeSource: UNAVAILABLE_WORKER_SOURCE,
		episodeAttemptId: "attempt-stale-worker",
	};
	await mkdir(workdir, { recursive: true });
	const store = new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
	await compileDriveRunToGraph({ spec, store });
	await writeFile(
		join(workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(join(workdir, "task-queue.txt"), `${task.id}\n`, "utf-8");
	await writeFile(join(workdir, "events.jsonl"), "", "utf-8");
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

async function setupTerminalOnlyCompletedRun(): Promise<{
	taskId: string;
	spec: DriverRunSpec;
}> {
	const projectRoot = process.cwd();
	await mkdir(projectRoot, { recursive: true });
	await initGit(projectRoot);
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: "Terminal-only resume task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	await git(["add", "envelope.md", "missions/tasks"]);
	await git(["commit", "-m", "add completed drive task"]);

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
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
		remainingTaskIds: [],
	};
	await mkdir(workdir, { recursive: true });
	await writeFile(
		join(workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(join(workdir, "task-queue.txt"), "\n", "utf-8");
	await writeFile(
		join(workdir, "events.jsonl"),
		`${JSON.stringify(event({ type: "task_done", taskId: task.id }))}\n`,
		"utf-8",
	);
	await writeFile(
		join(workdir, "run.completion.json"),
		`${JSON.stringify(
			{
				runId: RUN_ID,
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
				completedAt: TERMINAL_COMPLETED_AT,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
	return { taskId: task.id, spec };
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

async function enableFrozenEpisodeIdentity(spec: DriverRunSpec): Promise<void> {
	await enableEpisodeCapture(spec.projectRoot);
	const specPath = join(spec.workdir, "spec.json");
	const persisted = (await readJson(specPath)) as DriverRunSpec;
	await writeFile(
		specPath,
		`${JSON.stringify(
			{
				...persisted,
				episodeSource: WORKER_SOURCE,
				episodeAttemptId: "attempt-prior",
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

async function enableEpisodeCapture(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

function terminalResumeRuntime(): CosmonautsRuntime {
	return {
		agentRegistry: new AgentRegistry([workerDefinition(WORKER_SOURCE)]),
		domainContext: undefined,
	} as CosmonautsRuntime;
}

function fallbackExecutionRuntime(): Pick<
	CosmonautsRuntime,
	| "agentRegistry"
	| "domainContext"
	| "domainResolver"
	| "domainsDir"
	| "projectSkills"
	| "skillPaths"
> {
	return {
		agentRegistry: new AgentRegistry([
			workerDefinition(FALLBACK_WORKER_SOURCE),
		]),
		domainContext: undefined,
		domainResolver: {} as never,
		domainsDir: process.cwd(),
		projectSkills: [],
		skillPaths: [],
	};
}

function workerDefinition(qualifiedId: string): AgentDefinition {
	const separator = qualifiedId.indexOf("/");
	return {
		id: "worker",
		domain: qualifiedId.slice(0, separator),
		description: "Drive worker",
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
}

function successfulWorkerSession() {
	return {
		session: {
			sessionId: "fallback-worker-session",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: "outcome: success" }],
				},
			],
			prompt: vi.fn(),
			dispose: vi.fn(),
			subscribe: vi.fn(() => vi.fn()),
			getSessionStats: () => ({
				tokens: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
				cost: 0,
				userMessages: 1,
				toolCalls: 0,
			}),
		},
	};
}

async function readTerminalLedger(
	workdir: string,
): Promise<Array<{ name: string; bytes: string }>> {
	const directory = join(workdir, "run.terminal-episodes");
	const names = (await readdir(directory)).sort();
	return await Promise.all(
		names.map(async (name) => ({
			name,
			bytes: await readFile(join(directory, name), "utf-8"),
		})),
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
		return { ...metadata, source: record.source, tags: record.tags };
	});
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
