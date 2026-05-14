import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { getRepoCommitLockPath } from "../../lib/driver/lock.ts";
import {
	deriveOutcome,
	type RunOneTaskCtx,
	runOneTask,
} from "../../lib/driver/run-one-task.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	ParsedReport,
	Report,
	ReportOutcome,
} from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task, TaskUpdateInput } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-one-task-test-");
const execFileAsync = promisify(execFile);

describe("run-one-task", () => {
	test("run-one-task happy path marks the task done and emits spawn_completed", async () => {
		const fixture = await setupFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toEqual({ status: "done", commitSha: undefined });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Done",
		);
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
		]);
		expect(events.find(isSpawnCompleted)?.report).toMatchObject({
			outcome: "success",
		});
	});

	test("run-one-task preflight failure returns blocked without TaskManager updates", async () => {
		const fixture = await setupRecordingFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());
		const spec = createSpec(fixture, {
			preflightCommands: [
				nodeCommand("process.stderr.write('nope'); process.exit(7)"),
			],
		});

		const outcome = await runOneTask(
			spec,
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		expect(fixture.taskManager.updates).toEqual([]);
		expect(backend.run).not.toHaveBeenCalled();
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "preflight",
				status: "failed",
				details: expect.objectContaining({ command: expect.any(String) }),
			}),
		);
	});

	test("run-one-task branch mismatch aborts before any status transition", async () => {
		const fixture = await setupRecordingFixture();
		await initGit(fixture.projectRoot);
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());

		const outcome = await runOneTask(
			createSpec(fixture, { branch: "not-main" }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		expect(fixture.taskManager.updates).toEqual([]);
		expect(backend.run).not.toHaveBeenCalled();
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "preflight",
				status: "failed",
				details: expect.objectContaining({ branch: "main" }),
			}),
		);
	});

	test("driver task fields literal uses Title Case and implementationNotes, never note", async () => {
		const fixture = await setupRecordingFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => failureResult("needs follow-up"));

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		expect(fixture.taskManager.updates).toEqual([
			{ status: "In Progress" },
			{ status: "Blocked", implementationNotes: "needs follow-up" },
		]);
		for (const update of fixture.taskManager.updates) {
			expect(update).not.toHaveProperty("note");
		}
	});

	test("driver commit exclusion uses repo lock, excludes missions and memory, and emits sha", async () => {
		const fixture = await setupFixture();
		await initGit(fixture.projectRoot);
		await installCommitHook(fixture.projectRoot);
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await mkdir(join(fixture.projectRoot, "missions", "agent"), {
				recursive: true,
			});
			await mkdir(join(fixture.projectRoot, "memory"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", "changed.txt"),
				"commit\n",
			);
			await writeFile(
				join(fixture.projectRoot, "missions", "agent", "ignored.txt"),
				"ignore\n",
			);
			await writeFile(
				join(fixture.projectRoot, "memory", "ignored.txt"),
				"ignore\n",
			);
			return successfulResult();
		});
		const eventSink: EventSink = async (event) => {
			events.push(event);
			if (event.type === "commit_made") {
				await expect(
					stat(getRepoCommitLockPath(fixture.projectRoot)),
				).rejects.toMatchObject({ code: "ENOENT" });
			}
		};

		const outcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(fixture, backend, events, { eventSink }),
			fixture.taskId,
		);

		const commit = events.find(isCommitMade);
		expect(outcome.status).toBe("done");
		expect(outcome.commitSha).toBe(commit?.sha);
		expect(commit?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(
			await readFile(join(fixture.projectRoot, "hook-observed.txt"), "utf-8"),
		).toBe("lock-present\n");
		const committedFiles = await git(fixture.projectRoot, [
			"show",
			"--name-only",
			"--format=",
			"HEAD",
		]);
		expect(committedFiles.trim().split("\n")).toEqual(["src/changed.txt"]);
		const ignoredStatus = await git(fixture.projectRoot, [
			"status",
			"--porcelain",
			"--",
			"missions",
			"memory",
		]);
		expect(ignoredStatus).toContain("missions/");
		expect(ignoredStatus).toContain("memory/");
	});

	test("driver derive outcome requires explicit worker outcome", () => {
		const unknown = {
			outcome: "unknown",
			raw: "no report",
		} satisfies ParsedReport;
		const pass = [{ command: "test", status: "pass" }] as const;
		const fail = [{ command: "test", status: "fail", stderr: "bad" }] as const;

		expect(deriveOutcome(unknown, [])).toBe("failure");
		expect(deriveOutcome(unknown, pass)).toBe("failure");
		expect(deriveOutcome(unknown, fail)).toBe("failure");
		expect(deriveOutcome(report("success"), fail)).toBe("success");
		expect(deriveOutcome(report("failure"), pass)).toBe("failure");
		expect(deriveOutcome(report("partial"), fail)).toBe("partial");
	});

	test("driver task timeout aborts the spawn and blocks with implementationNotes", async () => {
		const fixture = await setupFixture();
		const events: DriverEvent[] = [];
		let observedSignal: AbortSignal | undefined;
		const backend = createBackend(async (invocation) => {
			observedSignal = invocation.signal;
			return new Promise<BackendRunResult>(() => {});
		});

		const outcome = await runOneTask(
			createSpec(fixture, { taskTimeoutMs: 10 }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(observedSignal?.aborted).toBe(true);
		expect(outcome).toMatchObject({ status: "blocked" });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Blocked",
		);
		expect(
			(await fixture.taskManager.getTask(fixture.taskId))?.implementationNotes,
		).toContain("timed out");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "spawn_failed",
				exitCode: 124,
			}),
		);
	});

	test("driver post-commit task update failure emits run_aborted without task_done", async () => {
		const fixture = await setupRecordingFixture();
		await initGit(fixture.projectRoot);
		fixture.taskManager.failFinalUpdate = true;
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", "after-commit.txt"),
				"commit\n",
			);
			return successfulResult();
		});

		const outcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({
			status: "blocked",
			commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(outcome.reason).toContain("status update failed after commit");
		expect(events.map((event) => event.type)).toContain("commit_made");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "run_aborted",
				reason: "status update failed after commit",
			}),
		);
		expect(events.map((event) => event.type)).not.toContain("task_done");
		expect(
			await git(fixture.projectRoot, [
				"show",
				"--format=%s",
				"--no-patch",
				"HEAD",
			]),
		).toContain(`${fixture.taskId}: driver task update`);
	});

	test("driver partial outcome commits and leaves task In Progress with progress notes", async () => {
		const fixture = await setupFixture();
		await initGit(fixture.projectRoot);
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", "partial.txt"),
				"partial\n",
			);
			return {
				exitCode: 0,
				stdout: fencedReport({
					outcome: "partial",
					files: [],
					verification: [],
					notes: "needs another pass",
					progress: { phase: 1, of: 2, remaining: "tests" },
				}),
				durationMs: 1,
			};
		});

		const outcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy: "driver-commits",
				postflightCommands: [nodeCommand("process.exit(0)")],
			}),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		const task = await fixture.taskManager.getTask(fixture.taskId);
		expect(outcome).toMatchObject({
			status: "partial",
			commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(task?.status).toBe("In Progress");
		expect(task?.implementationNotes).toContain("partial: phase 1/2");
		expect(task?.implementationNotes).toContain("remaining: tests");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				reason: expect.stringContaining("partial"),
				progress: { phase: 1, of: 2, remaining: "tests" },
			}),
		);
		expect(events.map((event) => event.type)).toContain("commit_made");
	});

	test("run-one-task unknown report blocks and does not commit even when postverify passes", async () => {
		const fixture = await setupFixture();
		await initGit(fixture.projectRoot);
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", "uncommitted.txt"),
				"no commit\n",
			);
			return {
				exitCode: 0,
				stdout: "Implemented: changed src/uncommitted.txt but no gate passed",
				durationMs: 1,
			};
		});

		const outcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy: "driver-commits",
				postflightCommands: [nodeCommand("process.exit(0)")],
			}),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		const task = await fixture.taskManager.getTask(fixture.taskId);
		expect(outcome).toMatchObject({ status: "blocked" });
		expect(task?.status).toBe("Blocked");
		expect(task?.implementationNotes).toContain("report outcome unknown");
		expect(events.map((event) => event.type)).not.toContain("commit_made");
		const staged = await git(fixture.projectRoot, [
			"diff",
			"--cached",
			"--name-only",
		]);
		expect(staged).toBe("");
	});
});

interface Fixture {
	projectRoot: string;
	workdir: string;
	envelopePath: string;
	taskId: string;
	taskManager: TaskManager;
}

interface RecordingFixture extends Omit<Fixture, "taskManager"> {
	taskManager: RecordingTaskManager;
}

async function setupFixture(): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	const workdir = join(temp.path, "run");
	const templateDir = join(temp.path, "templates");
	await mkdir(templateDir, { recursive: true });
	await mkdir(workdir, { recursive: true });

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Run One Task Fixture",
		description: "Implement this fixture task.",
	});
	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Envelope instructions", "utf-8");

	return { projectRoot, workdir, envelopePath, taskId: task.id, taskManager };
}

async function setupRecordingFixture(): Promise<RecordingFixture> {
	const projectRoot = join(temp.path, "project");
	const workdir = join(temp.path, "run");
	const templateDir = join(temp.path, "templates");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(templateDir, { recursive: true });
	await mkdir(workdir, { recursive: true });
	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Envelope instructions", "utf-8");
	const task = createTask("TASK-255");

	return {
		projectRoot,
		workdir,
		envelopePath,
		taskId: task.id,
		taskManager: new RecordingTaskManager(projectRoot, task),
	};
}

function createSpec(
	fixture: Fixture | RecordingFixture,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-255",
		parentSessionId: "parent-session-255",
		projectRoot: fixture.projectRoot,
		planSlug: "driver-primitives",
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
	fixture: Fixture | RecordingFixture,
	backend: Backend,
	events: DriverEvent[],
	overrides: Partial<RunOneTaskCtx> = {},
): RunOneTaskCtx {
	const eventSink: EventSink = async (event) => {
		events.push(event);
	};

	return {
		taskManager: fixture.taskManager,
		backend,
		eventSink,
		parentSessionId: "parent-session-255",
		runId: "run-255",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: fixture.projectRoot,
		...overrides,
	};
}

function createBackend(
	run: (invocation: BackendInvocation) => Promise<BackendRunResult>,
): Backend & { run: ReturnType<typeof vi.fn> } {
	return {
		name: "test-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: false },
		run: vi.fn(run),
	};
}

function successfulResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: fencedReport({ outcome: "success", files: [], verification: [] }),
		durationMs: 1,
	};
}

function failureResult(notes: string): BackendRunResult {
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

function report(outcome: ReportOutcome): Report {
	return { outcome, files: [], verification: [] };
}

function createTask(id: string): Task {
	const now = new Date("2026-05-04T00:00:00.000Z");
	return {
		id,
		title: "Recording Fixture",
		status: "To Do",
		priority: "high",
		createdAt: now,
		updatedAt: now,
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	};
}

class RecordingTaskManager extends TaskManager {
	readonly updates: TaskUpdateInput[] = [];
	failFinalUpdate = false;
	private task: Task;

	constructor(projectRoot: string, task: Task) {
		super(projectRoot);
		this.task = task;
	}

	override async getTask(id: string): Promise<Task | null> {
		return id === this.task.id ? this.task : null;
	}

	override async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
		if (id !== this.task.id) {
			throw new Error(`Task not found: ${id}`);
		}
		if (this.failFinalUpdate && this.updates.length > 0) {
			throw new Error("update failed");
		}

		this.updates.push(input);
		this.task = {
			...this.task,
			...input,
			updatedAt: new Date("2026-05-04T00:01:00.000Z"),
			labels: input.labels ?? this.task.labels,
			dependencies: input.dependencies ?? this.task.dependencies,
			acceptanceCriteria:
				input.acceptanceCriteria ?? this.task.acceptanceCriteria,
		};
		return this.task;
	}
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	const lockPath = getRepoCommitLockPath(projectRoot);
	const observedPath = join(projectRoot, "hook-observed.txt");
	const script = `#!/bin/sh
if test -f ${shellQuote(lockPath)}; then
  printf 'lock-present\n' > ${shellQuote(observedPath)}
else
  printf 'lock-missing\n' > ${shellQuote(observedPath)}
  exit 1
fi
if git diff --cached --name-only | grep -E '^(missions|memory)/'; then
  exit 1
fi
`;
	await writeFile(hookPath, script, "utf-8");
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function isSpawnCompleted(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "spawn_completed" }> {
	return event.type === "spawn_completed";
}

function isCommitMade(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "commit_made" }> {
	return event.type === "commit_made";
}
