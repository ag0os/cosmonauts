import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "../../lib/driver/backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	createDriveSchedulerBackend,
	createDriveSchedulerBackendMap,
} from "../../lib/driver/drive-scheduler-backend.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import type {
	BackendContext,
	RunRecord,
	SchedulerStepInput,
	StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-scheduler-backend-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-scheduler-parent";

describe("Drive scheduler backend", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-011
	test("builds BackendInvocation from scheduler input and rendered task prompts", async () => {
		const fixture = await setupFixture("prepare-authoritative");
		await fixture.taskManager.createTask({ title: "First selected task" });
		await fixture.taskManager.createTask({ title: "Remaining task" });
		const spec = createSpec(fixture, {
			runId: "run-prepare",
			taskIds: ["TASK-2"],
		});
		const backend = createDriveSchedulerBackend({
			spec,
			taskManager: fixture.taskManager,
			backend: createBackend(),
			eventSink: fixture.recordEvent,
		});
		const run = createRunRecord(spec, {
			driveTaskIds: ["TASK-1", "TASK-2"],
		});
		const step = createStepRecord(spec, "TASK-1");
		const schedulerInput = createSchedulerInput(step);
		const signal = new AbortController().signal;

		const prepared = await backend.prepare(
			step,
			createBackendContext(run, step, schedulerInput, signal),
		);

		const invocation = (
			prepared as typeof prepared & { invocation: BackendInvocation }
		).invocation;
		expect(invocation).toMatchObject({
			runId: spec.runId,
			workdir: spec.workdir,
			projectRoot: spec.projectRoot,
			taskId: "TASK-1",
			parentSessionId: spec.parentSessionId,
			planSlug: spec.planSlug,
			eventSink: fixture.recordEvent,
			signal,
		});
		expect(invocation.promptPath).toBe(
			join(spec.workdir, "prompts", "TASK-1.md"),
		);
		expect(await readFile(invocation.promptPath, "utf-8")).toContain(
			"First selected task",
		);

		await expect(
			backend.prepare(
				createStepRecord(spec, "TASK-3"),
				createBackendContext(
					run,
					createStepRecord(spec, "TASK-3"),
					createSchedulerInput(createStepRecord(spec, "TASK-3")),
					signal,
				),
			),
		).rejects.toThrow(/not in selected Drive task set/);
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-012
	test("runs preflight backend postflight and report inference before returning StepResult", async () => {
		const inferred = await setupFixture("execution-inferred");
		await inferred.taskManager.createTask({ title: "Infer from postflight" });
		const inferredEvents: DriverEvent[] = [];
		let invocation: BackendInvocation | undefined;
		const spec = createSpec(inferred, {
			runId: "run-inferred",
			postflightCommands: [nodeCommand("process.exit(0)")],
		});
		const prepared = await prepareTaskStep({
			spec,
			fixture: inferred,
			backendRun: async (input) => {
				invocation = input;
				return {
					exitCode: 0,
					stdout: "Implemented the requested behavior without a report.",
					durationMs: 5,
				};
			},
			events: inferredEvents,
		});

		const handle = await prepared.backend.start(prepared.step);
		const result = await handle.result;

		expect(invocation?.promptPath).toBe(
			join(spec.workdir, "prompts", "TASK-1.md"),
		);
		expect(result).toMatchObject({
			outcome: "success",
			nextAction: "continue",
			verification: [{ command: expect.any(String), status: "pass" }],
		});
		expect(inferredEvents.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"verify",
			"verify",
		]);

		const blocked = await setupFixture("execution-preflight-blocked");
		await blocked.taskManager.createTask({ title: "Blocked before backend" });
		let backendWasCalled = false;
		const blockedSpec = createSpec(blocked, {
			runId: "run-preflight-blocked",
			preflightCommands: [
				nodeCommand("process.stderr.write('nope'); process.exit(7)"),
			],
		});
		const blockedPrepared = await prepareTaskStep({
			spec: blockedSpec,
			fixture: blocked,
			backendRun: async () => {
				backendWasCalled = true;
				return successfulBackendResult();
			},
			events: [],
		});

		const blockedHandle = await blockedPrepared.backend.start(
			blockedPrepared.step,
		);
		await expect(blockedHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: "nope",
		});
		expect(backendWasCalled).toBe(false);

		const unchecked = await setupFixture("execution-unchecked-ac");
		await unchecked.taskManager.createTask({
			title: "Unverified criteria",
			acceptanceCriteria: ["Verified behavior"],
		});
		const uncheckedSpec = createSpec(unchecked, {
			runId: "run-unchecked-ac",
		});
		const uncheckedPrepared = await prepareTaskStep({
			spec: uncheckedSpec,
			fixture: unchecked,
			backendRun: async () => successfulBackendResult(),
			events: [],
		});

		const uncheckedHandle = await uncheckedPrepared.backend.start(
			uncheckedPrepared.step,
		);
		await expect(uncheckedHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("acceptance criteria still unchecked"),
		});
		expect((await unchecked.taskManager.getTask("TASK-1"))?.status).toBe(
			"Blocked",
		);

		const postflight = await setupFixture("execution-postflight-blocked");
		await postflight.taskManager.createTask({ title: "Postflight blocks" });
		const postflightSpec = createSpec(postflight, {
			runId: "run-postflight-blocked",
			postflightCommands: [
				nodeCommand("process.stderr.write('verify failed'); process.exit(1)"),
			],
		});
		const postflightPrepared = await prepareTaskStep({
			spec: postflightSpec,
			fixture: postflight,
			backendRun: async () => successfulBackendResult(),
			events: [],
		});

		const postflightHandle = await postflightPrepared.backend.start(
			postflightPrepared.step,
		);
		await expect(postflightHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("post-verify failed"),
		});

		const partial = await setupFixture("execution-partial-continue");
		await partial.taskManager.createTask({ title: "Partial can continue" });
		const partialSpec = createSpec(partial, {
			runId: "run-partial-continue",
			partialMode: "continue",
		});
		const partialPrepared = await prepareTaskStep({
			spec: partialSpec,
			fixture: partial,
			backendRun: async () => partialBackendResult(),
			events: [],
		});

		const partialHandle = await partialPrepared.backend.start(
			partialPrepared.step,
		);
		await expect(partialHandle.result).resolves.toMatchObject({
			outcome: "success",
			nextAction: "continue",
			summary: expect.stringContaining("partial"),
			artifacts: expect.arrayContaining([
				expect.objectContaining({
					kind: "drive-partial-continue",
					metadata: { taskId: "TASK-1" },
				}),
			]),
		});
		expect((await partial.taskManager.getTask("TASK-1"))?.status).toBe(
			"In Progress",
		);

		const timeout = await setupFixture("execution-timeout");
		await timeout.taskManager.createTask({ title: "Timed out" });
		const timeoutSpec = createSpec(timeout, {
			runId: "run-timeout",
			taskTimeoutMs: 10,
		});
		const timeoutPrepared = await prepareTaskStep({
			spec: timeoutSpec,
			fixture: timeout,
			backendRun: async (input) =>
				new Promise((_, reject) => {
					input.signal?.addEventListener("abort", () => {
						reject(new Error("backend aborted"));
					});
				}),
			events: [],
		});

		const timeoutHandle = await timeoutPrepared.backend.start(
			timeoutPrepared.step,
		);
		await expect(timeoutHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: "task timed out after 10ms",
		});
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-013
	test("registers only the selected drive backend with production recovery capabilities", async () => {
		const cases = [
			{
				name: "codex",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: false,
					isolatedFromHostSource: true,
					emitsMachineReport: true,
				},
			},
			{
				name: "claude-cli",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: true,
					isolatedFromHostSource: true,
					emitsMachineReport: true,
				},
			},
			{
				name: "cosmonauts-subagent",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: true,
					isolatedFromHostSource: false,
					emitsMachineReport: true,
				},
			},
		] as const;

		for (const { name, expected } of cases) {
			const fixture = await setupFixture(`map-${name}`);
			const spec = createSpec(fixture, {
				runId: `run-map-${name}`,
				backendName: name,
			});

			const backends = createDriveSchedulerBackendMap({
				spec,
				taskManager: fixture.taskManager,
				backend: createBackend({ name }),
				eventSink: fixture.recordEvent,
			});

			expect([...backends.keys()]).toEqual([name, "shell-command"]);
			expect(backends.get(name)?.capabilities).toEqual(
				DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name],
			);
			expect(backends.get(name)?.capabilities).toEqual(expected);
			expect(backends.get("shell-command")?.capabilities).toEqual({
				canResume: false,
				canCancel: false,
				canCommit: true,
				isolatedFromHostSource: false,
				emitsMachineReport: true,
			});
		}
	});

	test("retries a graph task once when a failed report contradicts an existing relative path", async () => {
		const fixture = await setupFixture("graph-contradicted-retry");
		await fixture.taskManager.createTask({
			title: "Retry contradicted block",
			description: "Use design/README.md.",
		});
		await mkdir(join(fixture.projectRoot, "design"), { recursive: true });
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"line one\nline two\n",
			"utf-8",
		);
		const events: DriverEvent[] = [];
		const backendRun = vi
			.fn()
			.mockResolvedValueOnce(
				blockedBackendResult(
					"design/README.md does not exist; confirmed via git ls-files.",
				),
			)
			.mockResolvedValueOnce(successfulBackendResult());
		const prepared = await prepareTaskStep({
			spec: createSpec(fixture, { runId: "run-graph-contradicted-retry" }),
			fixture,
			backendRun,
			events,
		});

		const handle = await prepared.backend.start(prepared.step);
		const result = await handle.result;

		expect(backendRun).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			outcome: "success",
			nextAction: "continue",
		});
		expect(
			events.filter((event) => event.type === "task_blocked"),
		).toHaveLength(1);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				contradicted: { path: "design/README.md", existsOnDisk: true },
			}),
		);
		const retryPrompt = await readFile(
			join(fixture.workdir, "prompts", "TASK-1.md"),
			"utf-8",
		);
		expect(retryPrompt).toContain("Note from the driver");
		expect(retryPrompt).toContain(
			join(fixture.projectRoot, "design", "README.md"),
		);
		expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
			"In Progress",
		);
	});

	test("does not retry a contradicted graph task when retryOnContradictedBlock is false", async () => {
		const fixture = await setupFixture("graph-contradicted-retry-disabled");
		await fixture.taskManager.createTask({
			title: "Retry disabled",
			description: "Use design/README.md.",
		});
		await mkdir(join(fixture.projectRoot, "design"), { recursive: true });
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"exists\n",
			"utf-8",
		);
		const events: DriverEvent[] = [];
		const backendRun = vi
			.fn()
			.mockResolvedValue(
				blockedBackendResult("design/README.md does not exist"),
			);
		const prepared = await prepareTaskStep({
			spec: createSpec(fixture, {
				runId: "run-graph-contradicted-retry-disabled",
				retryOnContradictedBlock: false,
			}),
			fixture,
			backendRun,
			events,
		});

		const handle = await prepared.backend.start(prepared.step);

		await expect(handle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("design/README.md"),
		});
		expect(backendRun).toHaveBeenCalledTimes(1);
		expect(
			events.filter((event) => event.type === "task_blocked"),
		).toHaveLength(1);
		expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
			"Blocked",
		);
	});
});

async function prepareTaskStep(options: {
	spec: DriverRunSpec;
	fixture: Fixture;
	backendRun: (input: BackendInvocation) => Promise<BackendRunResult>;
	events: DriverEvent[];
}) {
	const bridge = createDriveSchedulerBackend({
		spec: options.spec,
		taskManager: options.fixture.taskManager,
		backend: createBackend({ run: options.backendRun }),
		eventSink: async (event) => {
			options.events.push(event);
		},
	});
	const run = createRunRecord(options.spec);
	const stepRecord = createStepRecord(options.spec, "TASK-1");
	const schedulerInput = createSchedulerInput(stepRecord);
	const preparedStep = await bridge.prepare(
		stepRecord,
		createBackendContext(
			run,
			stepRecord,
			schedulerInput,
			new AbortController().signal,
		),
	);

	return { backend: bridge, step: preparedStep };
}

interface Fixture {
	projectRoot: string;
	workdir: string;
	taskManager: TaskManager;
	recordEvent: (event: DriverEvent) => Promise<void>;
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const workdir = join(temp.path, name, "workdir");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	return {
		projectRoot,
		workdir,
		taskManager,
		recordEvent: async () => {},
	};
}

function createSpec(
	fixture: Fixture,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-drive-scheduler",
		parentSessionId: PARENT_SESSION_ID,
		projectRoot: fixture.projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: ["TASK-1"],
		backendName: "codex",
		promptTemplate: { envelopePath: join(fixture.projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: fixture.workdir,
		eventLogPath: join(fixture.workdir, "events.jsonl"),
		...overrides,
	};
}

function createBackend(
	options: { name?: Backend["name"]; run?: Backend["run"] } = {},
): Backend {
	return {
		name: options.name ?? "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		async run(invocation) {
			return options.run?.(invocation) ?? successfulBackendResult();
		},
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
				notes: "done",
			}),
			"```",
			"outcome: success",
		].join("\n"),
		durationMs: 1,
	};
}

function partialBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "partial",
				files: [],
				verification: [],
				notes: "needs follow-up",
			}),
			"```",
			"outcome: partial",
		].join("\n"),
		durationMs: 1,
	};
}

function blockedBackendResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "failure",
				files: [],
				verification: [],
				notes,
			}),
			"```",
			"outcome: failure",
		].join("\n"),
		durationMs: 1,
	};
}

function createRunRecord(
	spec: DriverRunSpec,
	metadata: Record<string, unknown> = { driveTaskIds: spec.taskIds },
): RunRecord {
	return {
		scope: spec.planSlug,
		runId: spec.runId,
		status: "running",
		createdAt: "2026-06-04T00:00:00.000Z",
		updatedAt: "2026-06-04T00:00:00.000Z",
		runDir: spec.workdir,
		graphPath: join(spec.workdir, "graph.json"),
		eventsPath: join(spec.workdir, "orchestration-events.jsonl"),
		artifactsDir: join(spec.workdir, "artifacts"),
		schedulerStatePath: join(spec.workdir, "scheduler-state.json"),
		stepsDir: join(spec.workdir, "steps"),
		policy: {
			reportInference: "objective",
			defaultBackend: { name: spec.backendName },
			worktree: { mode: "shared", path: spec.workdir },
		},
		metadata,
	};
}

function createStepRecord(spec: DriverRunSpec, taskId: string): StepRecord {
	return {
		id: taskId,
		runId: spec.runId,
		title: `Drive task ${taskId}`,
		kind: "drive",
		backend: { name: spec.backendName },
		dependsOn: [],
		status: "ready",
		inputArtifacts: [
			{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
			{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
		],
		outputArtifacts: [],
	};
}

function createSchedulerInput(step: StepRecord): SchedulerStepInput {
	return {
		runId: step.runId,
		stepId: step.id,
		inputArtifacts: step.inputArtifacts,
		backendOptions: step.backend.options,
	};
}

function createBackendContext(
	run: RunRecord,
	step: StepRecord,
	input: SchedulerStepInput,
	signal: AbortSignal,
): BackendContext<SchedulerStepInput> {
	return {
		run,
		step,
		input,
		signal,
		attemptId: "attempt-001",
		now: () => "2026-06-04T00:00:00.000Z",
	};
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}
