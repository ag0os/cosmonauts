import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { runDriveOnGraph } from "../../lib/driver/drive-graph-runner.ts";
import { listPendingPlanTaskIds } from "../../lib/driver/task-selection.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-cancelled-dependency-");
const PLAN_SLUG = "x";

describe("Drive and a Cancelled dependency", { timeout: 30_000 }, () => {
	test("never runs a task whose dependency is Cancelled, and names the dependency", async () => {
		const fixture = await setupFixture("active-cancelled");
		const dependency = await fixture.taskManager.createTask({
			title: "Superseded",
			labels: [`plan:${PLAN_SLUG}`],
		});
		await fixture.taskManager.updateTask(dependency.id, {
			status: "Cancelled",
		});
		const dependent = await fixture.taskManager.createTask({
			title: "Dependent",
			labels: [`plan:${PLAN_SLUG}`],
			dependencies: [dependency.id],
		});

		const taskIds = await listPendingPlanTaskIds(
			fixture.taskManager,
			PLAN_SLUG,
		);
		const backend = createBackend();
		const result = await runDriveOnGraph(
			fixture.spec(taskIds),
			fixture.context(backend),
		);

		expect(taskIds).toEqual([dependent.id]);
		expect(backend.startedTaskIds).toEqual([]);
		expect(result).toMatchObject({
			outcome: "blocked",
			tasksDone: 0,
			blockedTaskId: dependent.id,
		});
		expect(result.outcome === "blocked" && result.blockedReason).toContain(
			`${dependency.id} is Cancelled`,
		);
		expect((await fixture.taskManager.getTask(dependent.id))?.status).not.toBe(
			"Done",
		);
		expect(fixture.events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				taskId: dependent.id,
				reason: expect.stringContaining(dependency.id),
			}),
		);
	});

	test("never runs a task whose dependency was archived Cancelled", async () => {
		const fixture = await setupFixture("archived-cancelled");
		const dependency = await fixture.taskManager.createTask({
			title: "Superseded",
		});
		await fixture.taskManager.updateTask(dependency.id, {
			status: "Cancelled",
		});
		await archiveTask(fixture.projectRoot, `${dependency.id} - Superseded.md`);
		const dependent = await fixture.taskManager.createTask({
			title: "Dependent",
			dependencies: [dependency.id],
		});

		const backend = createBackend();
		const result = await runDriveOnGraph(
			fixture.spec([dependent.id]),
			fixture.context(backend),
		);

		expect(backend.startedTaskIds).toEqual([]);
		expect(result).toMatchObject({
			outcome: "blocked",
			blockedTaskId: dependent.id,
		});
		expect(result.outcome === "blocked" && result.blockedReason).toContain(
			`${dependency.id} is Cancelled`,
		);
	});

	test("runs a task whose dependency was archived Done", async () => {
		const fixture = await setupFixture("archived-done");
		const dependency = await fixture.taskManager.createTask({
			title: "Shipped",
		});
		await fixture.taskManager.updateTask(dependency.id, { status: "Done" });
		await archiveTask(fixture.projectRoot, `${dependency.id} - Shipped.md`);
		const dependent = await fixture.taskManager.createTask({
			title: "Dependent",
			dependencies: [dependency.id],
		});

		const backend = createBackend();
		const result = await runDriveOnGraph(
			fixture.spec([dependent.id]),
			fixture.context(backend),
		);

		expect(backend.startedTaskIds).toEqual([dependent.id]);
		expect(result).toMatchObject({ outcome: "completed", tasksDone: 1 });
	});

	test("runs a dependency and its dependent selected together, in graph order", async () => {
		const fixture = await setupFixture("same-run");
		const dependency = await fixture.taskManager.createTask({ title: "First" });
		const dependent = await fixture.taskManager.createTask({
			title: "Second",
			dependencies: [dependency.id],
		});

		const backend = createBackend();
		const result = await runDriveOnGraph(
			fixture.spec([dependency.id, dependent.id]),
			fixture.context(backend),
		);

		expect(backend.startedTaskIds).toEqual([dependency.id, dependent.id]);
		expect(result).toMatchObject({ outcome: "completed", tasksDone: 2 });
	});
});

interface Fixture {
	projectRoot: string;
	taskManager: TaskManager;
	events: DriverEvent[];
	spec(taskIds: string[]): DriverRunSpec;
	context(backend: Backend): Parameters<typeof runDriveOnGraph>[1];
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name);
	const runId = `run-${name}`;
	const workdir = join(projectRoot, "missions", "sessions", PLAN_SLUG, runId);
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const events: DriverEvent[] = [];
	return {
		projectRoot,
		taskManager,
		events,
		spec: (taskIds) => ({
			runId,
			parentSessionId: "drive-cancelled-dependency-parent",
			projectRoot,
			planSlug: PLAN_SLUG,
			taskIds,
			backendName: "codex",
			promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
			preflightCommands: [],
			postflightCommands: [],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
			taskTimeoutMs: 10_000,
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
		}),
		context: (backend) => ({
			taskManager,
			backend,
			eventSink: async (event: DriverEvent) => {
				events.push(event);
			},
			parentSessionId: "drive-cancelled-dependency-parent",
			runId,
			abortSignal: new AbortController().signal,
			cosmonautsRoot: resolve("."),
			mode: "inline" as const,
		}),
	};
}

async function archiveTask(projectRoot: string, filename: string) {
	const archiveDir = join(projectRoot, "missions", "archive", "tasks");
	await mkdir(archiveDir, { recursive: true });
	const activePath = join(projectRoot, "missions", "tasks", filename);
	await writeFile(join(archiveDir, filename), await readFile(activePath));
	await rm(activePath);
}

function createBackend(): Backend & { startedTaskIds: string[] } {
	const startedTaskIds: string[] = [];
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		startedTaskIds,
		async run(invocation) {
			startedTaskIds.push(invocation.taskId);
			return successfulBackendResult(`completed ${invocation.taskId}`);
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
