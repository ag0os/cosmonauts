import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import type {
	DriverActivityBusEvent,
	DriverBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import { tailEvents } from "../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { TaskUpdateInput } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

type BackendRun = (invocation: BackendInvocation) => Promise<BackendRunResult>;

const backendMocks = vi.hoisted(() => {
	const run = vi.fn<BackendRun>();
	return {
		run,
		createCosmonautsSubagentBackend: vi.fn((): Backend => {
			return {
				name: "cosmonauts-subagent",
				capabilities: {
					canCommit: true,
					isolatedFromHostSource: false,
				},
				run,
			};
		}),
	};
});

vi.mock("../../lib/driver/backends/cosmonauts-subagent.ts", () => ({
	createCosmonautsSubagentBackend: backendMocks.createCosmonautsSubagentBackend,
}));

const temp = useTempDir("driver-e2e-test-");
const execFileAsync = promisify(execFile);
const PLAN_SLUG = "driver-e2e";
const PARENT_SESSION_ID = "driver-e2e-parent-session";
const TERMINAL_EVENTS = new Set<DriverEvent["type"]>([
	"run_completed",
	"run_aborted",
]);

describe("driver e2e run_driver integration", () => {
	beforeEach(() => {
		backendMocks.run.mockReset();
		backendMocks.createCosmonautsSubagentBackend.mockClear();
	});

	test("driver e2e happy path completes two tasks and tails JSONL events", async () => {
		const fixture = await setupFixture({ taskCount: 2 });
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		const busCapture = captureDriverBusEvents(
			fixture.projectRoot,
			fixture.planSlug,
		);
		backendMocks.run.mockImplementation(async (invocation) => {
			await emitBackendActivity(invocation);
			return successResult();
		});

		try {
			const result = await runDriver(fixture);
			const events = await waitForTerminalEvents(result.eventLogPath);
			const tailed = await tailEvents(result.eventLogPath);
			const tasks = await Promise.all(
				fixture.taskIds.map((taskId) => fixture.taskManager.getTask(taskId)),
			);

			expect(tasks.map((task) => task?.status)).toEqual(["Done", "Done"]);
			expect(updateStatuses(updateSpy)).toEqual([
				"In Progress",
				"Done",
				"In Progress",
				"Done",
			]);
			expect(events[0]).toMatchObject({ type: "run_started" });
			expect(events.filter(isTaskDone)).toHaveLength(2);
			expect(events.at(-1)).toMatchObject({
				type: "run_completed",
				summary: { total: 2, done: 2, blocked: 0 },
			});
			expect(tailed.events).toEqual(events);
			expect(tailed.cursor).toBe(events.length);
			expect(
				(await tailEvents(result.eventLogPath, tailed.cursor)).events,
			).toEqual([]);
			expect(backendMocks.run).toHaveBeenCalledTimes(2);
			expect(busCapture.types()).toContain("driver_activity");
			expect(busCapture.types()).toContain("driver_event");
			expect(busCapture.types()).not.toContain("spawn_activity");
			expect(busCapture.spawnEvents).toEqual([]);
			expect(busCapture.persistenceErrors).toEqual([]);
		} finally {
			busCapture.dispose();
		}
	});

	test("driver preflight failure aborts without task status updates", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, {
			preflightCommands: [
				nodeCommand(
					"process.stderr.write('preflight failed'); process.exit(7)",
				),
			],
		});
		const events = await waitForTerminalEvents(result.eventLogPath);
		const task = await fixture.taskManager.getTask(onlyTaskId(fixture));

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "run_aborted",
				reason: expect.stringContaining("preflight failed"),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "preflight",
				status: "failed",
				details: expect.objectContaining({ command: expect.any(String) }),
			}),
		);
		expect(updateSpy).not.toHaveBeenCalled();
		expect(task?.status).toBe("To Do");
		expect(backendMocks.run).not.toHaveBeenCalled();
	});

	test("driver branch mismatch emits structured preflight failure before transitions", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await initGit(fixture.projectRoot);
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, { branch: "not-main" });
		const events = await waitForTerminalEvents(result.eventLogPath);
		const failedPreflightIndex = events.findIndex(
			(event) => event.type === "preflight" && event.status === "failed",
		);
		const abortedIndex = events.findIndex(
			(event) => event.type === "run_aborted",
		);

		expect(failedPreflightIndex).toBeGreaterThanOrEqual(0);
		expect(abortedIndex).toBeGreaterThan(failedPreflightIndex);
		expect(events[failedPreflightIndex]).toMatchObject({
			type: "preflight",
			status: "failed",
			details: {
				branch: "main",
				stderr: expect.stringContaining("branch mismatch"),
			},
		});
		expect(updateSpy).not.toHaveBeenCalled();
		expect(backendMocks.run).not.toHaveBeenCalled();
	});

	test("driver postverify failure blocks task and does not commit", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await initGit(fixture.projectRoot);
		const beforeHead = await git(fixture.projectRoot, ["rev-parse", "HEAD"]);
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockImplementation(async (invocation) => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", `${invocation.taskId}.txt`),
				"uncommitted\n",
				"utf-8",
			);
			return unknownResult();
		});

		const result = await runDriver(fixture, {
			commitPolicy: "driver-commits",
			postflightCommands: [
				nodeCommand("process.stderr.write('verify failed'); process.exit(3)"),
			],
		});
		const events = await waitForTerminalEvents(result.eventLogPath);
		const task = await fixture.taskManager.getTask(onlyTaskId(fixture));
		const afterHead = await git(fixture.projectRoot, ["rev-parse", "HEAD"]);

		const specDebug = await readFile(
			join(result.workdir, "spec.json"),
			"utf-8",
		);
		expect(
			task?.status,
			`${specDebug}\n${events.map((event) => JSON.stringify(event)).join("\n")}`,
		).toBe("Blocked");
		expect(task?.implementationNotes).toContain("post-verify failed");
		expect(updateStatuses(updateSpy)).toEqual(["In Progress", "Blocked"]);
		const blockedUpdate = updateSpy.mock.calls.at(-1)?.[1] as
			| TaskUpdateInput
			| undefined;
		expect(blockedUpdate).toMatchObject({
			status: "Blocked",
			implementationNotes: expect.stringContaining("verify failed"),
		});
		expect(blockedUpdate).not.toHaveProperty("note");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				reason: expect.stringContaining("post-verify failed"),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "run_aborted",
				reason: expect.stringContaining("post-verify failed"),
			}),
		);
		expect(events.map((event) => event.type)).not.toContain("commit_made");
		expect(afterHead.trim()).toBe(beforeHead.trim());
		expect(
			await git(fixture.projectRoot, ["diff", "--cached", "--name-only"]),
		).toBe("");
	});
});

interface Fixture {
	projectRoot: string;
	planSlug: string;
	envelopePath: string;
	taskIds: string[];
	taskManager: TaskManager;
}

interface DriverResultDetails {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

interface RunDriverOverrides {
	branch?: string;
	commitPolicy?: "driver-commits" | "backend-commits" | "no-commit";
	preflightCommands?: string[];
	postflightCommands?: string[];
}

function onlyTaskId(fixture: Fixture): string {
	const taskId = fixture.taskIds[0];
	if (!taskId) {
		throw new Error("expected fixture task");
	}
	return taskId;
}

async function setupFixture({
	taskCount,
}: {
	taskCount: number;
}): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	await mkdir(projectRoot, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();

	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Driver E2E Task ${index + 1}`,
			labels: [`plan:${PLAN_SLUG}`],
		});
		taskIds.push(task.id);
	}

	const envelopePath = join(projectRoot, "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");

	return {
		projectRoot,
		planSlug: PLAN_SLUG,
		envelopePath,
		taskIds,
		taskManager,
	};
}

async function runDriver(
	fixture: Fixture,
	overrides: RunDriverOverrides = {},
): Promise<DriverResultDetails> {
	const pi = createMockPi(fixture.projectRoot, {
		sessionId: PARENT_SESSION_ID,
	});
	registerDriverTool(
		pi as never,
		async () =>
			({
				agentRegistry: {},
				domainResolver: {},
				domainsDir: fixture.projectRoot,
				domainContext: "coding",
				projectSkills: [],
				skillPaths: [],
			}) as never,
	);
	registerWatchEventsTool(pi as never);

	const tool = pi.getTool("run_driver") as
		| { execute: unknown; parameters: unknown }
		| undefined;
	expect(tool?.execute).toBeTypeOf("function");
	expect(tool?.parameters).toBeDefined();

	const response = (await pi.callTool("run_driver", {
		planSlug: fixture.planSlug,
		taskIds: fixture.taskIds,
		backend: "cosmonauts-subagent",
		mode: "inline",
		envelopePath: fixture.envelopePath,
		commitPolicy: overrides.commitPolicy ?? "no-commit",
		preflightCommands: overrides.preflightCommands ?? [],
		postflightCommands: overrides.postflightCommands ?? [],
		branch: overrides.branch,
	})) as { details: DriverResultDetails };

	return response.details;
}

async function waitForTerminalEvents(
	eventLogPath: string,
): Promise<DriverEvent[]> {
	const deadline = Date.now() + 5_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const { events } = await tailEvents(eventLogPath);
			if (events.some((event) => TERMINAL_EVENTS.has(event.type))) {
				return events;
			}
		} catch (error) {
			lastError = error;
		}
		await delay(10);
	}

	throw new Error(
		`Timed out waiting for terminal driver event in ${eventLogPath}: ${formatError(lastError)}`,
	);
}

function captureDriverBusEvents(
	projectRoot: string,
	planSlug: string,
): {
	busEvents: DriverBusEvent[];
	spawnEvents: SpawnActivityEvent[];
	persistenceErrors: string[];
	types(): string[];
	dispose(): void;
} {
	const busEvents: DriverBusEvent[] = [];
	const spawnEvents: SpawnActivityEvent[] = [];
	const persistenceErrors: string[] = [];
	const tokens = [
		activityBus.subscribe<DriverActivityBusEvent>(
			"driver_activity",
			(event) => {
				recordPersistenceCheck(projectRoot, planSlug, event, persistenceErrors);
				busEvents.push(event);
			},
		),
		activityBus.subscribe<DriverEventBusEvent>("driver_event", (event) => {
			recordPersistenceCheck(projectRoot, planSlug, event, persistenceErrors);
			busEvents.push(event);
		}),
		activityBus.subscribe<SpawnActivityEvent>("spawn_activity", (event) => {
			spawnEvents.push(event);
		}),
	];

	return {
		busEvents,
		spawnEvents,
		persistenceErrors,
		types: () => [
			...busEvents.map((event) => event.type),
			...spawnEvents.map((event) => event.type),
		],
		dispose() {
			for (const token of tokens) {
				activityBus.unsubscribe(token);
			}
		},
	};
}

function recordPersistenceCheck(
	projectRoot: string,
	planSlug: string,
	busEvent: DriverBusEvent,
	errors: string[],
): void {
	try {
		const logPath = join(
			projectRoot,
			"missions",
			"sessions",
			planSlug,
			"runs",
			busEvent.runId,
			"events.jsonl",
		);
		const loggedEvents = readLoggedEvents(logPath);
		const wasPersisted = loggedEvents.some((event) => {
			if (busEvent.type === "driver_event") {
				return JSON.stringify(event) === JSON.stringify(busEvent.event);
			}

			return (
				event.type === "driver_activity" &&
				event.runId === busEvent.runId &&
				event.parentSessionId === busEvent.parentSessionId &&
				event.taskId === busEvent.taskId &&
				JSON.stringify(event.activity) === JSON.stringify(busEvent.activity)
			);
		});
		if (!wasPersisted) {
			errors.push(`bus event ${busEvent.type} published before JSONL append`);
		}
	} catch (error) {
		errors.push(formatError(error));
	}
}

function readLoggedEvents(logPath: string): DriverEvent[] {
	return readFileSync(logPath, "utf-8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as DriverEvent);
}

async function emitBackendActivity(
	invocation: BackendInvocation,
): Promise<void> {
	await invocation.eventSink({
		type: "driver_activity",
		runId: invocation.runId,
		parentSessionId: invocation.parentSessionId,
		timestamp: new Date().toISOString(),
		taskId: invocation.taskId,
		activity: {
			kind: "tool_start",
			toolName: "stub-backend",
			summary: `stubbed ${invocation.taskId}`,
		},
	});
}

function successResult(): BackendRunResult {
	return { exitCode: 0, stdout: "OUTCOME:success\n", durationMs: 1 };
}

function unknownResult(): BackendRunResult {
	return { exitCode: 0, stdout: "no structured report\n", durationMs: 1 };
}

function updateStatuses(updateSpy: {
	mock: { calls: Array<unknown[]> };
}): Array<TaskUpdateInput["status"]> {
	return updateSpy.mock.calls.map(
		(call) => (call[1] as TaskUpdateInput).status,
	);
}

function isTaskDone(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "task_done" }> {
	return event.type === "task_done";
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await git(projectRoot, ["add", "."]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
