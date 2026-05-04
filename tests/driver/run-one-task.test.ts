import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	createEventSink,
	type DriverEventPublisher,
} from "../../lib/driver/event-stream.ts";
import {
	acquireRepoCommitLock,
	getRepoCommitLockPath,
} from "../../lib/driver/lock.ts";
import {
	deriveOutcome,
	type RunOneTaskCtx,
	runOneTask,
} from "../../lib/driver/run-one-task.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	ParsedReport,
	Report,
} from "../../lib/driver/types.ts";
import type { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task, TaskUpdateInput } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const tmp = useTempDir("run-one-task-test-");
const taskId = "TASK-255";

interface Harness {
	projectRoot: string;
	workdir: string;
	templateDir: string;
	envelopePath: string;
	events: DriverEvent[];
	taskManager: TaskManager;
	updates: TaskUpdateInput[];
	updateTask: ReturnType<typeof vi.fn>;
	getTask: ReturnType<typeof vi.fn>;
}

describe("run-one-task", () => {
	test("happy path commits under the repo lock, emits commit_made, and marks Done", async () => {
		const harness = await setupHarness();
		let commitLockMissingAtEvent = false;
		const eventSink = async (event: DriverEvent) => {
			harness.events.push(event);
			if (event.type === "commit_made") {
				commitLockMissingAtEvent = await isMissing(
					getRepoCommitLockPath(harness.projectRoot),
				);
			}
		};
		const heldLock = await acquireRepoCommitLock(harness.projectRoot);
		const backend = backendFrom(async () => {
			await writeFile(
				join(harness.projectRoot, "feature.txt"),
				"done",
				"utf-8",
			);
			return successResult(reportStdout({ outcome: "success" }));
		});

		const pending = runOneTask(
			createSpec(harness, { commitPolicy: "driver-commits" }),
			createCtx(harness, backend, eventSink),
			taskId,
		);
		await delay(80);

		expect(eventsOf(harness.events, "commit_made")).toHaveLength(0);

		await heldLock.release();
		const outcome = await pending;

		expect(outcome.status).toBe("done");
		expect(outcome.commitSha).toMatch(/^[0-9a-f]{40}$/);
		expect(harness.updates).toEqual([
			{ status: "In Progress" },
			{ status: "Done" },
		]);
		expect(eventsOf(harness.events, "task_started")).toHaveLength(1);
		expect(eventsOf(harness.events, "spawn_started")[0]).toMatchObject({
			backend: "mock-backend",
		});
		expect(
			eventsOf(harness.events, "spawn_completed")[0]?.report,
		).toMatchObject({
			outcome: "success",
		});
		expect(eventsOf(harness.events, "commit_made")[0]).toMatchObject({
			sha: outcome.commitSha,
		});
		expect(eventsOf(harness.events, "task_done")).toHaveLength(1);
		expect(commitLockMissingAtEvent).toBe(true);
		expect(await git(harness.projectRoot, ["rev-parse", "HEAD"])).toBe(
			outcome.commitSha,
		);
	});

	test("preflight failure emits failed preflight and does not update task status", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () =>
			successResult(reportStdout({ outcome: "success" })),
		);

		const outcome = await runOneTask(
			createSpec(harness, {
				preflightCommands: [
					"node -e \"process.stderr.write('preflight nope'); process.exit(7)\"",
				],
			}),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		expect(harness.updateTask).not.toHaveBeenCalled();
		expect(backend.run).not.toHaveBeenCalled();
		expect(
			eventsOf(harness.events, "preflight").map((event) => event.status),
		).toEqual(["started", "failed"]);
		expect(eventsOf(harness.events, "preflight")[1]?.details?.stderr).toContain(
			"preflight nope",
		);
	});

	test("branch mismatch aborts before status transition and preflight commands", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () =>
			successResult(reportStdout({ outcome: "success" })),
		);
		const markerPath = join(harness.projectRoot, "preflight-ran");

		const outcome = await runOneTask(
			createSpec(harness, {
				branch: "feature-branch",
				preflightCommands: [
					"node -e \"require('node:fs').writeFileSync('preflight-ran', '1')\"",
				],
			}),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		expect(harness.updateTask).not.toHaveBeenCalled();
		expect(backend.run).not.toHaveBeenCalled();
		expect(await isMissing(markerPath)).toBe(true);
		expect(eventsOf(harness.events, "preflight")[1]).toMatchObject({
			status: "failed",
			details: { branch: "main" },
		});
	});

	test("unknown report with failing postverify marks Blocked and does not commit", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () => {
			await writeFile(join(harness.projectRoot, "bad.txt"), "bad", "utf-8");
			return successResult("no structured report");
		});

		const outcome = await runOneTask(
			createSpec(harness, {
				commitPolicy: "driver-commits",
				postflightCommands: [
					"node -e \"process.stderr.write('verify failed'); process.exit(3)\"",
				],
			}),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome.status).toBe("blocked");
		expect(
			eventsOf(harness.events, "verify").map((event) => event.status),
		).toEqual(["started", "failed"]);
		expect(eventsOf(harness.events, "commit_made")).toHaveLength(0);
		expect(harness.updates).toEqual([
			{ status: "In Progress" },
			{
				status: "Blocked",
				implementationNotes:
					"post-verify failed: node -e \"process.stderr.write('verify failed'); process.exit(3)\": verify failed",
			},
		]);
		expect(
			await git(harness.projectRoot, ["rev-list", "--count", "HEAD"]),
		).toBe("1");
		expectNoNoteField(harness.updates);
	});

	test("partial reports commit, keep task In Progress with implementationNotes, and emit task_blocked", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () => {
			await writeFile(
				join(harness.projectRoot, "partial.txt"),
				"partial",
				"utf-8",
			);
			return successResult(
				reportStdout({
					outcome: "partial",
					notes: "phase complete",
					progress: { phase: 1, of: 2, remaining: "finish tests" },
				}),
			);
		});

		const outcome = await runOneTask(
			createSpec(harness, { commitPolicy: "driver-commits" }),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome.status).toBe("partial");
		expect(outcome.commitSha).toMatch(/^[0-9a-f]{40}$/);
		expect(harness.updates).toEqual([
			{ status: "In Progress" },
			{
				status: "In Progress",
				implementationNotes:
					"partial: phase 1/2; remaining: finish tests: phase complete",
			},
		]);
		expect(eventsOf(harness.events, "commit_made")).toHaveLength(1);
		expect(eventsOf(harness.events, "task_blocked")[0]).toMatchObject({
			reason: expect.stringMatching(/^partial/),
			progress: { phase: 1, of: 2, remaining: "finish tests" },
		});
		expectNoNoteField(harness.updates);
	});

	test("explicit failure reports mark Blocked with implementationNotes and no note field", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () =>
			successResult(
				reportStdout({ outcome: "failure", notes: "reported failure" }),
			),
		);

		const outcome = await runOneTask(
			createSpec(harness, { commitPolicy: "driver-commits" }),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome).toEqual({ status: "blocked", reason: "reported failure" });
		expect(harness.updates).toEqual([
			{ status: "In Progress" },
			{ status: "Blocked", implementationNotes: "reported failure" },
		]);
		expect(eventsOf(harness.events, "commit_made")).toHaveLength(0);
		expect(eventsOf(harness.events, "task_blocked")[0]).toMatchObject({
			reason: "reported failure",
		});
		expectNoNoteField(harness.updates);
	});

	test("task timeout aborts the backend signal, emits spawn_failed 124, and marks Blocked", async () => {
		const harness = await setupHarness();
		let observedAborted = false;
		const backend = backendFrom(async (invocation) => {
			invocation.signal?.addEventListener("abort", () => {
				observedAborted = invocation.signal?.aborted ?? false;
			});
			return new Promise<BackendRunResult>(() => {});
		});

		const outcome = await runOneTask(
			createSpec(harness, { taskTimeoutMs: 5 }),
			createCtx(harness, backend),
			taskId,
		);

		expect(observedAborted).toBe(true);
		expect(outcome.status).toBe("blocked");
		expect(eventsOf(harness.events, "spawn_failed")[0]).toMatchObject({
			exitCode: 124,
			error: "task timed out after 5ms",
		});
		expect(harness.updates).toEqual([
			{ status: "In Progress" },
			{
				status: "Blocked",
				implementationNotes: "task timed out after 5ms",
			},
		]);
		expectNoNoteField(harness.updates);
	});

	test("status update failure after commit emits run_aborted and leaves commit_made without task_done in JSONL", async () => {
		const harness = await setupHarness({
			updateTask: async (_id, input) => {
				if (input.status === "Done") {
					throw new Error("task write failed");
				}
				return taskWithUpdate(input);
			},
		});
		const logPath = join(harness.workdir, "events.jsonl");
		const activityBus: DriverEventPublisher = { publish: vi.fn() };
		const sink = createEventSink({
			logPath,
			runId: "run-255",
			parentSessionId: "parent-session-255",
			activityBus,
		});
		const backend = backendFrom(async () => {
			await writeFile(
				join(harness.projectRoot, "committed.txt"),
				"yes",
				"utf-8",
			);
			return successResult(reportStdout({ outcome: "success" }));
		});

		const outcome = await runOneTask(
			createSpec(harness, {
				commitPolicy: "driver-commits",
				eventLogPath: logPath,
			}),
			createCtx(harness, backend, sink),
			taskId,
		);

		expect(outcome.status).toBe("blocked");
		expect(outcome.commitSha).toMatch(/^[0-9a-f]{40}$/);
		expect(
			await git(harness.projectRoot, ["rev-list", "--count", "HEAD"]),
		).toBe("2");
		const jsonlEvents = await readJsonl(logPath);
		expect(jsonlEvents.map((event) => event.type)).toContain("commit_made");
		expect(jsonlEvents.map((event) => event.type)).toContain("run_aborted");
		expect(jsonlEvents.map((event) => event.type)).not.toContain("task_done");
		expect(eventsOf(jsonlEvents, "run_aborted")[0]).toMatchObject({
			reason: "status update failed after commit",
		});
	});

	test("driver commits exclude paths under missions and memory", async () => {
		const harness = await setupHarness();
		const backend = backendFrom(async () => {
			await mkdir(join(harness.projectRoot, "lib"), { recursive: true });
			await mkdir(join(harness.projectRoot, "missions"), { recursive: true });
			await mkdir(join(harness.projectRoot, "memory"), { recursive: true });
			await writeFile(
				join(harness.projectRoot, "lib", "included.ts"),
				"export {};\n",
				"utf-8",
			);
			await writeFile(
				join(harness.projectRoot, "missions", "local.md"),
				"local",
				"utf-8",
			);
			await writeFile(
				join(harness.projectRoot, "memory", "memo.md"),
				"memo",
				"utf-8",
			);
			return successResult(reportStdout({ outcome: "success" }));
		});

		const outcome = await runOneTask(
			createSpec(harness, { commitPolicy: "driver-commits" }),
			createCtx(harness, backend),
			taskId,
		);

		expect(outcome.status).toBe("done");
		const committedFiles = await git(harness.projectRoot, [
			"show",
			"--name-only",
			"--format=",
			"HEAD",
		]);
		expect(committedFiles.split("\n")).toContain("lib/included.ts");
		expect(committedFiles).not.toContain("missions/local.md");
		expect(committedFiles).not.toContain("memory/memo.md");
		expect(
			await git(harness.projectRoot, [
				"status",
				"--porcelain",
				"--untracked-files=all",
				"--",
				"missions",
				"memory",
			]),
		).toContain("missions/local.md");
	});

	test("deriveOutcome maps unknown reports from postverify and honors explicit outcomes", () => {
		const unknown: ParsedReport = { outcome: "unknown", raw: "done" };
		expect(deriveOutcome(unknown, [])).toBe("success");
		expect(deriveOutcome(unknown, [{ command: "test", status: "pass" }])).toBe(
			"success",
		);
		expect(deriveOutcome(unknown, [{ command: "test", status: "fail" }])).toBe(
			"failure",
		);
		expect(
			deriveOutcome(report({ outcome: "success" }), [
				{ command: "test", status: "fail" },
			]),
		).toBe("success");
		expect(deriveOutcome(report({ outcome: "failure" }), [])).toBe("failure");
		expect(
			deriveOutcome(report({ outcome: "partial" }), [
				{ command: "test", status: "fail" },
			]),
		).toBe("partial");
	});

	test("has no domains imports", async () => {
		const source = await readFile("lib/driver/run-one-task.ts", "utf-8");

		expect(source).not.toContain("domains/");
		expect(source).not.toContain("/domains");
	});
});

async function setupHarness(
	options: {
		updateTask?: (id: string, input: TaskUpdateInput) => Promise<Task>;
	} = {},
): Promise<Harness> {
	const projectRoot = join(tmp.path, "repo");
	const workdir = join(tmp.path, "run");
	const templateDir = join(tmp.path, "templates");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(workdir, { recursive: true });
	await mkdir(templateDir, { recursive: true });
	await initGitRepo(projectRoot);

	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Implement exactly one task.", "utf-8");

	const updates: TaskUpdateInput[] = [];
	const task = testTask();
	const updateTask = vi.fn(async (id: string, input: TaskUpdateInput) => {
		updates.push(input);
		return options.updateTask?.(id, input) ?? taskWithUpdate(input);
	});
	const getTask = vi.fn(async (id: string) =>
		id === taskId ? task : undefined,
	);
	const taskManager = { updateTask, getTask } as unknown as TaskManager;

	return {
		projectRoot,
		workdir,
		templateDir,
		envelopePath,
		events: [],
		taskManager,
		updates,
		updateTask,
		getTask,
	};
}

function createSpec(
	harness: Harness,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-255",
		parentSessionId: "parent-session-255",
		projectRoot: harness.projectRoot,
		planSlug: "driver-primitives",
		taskIds: [taskId],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: harness.envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: harness.workdir,
		eventLogPath: join(harness.workdir, "events.jsonl"),
		...overrides,
	};
}

function createCtx(
	harness: Harness,
	backend: Backend,
	eventSink: (event: DriverEvent) => Promise<void> = async (event) => {
		harness.events.push(event);
	},
): RunOneTaskCtx {
	return {
		taskManager: harness.taskManager,
		backend,
		eventSink,
		parentSessionId: "parent-session-255",
		runId: "run-255",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: harness.projectRoot,
	};
}

function backendFrom(
	run: Backend["run"],
): Backend & { run: ReturnType<typeof vi.fn> } {
	return {
		name: "mock-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: false },
		run: vi.fn(run),
	};
}

function successResult(stdout: string): BackendRunResult {
	return { exitCode: 0, stdout, durationMs: 1 };
}

function report(overrides: Partial<Report> = {}): Report {
	return {
		outcome: "success",
		files: [],
		verification: [],
		...overrides,
	};
}

function reportStdout(overrides: Partial<Report> = {}): string {
	return `\`\`\`json\n${JSON.stringify(report(overrides))}\n\`\`\``;
}

function testTask(): Task {
	return {
		id: taskId,
		title: "Run one task fixture",
		status: "To Do",
		createdAt: new Date("2026-05-04T00:00:00.000Z"),
		updatedAt: new Date("2026-05-04T00:00:00.000Z"),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	};
}

function taskWithUpdate(input: TaskUpdateInput): Task {
	return {
		...testTask(),
		...input,
		updatedAt: new Date("2026-05-04T00:01:00.000Z"),
	};
}

function eventsOf<T extends DriverEvent["type"]>(
	events: DriverEvent[],
	type: T,
): Extract<DriverEvent, { type: T }>[] {
	return events.filter(
		(event): event is Extract<DriverEvent, { type: T }> => event.type === type,
	);
}

function expectNoNoteField(updates: TaskUpdateInput[]): void {
	for (const update of updates) {
		expect(Object.keys(update)).not.toContain("note");
	}
}

async function initGitRepo(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init"]);
	await git(projectRoot, ["checkout", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.test"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return String(stdout).trim();
}

async function readJsonl(path: string): Promise<DriverEvent[]> {
	const content = await readFile(path, "utf-8");
	return content
		.trimEnd()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

async function isMissing(path: string): Promise<boolean> {
	try {
		await stat(path);
		return false;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return true;
		}
		throw error;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
