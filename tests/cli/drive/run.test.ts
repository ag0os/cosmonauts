import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveProgram } from "../../../cli/drive/subcommand.ts";
import type { DriverDeps } from "../../../lib/driver/driver.ts";
import { DEFAULT_TASK_TIMEOUT_MS } from "../../../lib/driver/run-one-task.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
} from "../../../lib/driver/types.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../lib/tasks/task-types.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn((spec: DriverRunSpec, deps: DriverDeps): DriverHandle => {
		deps.activityBus.publish({
			type: "driver_event",
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
			event: {
				type: "task_done",
				runId: spec.runId,
				parentSessionId: spec.parentSessionId,
				timestamp: "2026-01-01T00:00:00.000Z",
				taskId: spec.taskIds[0] ?? "TASK-000",
			},
		});
		return createHandle(spec, {
			runId: spec.runId,
			outcome: "completed",
			tasksDone: spec.taskIds.length,
			tasksBlocked: 0,
		});
	}),
	startDetached: vi.fn(
		(spec: DriverRunSpec): DriverHandle =>
			createHandle(spec, {
				runId: spec.runId,
				outcome: "completed",
				tasksDone: spec.taskIds.length,
				tasksBlocked: 0,
			}),
	),
}));

const backendMocks = vi.hoisted(() => ({
	resolveBackend: vi.fn((name: string) => ({
		name,
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: vi.fn(),
	})),
}));

const childProcessMocks = vi.hoisted(() => ({
	execFileResult: { stdout: "", stderr: "" },
	execFile: vi.fn(
		(
			_cmd: string,
			_args: readonly string[],
			_options: unknown,
			callback: (
				error: Error | null,
				result: { stdout: string; stderr: string },
			) => void,
		) => {
			callback(null, childProcessMocks.execFileResult);
			return {};
		},
	),
}));

vi.mock("../../../lib/driver/driver.ts", () => ({
	runInline: driverMocks.runInline,
	startDetached: driverMocks.startDetached,
}));

vi.mock("../../../lib/driver/backends/registry.ts", () => ({
	resolveBackend: backendMocks.resolveBackend,
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-cli-test-");
const PLAN = "drive-plan";

describe("cosmonauts drive run", () => {
	let output: ReturnType<typeof captureCliOutput> & JsonOutput;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
		driverMocks.runInline.mockClear();
		driverMocks.startDetached.mockClear();
		backendMocks.resolveBackend.mockClear();
		childProcessMocks.execFile.mockClear();
		childProcessMocks.execFileResult = { stdout: "", stderr: "" };
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	test("creates a zero-argument factory with run and default run commands", async () => {
		const fixture = await setupFixture(1);
		const program = createDriveProgram();

		expect(program.name()).toBe("cosmonauts drive");
		expect(program.commands.map((command) => command.name())).toContain("run");

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--envelope",
			fixture.envelopePath,
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
	});

	test("documents the default per-task timeout in run help", () => {
		expect(DEFAULT_TASK_TIMEOUT_MS).toBe(30 * 60 * 1000);
		const program = createDriveProgram();
		const runCommand = program.commands.find(
			(command) => command.name() === "run",
		);

		const normalizedHelp = (runCommand?.helpInformation() ?? "").replace(
			/\s+/g,
			" ",
		);
		expect(normalizedHelp).toContain(
			`--task-timeout <ms> Per-task timeout in milliseconds (default: ${DEFAULT_TASK_TIMEOUT_MS}ms / 30 minutes)`,
		);
	});

	test("parses run arguments into DriverRunSpec fields", async () => {
		const fixture = await setupFixture(2);
		const preconditionPath = join(temp.path, "precondition.md");
		const overridesPath = join(temp.path, "overrides");
		await mkdir(overridesPath, { recursive: true });
		await writeFile(preconditionPath, "Precondition\n", "utf-8");

		await parseDrive([
			"run",
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks.map((task) => task.id).join(","),
			"--backend",
			"claude-cli",
			"--mode",
			"inline",
			"--branch",
			"feature/drive",
			"--commit-policy",
			"no-commit",
			"--envelope",
			fixture.envelopePath,
			"--precondition",
			preconditionPath,
			"--overrides",
			overridesPath,
			"--max-cost",
			"12.50",
			"--task-timeout",
			"1234",
		]);

		const spec = firstRunInlineSpec();
		expect(spec).toMatchObject({
			projectRoot: process.cwd(),
			planSlug: PLAN,
			taskIds: fixture.tasks.map((task) => task.id),
			backendName: "claude-cli",
			branch: "feature/drive",
			commitPolicy: "no-commit",
			taskTimeoutMs: 1234,
		});
		expect(spec.promptTemplate).toEqual({
			envelopePath: fixture.envelopePath,
			preconditionPath,
			perTaskOverrideDir: overridesPath,
		});
		expect(backendMocks.resolveBackend).toHaveBeenCalledWith("claude-cli", {
			claudeBinary: undefined,
			claudeArgs: undefined,
		});
	});

	test("uses task count heuristic after resolving non-Done plan tasks and max-tasks", async () => {
		const fixture = await setupFixture(6);
		await fixture.manager.updateTask(fixture.tasks[5]?.id ?? "TASK-006", {
			status: "Done",
		});

		await parseDrive(["--plan", PLAN, "--envelope", fixture.envelopePath]);

		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(firstStartDetachedSpec().taskIds).toHaveLength(5);
		expect(output.stdoutJson()).toMatchObject({
			planSlug: PLAN,
			eventLogPath: expect.stringContaining("events.jsonl"),
		});

		driverMocks.startDetached.mockClear();
		output.restore();
		output = attachJsonHelpers(captureCliOutput());

		await parseDrive([
			"--plan",
			PLAN,
			"--envelope",
			fixture.envelopePath,
			"--max-tasks",
			"4",
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec().taskIds).toHaveLength(4);
	});

	test("does not parse stale Codex env when running claude-cli", async () => {
		const fixture = await setupFixture(1);
		const original = process.env.COSMONAUTS_DRIVER_CODEX_EXEC_ARGS;
		process.env.COSMONAUTS_DRIVER_CODEX_EXEC_ARGS = "'unterminated";
		try {
			await parseDrive([
				"run",
				"--plan",
				PLAN,
				"--task-ids",
				fixture.tasks[0]?.id ?? "TASK-001",
				"--backend",
				"claude-cli",
				"--mode",
				"detached",
				"--envelope",
				fixture.envelopePath,
			]);
		} finally {
			if (original === undefined) {
				delete process.env.COSMONAUTS_DRIVER_CODEX_EXEC_ARGS;
			} else {
				process.env.COSMONAUTS_DRIVER_CODEX_EXEC_ARGS = original;
			}
		}

		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(backendMocks.resolveBackend).toHaveBeenCalledWith("claude-cli", {
			claudeBinary: undefined,
			claudeArgs: undefined,
		});
	});

	test("routes explicit inline and detached modes without invoking real backends", async () => {
		const fixture = await setupFixture(1);

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--mode",
			"inline",
			"--envelope",
			fixture.envelopePath,
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(output.stdout())).toMatchObject({ outcome: "completed" });
		expect(JSON.parse(output.stderr())).toMatchObject({
			type: "task_done",
			runId: firstRunInlineSpec().runId,
		});

		driverMocks.runInline.mockClear();
		output.restore();
		output = attachJsonHelpers(captureCliOutput());

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--mode",
			"detached",
			"--envelope",
			fixture.envelopePath,
		]);

		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: firstStartDetachedSpec().runId,
			planSlug: PLAN,
		});
	});

	test("writes aborted completion when an inline run rejects", async () => {
		const fixture = await setupFixture(1);
		driverMocks.runInline.mockImplementationOnce(
			(spec: DriverRunSpec): DriverHandle =>
				createHandle(spec, Promise.reject(new Error("already-running"))),
		);

		await expect(
			parseDrive([
				"--plan",
				PLAN,
				"--task-ids",
				fixture.tasks[0]?.id ?? "TASK-001",
				"--mode",
				"inline",
				"--envelope",
				fixture.envelopePath,
			]),
		).rejects.toThrow("already-running");

		const spec = firstRunInlineSpec();
		const completion = JSON.parse(
			await readFile(join(spec.workdir, "run.completion.json"), "utf-8"),
		) as DriverResult;
		expect(completion).toMatchObject({
			runId: spec.runId,
			outcome: "aborted",
			tasksDone: 0,
			tasksBlocked: 0,
			blockedReason: "already-running",
		});
	});

	test("guards resume when the worktree is dirty", async () => {
		const fixture = await setupFixture(3);
		await writeResumeRun(fixture.tasks.map((task) => task.id));
		childProcessMocks.execFileResult = {
			stdout: " M src/file.ts\n?? new-file.ts\n",
			stderr: "",
		};

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(output.stderrJson()).toMatchObject({
			error: "dirty_worktree",
			dirtyPaths: ["src/file.ts", "new-file.ts"],
		});
	});

	test("clears stale completion before a resumed inline run starts", async () => {
		const fixture = await setupFixture(2);
		await writeResumeRun(fixture.tasks.map((task) => task.id));
		const completionPath = join(resumeWorkdir(), "run.completion.json");
		await writeFile(
			completionPath,
			`${JSON.stringify({
				runId: "run-previous",
				outcome: "blocked",
				tasksDone: 1,
				tasksBlocked: 1,
				blockedReason: "old result",
			})}\n`,
			"utf-8",
		);
		driverMocks.runInline.mockImplementationOnce(
			(spec: DriverRunSpec): DriverHandle => {
				expect(existsSync(completionPath)).toBe(false);
				return createHandle(spec, {
					runId: spec.runId,
					outcome: "completed",
					tasksDone: spec.taskIds.length,
					tasksBlocked: 0,
				});
			},
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec().runId).toBe("run-previous");
	});

	test("slices resume task IDs after the highest done or blocked previous task", async () => {
		const fixture = await setupFixture(4);
		await writeResumeRun(
			fixture.tasks.map((task) => task.id),
			[
				{ type: "task_done", taskId: fixture.tasks[0]?.id ?? "TASK-001" },
				{ type: "task_blocked", taskId: fixture.tasks[1]?.id ?? "TASK-002" },
			],
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"git",
			["status", "--porcelain"],
			{ cwd: process.cwd(), encoding: "utf-8" },
			expect.any(Function),
		);
		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec()).toMatchObject({
			runId: "run-previous",
			backendName: "claude-cli",
			commitPolicy: "no-commit",
			taskIds: fixture.tasks.slice(2).map((task) => task.id),
		});
	});
});

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveProgram();
	program.exitOverride();
	await program.parseAsync(args, { from: "user" });
}

async function setupFixture(count: number): Promise<{
	manager: TaskManager;
	tasks: Task[];
	envelopePath: string;
}> {
	const manager = new TaskManager(temp.path);
	await manager.init();
	const tasks: Task[] = [];
	for (let i = 0; i < count; i++) {
		tasks.push(
			await manager.createTask({
				title: `Drive task ${i + 1}`,
				labels: [`plan:${PLAN}`],
			}),
		);
	}
	const envelopePath = join(temp.path, "envelope.md");
	await writeFile(envelopePath, "Envelope\n", "utf-8");
	return { manager, tasks, envelopePath };
}

async function writeResumeRun(
	taskIds: string[],
	events: Array<{ type: "task_done" | "task_blocked"; taskId: string }> = [],
): Promise<void> {
	const workdir = resumeWorkdir();
	const spec: DriverRunSpec = {
		runId: "run-previous",
		parentSessionId: "previous-parent",
		projectRoot: temp.path,
		planSlug: PLAN,
		taskIds,
		backendName: "claude-cli",
		promptTemplate: { envelopePath: join(temp.path, "previous-envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await mkdir(workdir, { recursive: true });
	await writeFile(
		join(temp.path, "previous-envelope.md"),
		"Envelope\n",
		"utf-8",
	);
	await writeFile(join(workdir, "spec.json"), JSON.stringify(spec), "utf-8");
	await writeFile(
		join(workdir, "events.jsonl"),
		events
			.map((event) =>
				JSON.stringify({
					...event,
					runId: "run-previous",
					parentSessionId: "previous-parent",
					timestamp: "2026-01-01T00:00:00.000Z",
				}),
			)
			.join("\n"),
		"utf-8",
	);
}

function firstRunInlineSpec(): DriverRunSpec {
	return driverMocks.runInline.mock.calls[0]?.[0] as DriverRunSpec;
}

function firstStartDetachedSpec(): DriverRunSpec {
	return driverMocks.startDetached.mock.calls[0]?.[0] as DriverRunSpec;
}

function resumeWorkdir(): string {
	return join(temp.path, "missions", "sessions", PLAN, "runs", "run-previous");
}

function createHandle(
	spec: DriverRunSpec,
	result: DriverResult | Promise<DriverResult>,
): DriverHandle {
	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		abort: vi.fn<() => Promise<void>>(async () => undefined),
		result: Promise.resolve(result),
	};
}

interface JsonOutput {
	stdoutJson(): Record<string, unknown>;
	stderrJson(): Record<string, unknown>;
}

function attachJsonHelpers(
	capture: ReturnType<typeof captureCliOutput>,
): ReturnType<typeof captureCliOutput> & JsonOutput {
	return Object.assign(capture, {
		stdoutJson: () => JSON.parse(capture.stdout()) as Record<string, unknown>,
		stderrJson: () => JSON.parse(capture.stderr()) as Record<string, unknown>,
	});
}
