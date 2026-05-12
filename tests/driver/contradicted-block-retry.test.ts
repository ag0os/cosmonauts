import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	type RunOneTaskCtx,
	runOneTask,
} from "../../lib/driver/run-one-task.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	Report,
} from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("contradicted-block-retry-");

describe("contradicted-block retry", () => {
	test("retries once when the blocked reason names a file that exists on disk, then ends Done", async () => {
		const fixture = await setupFixture({ withDesignReadme: true });
		const events: DriverEvent[] = [];
		const backend = createSequencedBackend([
			blockResult(
				"design/README.md does not exist; confirmed via git ls-files.",
			),
			successResult(),
		]);

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(backend.run).toHaveBeenCalledTimes(2);
		expect(outcome).toMatchObject({ status: "done" });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Done",
		);
		const blocked = events.find(
			(event): event is Extract<DriverEvent, { type: "task_blocked" }> =>
				event.type === "task_blocked",
		);
		expect(blocked?.contradicted).toEqual({
			path: "design/README.md",
			existsOnDisk: true,
		});

		// The retry prompt carries the driver note pointing at the absolute path.
		const retryPrompt = await readPrompt(fixture, fixture.taskId);
		expect(retryPrompt).toContain("Note from the driver");
		expect(retryPrompt).toContain(
			join(fixture.projectRoot, "design", "README.md"),
		);
	});

	test("does not retry when the named file is genuinely absent; ends Blocked", async () => {
		const fixture = await setupFixture({ withDesignReadme: false });
		const events: DriverEvent[] = [];
		const backend = createSequencedBackend([
			blockResult("design/README.md does not exist"),
			successResult(),
		]);

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(backend.run).toHaveBeenCalledTimes(1);
		expect(outcome).toMatchObject({ status: "blocked" });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Blocked",
		);
		const blocked = events.find(
			(event): event is Extract<DriverEvent, { type: "task_blocked" }> =>
				event.type === "task_blocked",
		);
		expect(blocked?.contradicted).toBeUndefined();
	});

	test("retry is disabled when retryOnContradictedBlock is false", async () => {
		const fixture = await setupFixture({ withDesignReadme: true });
		const events: DriverEvent[] = [];
		const backend = createSequencedBackend([
			blockResult("design/README.md does not exist"),
			successResult(),
		]);

		const outcome = await runOneTask(
			createSpec(fixture, { retryOnContradictedBlock: false }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(backend.run).toHaveBeenCalledTimes(1);
		expect(outcome).toMatchObject({ status: "blocked" });
	});

	test("backends receive cwd === projectRoot via the invocation", async () => {
		const fixture = await setupFixture({ withDesignReadme: true });
		const events: DriverEvent[] = [];
		let observedProjectRoot: string | undefined;
		const backend: Backend & { run: ReturnType<typeof vi.fn> } = {
			name: "recording-backend",
			capabilities: { canCommit: false, isolatedFromHostSource: false },
			run: vi.fn(async (invocation: BackendInvocation) => {
				observedProjectRoot = invocation.projectRoot;
				return successResult();
			}),
		};

		await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(observedProjectRoot).toBe(fixture.projectRoot);
	});

	test("stops at one retry even if the second attempt also blocks", async () => {
		const fixture = await setupFixture({ withDesignReadme: true });
		const events: DriverEvent[] = [];
		const backend = createSequencedBackend([
			blockResult("design/README.md does not exist"),
			blockResult("design/README.md still missing"),
		]);

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(backend.run).toHaveBeenCalledTimes(2);
		expect(outcome).toMatchObject({ status: "blocked" });
		const blockedEvents = events.filter(
			(event) => event.type === "task_blocked",
		);
		expect(blockedEvents).toHaveLength(2);
	});
});

interface Fixture {
	projectRoot: string;
	workdir: string;
	envelopePath: string;
	taskId: string;
	taskManager: TaskManager;
}

async function setupFixture(options: {
	withDesignReadme: boolean;
}): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	const workdir = join(temp.path, "run");
	const templateDir = join(temp.path, "templates");
	await mkdir(workdir, { recursive: true });
	await mkdir(templateDir, { recursive: true });

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Contradicted Block Fixture",
		description: "Implement this fixture task using design/README.md.",
	});

	if (options.withDesignReadme) {
		await mkdir(join(projectRoot, "design"), { recursive: true });
		await writeFile(
			join(projectRoot, "design", "README.md"),
			"line one\nline two\n",
			"utf-8",
		);
	}

	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Envelope instructions", "utf-8");

	return { projectRoot, workdir, envelopePath, taskId: task.id, taskManager };
}

function createSpec(
	fixture: Fixture,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-304",
		parentSessionId: "parent-session-304",
		projectRoot: fixture.projectRoot,
		planSlug: "drive-smoke-fixes",
		taskIds: [fixture.taskId],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: fixture.envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: fixture.workdir,
		eventLogPath: join(fixture.workdir, "events.jsonl"),
		...overrides,
	};
}

function createCtx(
	fixture: Fixture,
	backend: Backend,
	events: DriverEvent[],
): RunOneTaskCtx {
	const eventSink: EventSink = async (event) => {
		events.push(event);
	};
	return {
		taskManager: fixture.taskManager,
		backend,
		eventSink,
		parentSessionId: "parent-session-304",
		runId: "run-304",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: fixture.projectRoot,
	};
}

function createSequencedBackend(
	results: BackendRunResult[],
): Backend & { run: ReturnType<typeof vi.fn> } {
	let index = 0;
	return {
		name: "sequenced-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: false },
		run: vi.fn(async (): Promise<BackendRunResult> => {
			const result =
				results[Math.min(index, results.length - 1)] ?? successResult();
			index += 1;
			return result;
		}),
	};
}

function successResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: fencedReport({ outcome: "success", files: [], verification: [] }),
		durationMs: 1,
	};
}

function blockResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: fencedReport({
			outcome: "failure",
			files: [],
			verification: [],
			notes,
		}),
		durationMs: 1,
	};
}

function fencedReport(report: Report): string {
	return `\`\`\`json\n${JSON.stringify(report)}\n\`\`\``;
}

async function readPrompt(fixture: Fixture, taskId: string): Promise<string> {
	const { readFile } = await import("node:fs/promises");
	return readFile(join(fixture.workdir, "prompts", `${taskId}.md`), "utf-8");
}
