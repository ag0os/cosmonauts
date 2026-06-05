import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import type { StoredOrchestrationEvent } from "../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const backendMocks = vi.hoisted(() => {
	const run =
		vi.fn<(invocation: BackendInvocation) => Promise<BackendRunResult>>();
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

const temp = useTempDir("orchestration-driver-tool-graph-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "driver-tool-graph-parent";

interface Fixture {
	projectRoot: string;
	envelopePath: string;
	taskId: string;
}

interface RunDriverResponse {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
	details: {
		runId: string;
		planSlug: string;
		workdir: string;
		eventLogPath: string;
	};
}

interface WatchEventsResponse {
	cursor: number;
	details: { events: DriverEvent[]; cursor: number };
	content: { type: "text"; text: string }[];
}

describe("run_driver graph compatibility", () => {
	beforeEach(() => {
		backendMocks.run.mockReset();
		backendMocks.createCosmonautsSubagentBackend.mockClear();
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-018
	test("preserves run_driver watch_events and avoids duplicate graph lifecycle events", async () => {
		const fixture = await setupFixture();
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		registerDriverTool(pi as never, runtimeFor(fixture), fixture.projectRoot);
		registerWatchEventsTool(pi as never);
		backendMocks.run.mockImplementation(async (invocation) => {
			await invocation.eventSink({
				type: "driver_activity",
				runId: invocation.runId,
				parentSessionId: invocation.parentSessionId,
				timestamp: new Date().toISOString(),
				taskId: invocation.taskId,
				activity: {
					kind: "tool_start",
					toolName: "stub-backend",
					summary: "graph-backed activity",
				},
			});
			return { exitCode: 0, stdout: "OUTCOME:success\n", durationMs: 1 };
		});

		const response = (await pi.callTool("run_driver", {
			planSlug: PLAN_SLUG,
			taskIds: [fixture.taskId],
			backend: "cosmonauts-subagent",
			mode: "inline",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
		})) as RunDriverResponse;
		await waitForCompletion(response.workdir);

		const firstWatch = (await pi.callTool("watch_events", {
			planSlug: PLAN_SLUG,
			runId: response.runId,
		})) as WatchEventsResponse;
		const secondWatch = (await pi.callTool("watch_events", {
			planSlug: PLAN_SLUG,
			runId: response.runId,
			since: firstWatch.cursor,
		})) as WatchEventsResponse;
		const normalizedEvents = await readStoredOrchestrationEvents(
			response.workdir,
		);
		const normalizedTypes = normalizedEvents.map((event) => event.event.type);

		expect(response).toMatchObject({
			runId: expect.stringMatching(/^run-/),
			planSlug: PLAN_SLUG,
			workdir: expect.stringContaining(response.runId),
			eventLogPath: join(response.workdir, "events.jsonl"),
			details: {
				runId: response.runId,
				planSlug: PLAN_SLUG,
				workdir: response.workdir,
				eventLogPath: response.eventLogPath,
			},
		});
		expect(firstWatch.details.events.map((event) => event.type)).toEqual([
			"run_started",
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"driver_activity",
			"spawn_completed",
			"task_done",
			"finalize",
			"plan_completion_candidate",
			"run_completed",
		]);
		expect(firstWatch.cursor).toBe(firstWatch.details.events.length);
		expect(firstWatch.content[0]?.text).toContain("driver_activity");
		expect(firstWatch.content[0]?.text).toContain("run_completed");
		expect(firstWatch.content[0]?.text).toContain(
			`cursor ${firstWatch.cursor}`,
		);
		expect(secondWatch.details.events).toEqual([]);
		expect(secondWatch.cursor).toBe(firstWatch.cursor);
		expect(secondWatch.content[0]?.text).toBe(
			`No new driver events; cursor ${firstWatch.cursor}`,
		);
		expect(countType(normalizedTypes, "run_started")).toBe(1);
		expect(countType(normalizedTypes, "run_completed")).toBe(1);
		expect(
			countStepLifecycle(normalizedEvents, "step_ready", fixture.taskId),
		).toBe(1);
		expect(
			countStepLifecycle(normalizedEvents, "step_started", fixture.taskId),
		).toBe(1);
		expect(
			countStepLifecycle(normalizedEvents, "step_completed", fixture.taskId),
		).toBe(1);
		expect(normalizedEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					event: expect.objectContaining({
						type: "step_tool_activity",
						stepId: fixture.taskId,
					}),
				}),
			]),
		);
		expect(normalizedTypes).not.toContain("run_failed");
		expect(normalizedTypes).not.toContain("run_blocked");
	});
});

async function setupFixture(): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	await mkdir(projectRoot, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Graph driver compatibility task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	const envelopePath = join(projectRoot, "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");
	return { projectRoot, envelopePath, taskId: task.id };
}

function runtimeFor(fixture: Fixture) {
	return async () =>
		({
			agentRegistry: {},
			domainResolver: {},
			domainsDir: fixture.projectRoot,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
		}) as never;
}

async function waitForCompletion(workdir: string): Promise<void> {
	const completionPath = join(workdir, "run.completion.json");
	const deadline = Date.now() + 5_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await readFile(completionPath, "utf-8");
			return;
		} catch (error) {
			lastError = error;
		}
		await delay(10);
	}
	throw new Error(
		`Timed out waiting for run completion in ${completionPath}: ${formatError(lastError)}`,
	);
}

async function readStoredOrchestrationEvents(
	workdir: string,
): Promise<StoredOrchestrationEvent[]> {
	const raw = await readFile(
		join(workdir, "orchestration-events.jsonl"),
		"utf-8",
	);
	return raw
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown)
		.filter(isStoredOrchestrationEvent);
}

function countType(types: string[], type: string): number {
	return types.filter((candidate) => candidate === type).length;
}

function countStepLifecycle(
	events: StoredOrchestrationEvent[],
	type: string,
	stepId: string,
): number {
	return events.filter(
		(envelope) =>
			envelope.event.type === type &&
			"stepId" in envelope.event &&
			envelope.event.stepId === stepId,
	).length;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isStoredOrchestrationEvent(
	value: unknown,
): value is StoredOrchestrationEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		"event" in value &&
		typeof value.event === "object" &&
		value.event !== null
	);
}
