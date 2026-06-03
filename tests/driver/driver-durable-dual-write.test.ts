import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { registerRunControlTools } from "../../domains/shared/extensions/orchestration/run-control-tools.ts";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runInline } from "../../lib/driver/driver.ts";
import {
	type DriverEventBusEvent,
	tailEvents,
} from "../../lib/driver/event-stream.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import {
	FileRunStore,
	runStatus,
	runWatch,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { createMockPi } from "../extensions/orchestration-helpers.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-durable-dual-write-");
const PLAN_SLUG = "durable-drive-plan";
const PARENT_SESSION_ID = "durable-parent-session";

describe("driver durable dual-write", () => {
	// @cosmo-behavior plan:durable-run-store-events#B-006
	test("writes normalized events alongside unchanged legacy driver events", async () => {
		const fixture = await setupFixture({ taskCount: 1 });

		const result = await runDrive(fixture);
		const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);
		const storedEvents = await readStoredEvents(result.runId);
		const runRecord = JSON.parse(
			await readFile(join(fixture.spec.workdir, "run.json"), "utf-8"),
		) as { eventsPath: string };

		expect(legacyEvents.map((event) => event.type)).toEqual([
			"run_started",
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
			"finalize",
			"plan_completion_candidate",
			"run_completed",
		]);
		expect(storedEvents.map((event) => event.event.type)).toEqual([
			"run_started",
			"step_ready",
			"step_tool_activity",
			"step_tool_activity",
			"step_started",
			"step_tool_activity",
			"step_completed",
			"run_completed",
		]);
		expect(runRecord.eventsPath).toBe(
			join(fixture.spec.workdir, "orchestration-events.jsonl"),
		);

		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		registerWatchEventsTool(pi as never);
		const watched = (await pi.callTool("watch_events", {
			planSlug: PLAN_SLUG,
			runId: result.runId,
		})) as {
			cursor: number;
			details: { events: DriverEvent[]; cursor: number };
			content: { text: string }[];
		};

		expect(watched.cursor).toBe(legacyEvents.length);
		expect(watched.details.events).toEqual(legacyEvents);
		expect(watched.content[0]?.text).toContain("run_completed");
		expect(watched.content[0]?.text).toContain(`cursor ${legacyEvents.length}`);
	});

	// @cosmo-behavior plan:durable-run-store-events#B-007
	test("continues the drive run when normalized event append fails", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const diagnostics = captureDurableDiagnostics();
		const published: DriverEvent[] = [];
		const token = activityBus.subscribe<DriverEventBusEvent>(
			"driver_event",
			(event) => {
				if (event.runId === fixture.runId) {
					published.push(event.event);
				}
			},
		);
		try {
			const result = await runDrive(fixture, {
				backendRun: async (invocation) => {
					await replaceNormalizedLogWithDirectory(invocation.workdir);
					return successResult();
				},
			});

			expect(result.outcome).toBe("completed");
			expect(await readLegacyEvents(fixture.spec.eventLogPath)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "run_completed" }),
				]),
			);
			expect(published).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "task_done" }),
					expect.objectContaining({ type: "run_completed" }),
				]),
			);
			expect(diagnostics.records()).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "drive_durable_event_diagnostic",
						code: "drive_durable_event_append_failed",
					}),
				]),
			);
			expect(
				diagnostics
					.records()
					.map((record) => String(record.details?.error ?? ""))
					.join("\n"),
			).not.toContain("EventLogWriteError");
		} finally {
			activityBus.unsubscribe(token);
			diagnostics.restore();
		}
	});

	// @cosmo-behavior plan:durable-run-store-events#B-016
	test("reports normalized status and events from a drive-produced run record events path", async () => {
		const fixture = await setupFixture({ taskCount: 1 });

		const result = await runDrive(fixture);
		const store = new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		});
		const record = await store.loadRun({
			scope: PLAN_SLUG,
			runId: result.runId,
		});
		const firstPage = await runWatch(
			store,
			{ scope: PLAN_SLUG, runId: result.runId },
			{ limit: 2 },
		);
		const secondPage = await runWatch(
			store,
			{
				scope: PLAN_SLUG,
				runId: result.runId,
			},
			{
				sinceSeq: 2,
			},
		);
		const status = await runStatus(store, {
			scope: PLAN_SLUG,
			runId: result.runId,
		});

		expect(record?.eventsPath).toBe(
			join(fixture.spec.workdir, "orchestration-events.jsonl"),
		);
		expect(firstPage.events.map((event) => event.seq)).toEqual([1, 2]);
		expect(secondPage.events.map((event) => event.seq)).toEqual(
			expect.arrayContaining([3, 4, 5]),
		);
		expect(status).toMatchObject({
			status: "completed",
			statusSource: "event",
			eventStatus: "completed",
		});
		expect(await readLegacyEvents(fixture.spec.eventLogPath)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "run_completed" }),
			]),
		);

		const pi = createMockPi(fixture.projectRoot);
		registerRunControlTools(pi as never);
		const toolWatch = (await pi.callTool("run_watch", {
			scope: PLAN_SLUG,
			runId: result.runId,
			sinceSeq: 1,
			limit: 1,
		})) as { cursor: number; events: Array<{ seq: number }> };
		const toolStatus = (await pi.callTool("run_status", {
			scope: PLAN_SLUG,
			runId: result.runId,
		})) as { details: { status: string; statusSource: string } };
		expect(toolWatch.cursor).toBe(firstPage.cursor);
		expect(toolWatch.events[0]?.seq).toBe(2);
		expect(toolStatus.details).toMatchObject({
			status: "completed",
			statusSource: "event",
		});
	});

	// @cosmo-behavior plan:durable-run-store-events#B-017
	test("continues the drive run when run record creation fails before the first event", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await mkdir(join(fixture.spec.workdir, "run.json"), { recursive: true });
		const diagnostics = captureDurableDiagnostics();
		try {
			const result = await runDrive(fixture);
			const legacyEvents = await readLegacyEvents(fixture.spec.eventLogPath);

			expect(result.outcome).toBe("completed");
			expect(legacyEvents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "run_started" }),
					expect.objectContaining({ type: "task_done" }),
					expect.objectContaining({ type: "run_completed" }),
				]),
			);
			expect(diagnostics.records()).toEqual([
				expect.objectContaining({
					type: "drive_durable_event_diagnostic",
					code: "drive_durable_run_setup_failed",
					details: expect.objectContaining({
						legacyEventType: "run_started",
					}),
				}),
			]);
			expect(existsSync(join(fixture.spec.workdir, "run.json"))).toBe(true);
		} finally {
			diagnostics.restore();
		}
	});
});

interface Fixture {
	projectRoot: string;
	taskManager: TaskManager;
	taskIds: string[];
	runId: string;
	spec: DriverRunSpec;
}

interface RunDriveOptions {
	backendRun?: (invocation: BackendInvocation) => Promise<BackendRunResult>;
}

async function setupFixture({
	taskCount,
}: {
	taskCount: number;
}): Promise<Fixture> {
	const projectRoot = temp.path;
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Durable Drive Task ${index + 1}`,
			labels: [`plan:${PLAN_SLUG}`],
		});
		taskIds.push(task.id);
	}
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Drive envelope\n", "utf-8");

	const runId = `run-${taskIds.join("-").toLowerCase()}`;
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		runId,
	);
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds,
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });

	return { projectRoot, taskManager, taskIds, runId, spec };
}

async function runDrive(
	fixture: Fixture,
	options: RunDriveOptions = {},
): Promise<DriverResult> {
	const backend: Backend = {
		name: "fake-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: options.backendRun ?? (async () => successResult()),
	};
	const handle = runInline(fixture.spec, {
		taskManager: fixture.taskManager,
		backend,
		activityBus,
		cosmonautsRoot: fixture.projectRoot,
	});
	return await handle.result;
}

function successResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: "OUTCOME:success\n",
		durationMs: 1,
	};
}

async function readLegacyEvents(path: string): Promise<DriverEvent[]> {
	return (await tailEvents(path)).events;
}

async function readStoredEvents(
	runId: string,
): Promise<StoredOrchestrationEvent[]> {
	const raw = await readFile(
		join(
			temp.path,
			"missions",
			"sessions",
			PLAN_SLUG,
			"runs",
			runId,
			"orchestration-events.jsonl",
		),
		"utf-8",
	);
	return raw
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as StoredOrchestrationEvent);
}

async function replaceNormalizedLogWithDirectory(
	workdir: string,
): Promise<void> {
	const path = join(workdir, "orchestration-events.jsonl");
	await rm(path, { force: true });
	await mkdir(path, { recursive: true });
}

function captureDurableDiagnostics(): {
	records(): Array<{
		type?: string;
		code?: string;
		details?: { error?: string };
	}>;
	restore(): void;
} {
	const records: Array<{
		type?: string;
		code?: string;
		details?: { error?: string };
	}> = [];
	const spy = vi.spyOn(console, "error").mockImplementation((value) => {
		if (typeof value !== "string") {
			return;
		}
		try {
			const parsed = JSON.parse(value) as {
				type?: string;
				code?: string;
				details?: { error?: string };
			};
			if (parsed.type === "drive_durable_event_diagnostic") {
				records.push(parsed);
			}
		} catch {
			return;
		}
	});
	return {
		records: () => records,
		restore: () => spy.mockRestore(),
	};
}
