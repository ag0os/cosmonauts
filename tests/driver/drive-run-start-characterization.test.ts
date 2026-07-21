import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { compileDriveRunToGraph } from "../../lib/driver/drive-graph-compiler.ts";
import {
	type RunDriveOnGraphCtx,
	runDriveOnGraph,
} from "../../lib/driver/drive-graph-runner.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-run-start-characterization-");
const PLAN_SLUG = "orchestration-surface-consolidation";

describe("runStart Drive graph characterization", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-003
	test("preserves graph-backed Drive files results and detached frozen runner through runStart", async () => {
		const fixture = await setupFixture("inline");

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture),
		);
		expect(Object.keys(result).sort()).toEqual([
			"outcome",
			"planCompletionCandidate",
			"runId",
			"tasksBlocked",
			"tasksDone",
		]);

		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			planCompletionCandidate: {
				planSlug: PLAN_SLUG,
				taskCount: 1,
			},
		});
		await expectArtifact(fixture.spec.workdir, "spec.json");
		await expectArtifact(fixture.spec.workdir, "task-queue.txt");
		await expectArtifact(fixture.spec.workdir, "events.jsonl");
		await expectArtifact(fixture.spec.workdir, "orchestration-events.jsonl");
		await expectArtifact(fixture.spec.workdir, "graph.json");
		await expectArtifact(
			fixture.spec.workdir,
			join("steps", fixture.taskId, "step.json"),
		);
		await expectArtifact(fixture.spec.workdir, "run.completion.json");
		expect(
			await readJson(join(fixture.spec.workdir, "run.completion.json")),
		).toEqual(result);

		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const ref = { scope: PLAN_SLUG, runId: fixture.spec.runId };
		const run = await store.loadRun(ref);
		const graph = await store.readRunGraph(ref);
		const steps = await store.listStepRecords(ref);
		const normalizedEvents = await store.readEvents(ref);
		const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);
		const runStepSource = await readFile("lib/driver/run-step.ts", "utf-8");
		const persistedSpec = await readJson(
			join(fixture.spec.workdir, "spec.json"),
		);
		if (
			!persistedSpec ||
			typeof persistedSpec !== "object" ||
			Array.isArray(persistedSpec)
		) {
			throw new Error("Expected persisted Drive spec object.");
		}
		expect(Object.keys(persistedSpec).sort()).toEqual([
			"backendName",
			"commitPolicy",
			"eventLogPath",
			"parentSessionId",
			"planSlug",
			"postflightCommands",
			"preflightCommands",
			"projectRoot",
			"promptTemplate",
			"runId",
			"stateCommitPolicy",
			"taskIds",
			"workdir",
		]);
		expect(persistedSpec).toEqual(fixture.spec);

		expect(run?.metadata).toEqual({
			driveTaskIds: [fixture.taskId],
			configuredBackendName: "codex",
		});
		expect(graph.graph.steps.map((step) => [step.id, step.kind])).toEqual([
			[fixture.taskId, "drive"],
			[`finalizer-task-status-${fixture.taskId}`, "finalizer"],
		]);
		expect(steps.map((step) => [step.id, step.status])).toEqual([
			[`finalizer-task-status-${fixture.taskId}`, "completed"],
			[fixture.taskId, "completed"],
		]);
		expect(normalizedEvents.events.at(0)?.event).toEqual({
			type: "run_started",
			runId: fixture.spec.runId,
		});
		expect(legacyEvents.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"run_started",
				"task_started",
				"spawn_completed",
				"task_done",
				"run_completed",
			]),
		);
		expect(runStepSource).toContain("runDriveOnGraph");
		expect(runStepSource).not.toContain("runRunLoop(spec");
		await expect(
			stat(join(fixture.projectRoot, "memory", "agent")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-004
	test("uses driveTaskIds instead of remainingTaskIds across resume and partial-init repair", async () => {
		const resume = await setupFixture("resume-authoritative", 3);
		const resumeStore = new FileRunStore({ rootDir: resume.sessionsRoot });
		await compileDriveRunToGraph({ spec: resume.spec, store: resumeStore });

		await runDriveOnGraph(
			{
				...resume.spec,
				remainingTaskIds: resume.taskIds.slice(2),
			},
			createRunContext(resume),
		);

		const resumeGraph = await resumeStore.readRunGraph({
			scope: PLAN_SLUG,
			runId: resume.spec.runId,
		});
		expect(
			resumeGraph.graph.steps
				.filter((step) => step.kind === "drive")
				.map((step) => step.id),
		).toEqual(resume.taskIds);
		expect(
			await readJson(join(resume.spec.workdir, "spec.json")),
		).toMatchObject({
			taskIds: resume.taskIds,
			remainingTaskIds: resume.taskIds.slice(2),
		});

		const repair = await setupFixture("partial-init-authoritative", 3);
		const repairStore = new FileRunStore({ rootDir: repair.sessionsRoot });
		await repairStore.createRun({
			scope: PLAN_SLUG,
			runId: repair.spec.runId,
			eventsPath: "orchestration-events.jsonl",
			policy: {
				defaultBackend: { name: repair.spec.backendName },
				worktree: { mode: "shared", path: repair.spec.workdir },
			},
			metadata: {
				driveTaskIds: repair.taskIds,
				configuredBackendName: repair.spec.backendName,
			},
		});

		await runDriveOnGraph(
			{
				...repair.spec,
				taskIds: repair.taskIds.slice(2),
				remainingTaskIds: repair.taskIds.slice(2),
			},
			createRunContext(repair),
		);

		const repairGraph = await repairStore.readRunGraph({
			scope: PLAN_SLUG,
			runId: repair.spec.runId,
		});
		const repairRun = await repairStore.loadRun({
			scope: PLAN_SLUG,
			runId: repair.spec.runId,
		});
		expect(
			repairGraph.graph.steps
				.filter((step) => step.kind === "drive")
				.map((step) => step.id),
		).toEqual(repair.taskIds);
		expect(repairRun?.metadata?.driveTaskIds).toEqual(repair.taskIds);
	});

	test("emits structured unmet-dependencies details when pending tasks drain", async () => {
		const fixture = await setupFixture("pending-unmet-dependencies", 2);
		const store = new FileRunStore({ rootDir: fixture.sessionsRoot });
		const compiled = await compileDriveRunToGraph({
			spec: fixture.spec,
			store,
		});
		const ref = { scope: PLAN_SLUG, runId: fixture.spec.runId };
		const [firstTaskId, secondTaskId] = fixture.taskIds;
		const firstTaskStep = compiled.steps.find(
			(step) => step.id === firstTaskId,
		);
		const firstStatusStep = compiled.steps.find(
			(step) => step.id === `finalizer-task-status-${firstTaskId}`,
		);
		if (!firstTaskId || !firstTaskStep || !firstStatusStep || !secondTaskId) {
			throw new Error("Fixture did not create expected graph steps.");
		}

		await store.writeStepRecord(ref, {
			...firstTaskStep,
			status: "completed",
			result: {
				outcome: "success",
				summary: "First task completed before scheduler drain.",
				artifacts: [],
				nextAction: "continue",
			},
		});
		await store.writeStepRecord(ref, {
			...firstStatusStep,
			status: "failed",
			result: {
				outcome: "failed",
				summary: "Task status finalizer failed before scheduler drain.",
				artifacts: [],
				nextAction: "abort_run",
			},
		});

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture),
		);

		expect(result).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
			abortDetails: {
				pendingTasks: { count: 1, taskIds: [secondTaskId] },
				cause: {
					type: "unmet-dependencies",
					blockingTaskIds: [firstTaskId],
				},
			},
		});
		expect(fixture.events.at(-1)).toMatchObject({
			type: "run_aborted",
			reason: "scheduler drained",
			details: {
				pendingTasks: { count: 1, taskIds: [secondTaskId] },
				cause: {
					type: "unmet-dependencies",
					blockingTaskIds: [firstTaskId],
				},
			},
		});
	});

	test("does not attach backend-setup-failure details to a normal task block", async () => {
		// Regression: a task the backend blocks (e.g. unchecked acceptance criteria,
		// needs human input) has no scheduler/setup cause and no unmet dependencies,
		// so it must NOT carry abortDetails claiming a backend setup failure.
		const fixture = await setupFixture("normal-task-block", 1, {
			acceptanceCriteria: ["Behavior is verified"],
		});

		const result = await runDriveOnGraph(
			fixture.spec,
			createRunContext(fixture),
		);

		expect(result).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "blocked",
		});
		expect((result as { abortDetails?: unknown }).abortDetails).toBeUndefined();
	});

	test("emits a diagnostic before aborting on scheduler-ending exceptions", async () => {
		const fixture = await setupFixture("scheduler-ending-exception");
		const ctx = createRunContext(fixture);
		ctx.taskManager = new Proxy(fixture.taskManager, {
			get(target, property, receiver) {
				if (property === "listTasks") {
					return async () => {
						throw new Error("task listing exploded");
					};
				}
				return Reflect.get(target, property, receiver);
			},
		}) as TaskManager;

		await expect(runDriveOnGraph(fixture.spec, ctx)).rejects.toThrow(
			"task listing exploded",
		);

		const diagnosticIndex = fixture.events.findIndex(
			(event) => event.type === "driver_diagnostic",
		);
		const abortedIndex = fixture.events.findIndex(
			(event) => event.type === "run_aborted",
		);
		expect(diagnosticIndex).toBeGreaterThanOrEqual(0);
		expect(abortedIndex).toBeGreaterThan(diagnosticIndex);
		expect(fixture.events[diagnosticIndex]).toMatchObject({
			type: "driver_diagnostic",
			level: "error",
			code: "drive_scheduler_exception",
			message: "task listing exploded",
			phase: "scheduler",
			details: {
				pendingTasks: { count: 0, taskIds: [] },
			},
		});
		expect(fixture.events[abortedIndex]).toMatchObject({
			type: "run_aborted",
			reason: "task listing exploded",
			details: {
				pendingTasks: { count: 0, taskIds: [] },
				cause: {
					type: "exception",
					message: "task listing exploded",
					phase: "scheduler",
				},
			},
		});
	});
});

interface Fixture {
	projectRoot: string;
	sessionsRoot: string;
	taskId: string;
	taskIds: string[];
	spec: DriverRunSpec;
	taskManager: TaskManager;
	events: DriverEvent[];
}

async function setupFixture(
	name: string,
	taskCount = 1,
	options: { acceptanceCriteria?: string[] } = {},
): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const sessionsRoot = join(projectRoot, "missions", "sessions");
	const runId = `run-${name}`;
	const workdir = join(sessionsRoot, PLAN_SLUG, "runs", runId);
	await mkdir(workdir, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `${name} Drive characterization fixture ${index + 1}`,
			description: "Exercise Drive graph state.",
			labels: [`plan:${PLAN_SLUG}`],
			...(options.acceptanceCriteria
				? { acceptanceCriteria: options.acceptanceCriteria }
				: {}),
		});
		taskIds.push(task.id);
	}
	const [taskId] = taskIds;
	if (!taskId) {
		throw new Error("Fixture must create at least one task.");
	}
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Use the fake backend report.", "utf-8");
	return {
		projectRoot,
		sessionsRoot,
		taskId,
		taskIds,
		taskManager,
		events: [],
		spec: {
			runId,
			parentSessionId: `parent-${name}`,
			projectRoot,
			planSlug: PLAN_SLUG,
			taskIds,
			backendName: "codex",
			promptTemplate: { envelopePath },
			preflightCommands: [],
			postflightCommands: [],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
		},
	};
}

function createRunContext(fixture: Fixture): RunDriveOnGraphCtx {
	return {
		taskManager: fixture.taskManager,
		backend: createBackend(),
		eventSink: async (event) => {
			fixture.events.push(event);
			await mkdir(dirname(fixture.spec.eventLogPath), { recursive: true });
			await writeFile(
				fixture.spec.eventLogPath,
				`${fixture.events.map((item) => JSON.stringify(item)).join("\n")}\n`,
				"utf-8",
			);
		},
		parentSessionId: fixture.spec.parentSessionId,
		runId: fixture.spec.runId,
		abortSignal: new AbortController().signal,
		cosmonautsRoot: resolve("."),
		mode: "inline",
	};
}

function createBackend(): Backend {
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		livenessCheck() {
			return {
				argv: [process.execPath, "-e", "process.exit(0)"],
				expectExitZero: true,
			};
		},
		run: async () => successfulBackendResult(),
	};
}

function successfulBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes: "drive characterization success",
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

async function expectArtifact(
	workdir: string,
	relativePath: string,
): Promise<void> {
	await expect(stat(join(workdir, relativePath))).resolves.toBeTruthy();
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf-8"));
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
