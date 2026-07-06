import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import {
	DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
	resolveDefaultDriveEnvelopePath,
} from "../../../lib/driver/default-envelope.ts";
import type { DriverDeps } from "../../../lib/driver/driver.ts";
import { DEFAULT_TASK_TIMEOUT_MS } from "../../../lib/driver/run-one-task.ts";
import {
	type DriverHandle,
	type DriverResult,
	type DriverRunSpec,
	resolveStateCommitPolicy,
} from "../../../lib/driver/types.ts";
import {
	FileRunStore,
	type StepAttemptRecord,
	type StepRecord,
} from "../../../lib/durable-runtime/index.ts";
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
	launchDetached: vi.fn(async (spec: DriverRunSpec) => ({
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		pid: 1234,
	})),
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
	launchDetached: driverMocks.launchDetached,
	runInline: driverMocks.runInline,
}));

vi.mock("../../../lib/driver/backends/registry.ts", () => ({
	resolveBackend: backendMocks.resolveBackend,
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-cli-test-");
const PLAN = "drive-plan";

describe("cosmonauts run drive compat run", () => {
	let output: ReturnType<typeof captureCliOutput> & JsonOutput;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
		driverMocks.runInline.mockClear();
		driverMocks.launchDetached.mockClear();
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
		const program = createDriveCompatProgram();

		expect(program.name()).toBe("cosmonauts run drive compat");
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
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
	});

	test("documents the default per-task timeout in run help", () => {
		expect(DEFAULT_TASK_TIMEOUT_MS).toBe(30 * 60 * 1000);
		const program = createDriveCompatProgram();
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
		expect(normalizedHelp).toContain(
			"Detached mode starts background Drive work and returns after launching.",
		);
		expect(normalizedHelp).toContain(
			"The launcher returning is not the run completing; poll with: cosmonauts run status <runId>",
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
			envelopeContent: "Envelope\n",
			preconditionPath,
			perTaskOverrideDir: overridesPath,
		});
		expect(backendMocks.resolveBackend).toHaveBeenCalledWith("claude-cli", {
			claudeBinary: undefined,
			claudeArgs: ["--dangerously-skip-permissions"],
		});
	});

	test("uses task count heuristic after resolving non-Done plan tasks and max-tasks", async () => {
		const fixture = await setupFixture(6);
		await fixture.manager.updateTask(fixture.tasks[5]?.id ?? "TASK-006", {
			status: "Done",
		});

		await parseDrive(["--plan", PLAN, "--envelope", fixture.envelopePath]);

		expect(driverMocks.launchDetached).toHaveBeenCalledTimes(1);
		expect(firstLaunchDetachedSpec().taskIds).toHaveLength(5);
		expect(output.stdout()).toContain(
			`Drive run started: ${firstLaunchDetachedSpec().runId} - poll with: cosmonauts run status ${firstLaunchDetachedSpec().runId}`,
		);
		expect(output.stdoutJson()).toMatchObject({
			planSlug: PLAN,
			eventLogPath: expect.stringContaining("events.jsonl"),
		});

		driverMocks.launchDetached.mockClear();
		output.restore();
		output = attachJsonHelpers(captureCliOutput());

		await parseDrive([
			"--plan",
			PLAN,
			"--envelope",
			fixture.envelopePath,
			"--max-tasks",
			"3",
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec().taskIds).toHaveLength(3);
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

		expect(driverMocks.launchDetached).toHaveBeenCalledTimes(1);
		expect(backendMocks.resolveBackend).toHaveBeenCalledWith("claude-cli", {
			claudeBinary: undefined,
			claudeArgs: ["--dangerously-skip-permissions"],
		});
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-013
	test("defaults state commit policy from commit policy", async () => {
		const fixture = await setupFixture(1);

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--commit-policy",
			"driver-commits",
			"--envelope",
			fixture.envelopePath,
		]);

		let spec = firstRunInlineSpec();
		expect(spec.stateCommitPolicy).toBeUndefined();
		expect(resolveStateCommitPolicy(spec)).toBe("final-state-commit");
		expect(
			resolveStateCommitPolicy({
				commitPolicy: "backend-commits",
			}),
		).toBe("none");
		expect(resolveStateCommitPolicy({ commitPolicy: "no-commit" })).toBe(
			"none",
		);

		driverMocks.runInline.mockClear();
		output.restore();
		output = attachJsonHelpers(captureCliOutput());

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--commit-policy",
			"backend-commits",
			"--state-commit-policy",
			"final-state-commit",
			"--envelope",
			fixture.envelopePath,
		]);

		spec = firstRunInlineSpec();
		expect(spec.commitPolicy).toBe("backend-commits");
		expect(spec.stateCommitPolicy).toBe("final-state-commit");
		expect(resolveStateCommitPolicy(spec)).toBe("final-state-commit");
	});

	test("persists the explicit envelope content snapshot into the run spec", async () => {
		const fixture = await setupFixture(1);
		await writeFile(
			fixture.envelopePath,
			"Launch envelope snapshot\n",
			"utf-8",
		);

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

		const spec = firstRunInlineSpec();
		const persisted = JSON.parse(
			await readFile(join(spec.workdir, "spec.json"), "utf-8"),
		) as DriverRunSpec;
		expect(spec.promptTemplate).toMatchObject({
			envelopePath: fixture.envelopePath,
			envelopeContent: "Launch envelope snapshot\n",
		});
		expect(persisted.promptTemplate).toMatchObject({
			envelopePath: fixture.envelopePath,
			envelopeContent: "Launch envelope snapshot\n",
		});
	});

	// @cosmo-behavior plan:coding-agnostic-framework#B-011
	test("uses the framework default envelope when --envelope is omitted", async () => {
		const fixture = await setupFixture(1);
		const expectedEnvelopePath = resolveDefaultDriveEnvelopePath();
		const expectedContent = await readFile(expectedEnvelopePath, "utf-8");

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--mode",
			"inline",
		]);

		const spec = firstRunInlineSpec();
		expect(spec.promptTemplate.envelopePath).toBe(expectedEnvelopePath);
		expect(relative(originalCwd, spec.promptTemplate.envelopePath)).toBe(
			DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
		);
		expect(spec.promptTemplate.envelopePath).not.toContain("bundled/coding");
		expect(spec.promptTemplate.envelopeContent).toBe(expectedContent);
	});

	// @cosmo-behavior plan:coding-agnostic-framework#B-025
	test("honors an explicit legacy bundled envelope path", async () => {
		const fixture = await setupFixture(1);
		const legacyEnvelopePath = join(
			originalCwd,
			"bundled",
			"coding",
			"drivers",
			"templates",
			"envelope.md",
		);
		const legacyContent = await readFile(legacyEnvelopePath, "utf-8");

		await parseDrive([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--mode",
			"inline",
			"--envelope",
			legacyEnvelopePath,
		]);

		const spec = firstRunInlineSpec();
		expect(spec.promptTemplate.envelopePath).toBe(legacyEnvelopePath);
		expect(spec.promptTemplate.envelopePath).toContain(
			"bundled/coding/drivers/templates/envelope.md",
		);
		expect(spec.promptTemplate.envelopePath).not.toContain(
			"bundled/coding/coding",
		);
		expect(spec.promptTemplate.envelopeContent).toBe(legacyContent);
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

		expect(driverMocks.launchDetached).toHaveBeenCalledTimes(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: firstLaunchDetachedSpec().runId,
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
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
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

	test("resume reuses the persisted envelope snapshot instead of resolving a live path", async () => {
		const fixture = await setupFixture(2);
		const overrideEnvelopePath = join(temp.path, "override-envelope.md");
		await writeFile(overrideEnvelopePath, "Override envelope\n", "utf-8");
		const persistedEnvelopePath = join(temp.path, "previous-envelope.md");
		await writeResumeRun(
			fixture.tasks.map((task) => task.id),
			[],
			{
				promptTemplate: {
					envelopePath: persistedEnvelopePath,
					envelopeContent: "Persisted envelope snapshot\n",
				},
			},
		);
		await rm(persistedEnvelopePath, { force: true });

		await parseDrive([
			"--plan",
			PLAN,
			"--resume",
			"run-previous",
			"--envelope",
			overrideEnvelopePath,
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec().promptTemplate).toMatchObject({
			envelopePath: persistedEnvelopePath,
			envelopeContent: "Persisted envelope snapshot\n",
		});
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-005
	test("resume finalizes pending commit failure before invoking backend work", async () => {
		const fixture = await setupFixture(2);
		const taskIds = fixture.tasks.map((task) => task.id);
		await writeResumeRun(taskIds, [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		const completionPath = join(resumeWorkdir(), "run.completion.json");
		await writeFile(
			completionPath,
			'{"outcome":"finalization_failed"}\n',
			"utf-8",
		);
		await writePendingCommitFinalization(taskIds[0] ?? "TASK-001");
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "source-sha",
				status: [" M src/feature.ts\n", ""],
				diffHasChanges: true,
			}),
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

		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			false,
		);
		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(firstRunInlineSpec().taskIds).toEqual(taskIds);
		expect(firstRunInlineSpec().remainingTaskIds).toEqual([taskIds[1]]);
		expect(
			(await fixture.manager.getTask(taskIds[0] ?? "TASK-001"))?.status,
		).toBe("Done");
		expect(
			await readFile(join(resumeWorkdir(), "events.jsonl"), "utf-8"),
		).toContain('"type":"task_done"');

		driverMocks.runInline.mockClear();
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		await rm(resumeWorkdir(), { recursive: true, force: true });
		const detachedFixture = await setupFixture(6);
		const detachedTaskIds = detachedFixture.tasks.map((task) => task.id);
		await writeResumeRun(detachedTaskIds, [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		const detachedCompletionPath = join(resumeWorkdir(), "run.completion.json");
		await writeFile(
			detachedCompletionPath,
			'{"outcome":"finalization_failed"}\n',
			"utf-8",
		);
		await writePendingCommitFinalization(detachedTaskIds[0] ?? "TASK-001");
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "detached-source-sha",
				status: [" M src/feature.ts\n", ""],
				diffHasChanges: true,
			}),
		);
		driverMocks.launchDetached.mockImplementationOnce(
			async (spec: DriverRunSpec) => {
				expect(existsSync(detachedCompletionPath)).toBe(false);
				return {
					runId: spec.runId,
					planSlug: spec.planSlug,
					workdir: spec.workdir,
					eventLogPath: spec.eventLogPath,
					pid: 1234,
				};
			},
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).toHaveBeenCalledTimes(1);
		expect(firstLaunchDetachedSpec().taskIds).toEqual(detachedTaskIds);
		expect(firstLaunchDetachedSpec().remainingTaskIds).toEqual(
			detachedTaskIds.slice(1),
		);
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-006
	test("resume accepts changed HEAD as existing commit for pending finalization", async () => {
		const fixture = await setupFixture(1);
		const taskId = fixture.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([taskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(taskId, {
			headBeforeFinalization: "before-sha",
		});
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			false,
		);
		expect((await fixture.manager.getTask(taskId))?.status).toBe("Done");
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "completed",
			tasksDone: 1,
		});
		expect(
			await readFile(join(resumeWorkdir(), "events.jsonl"), "utf-8"),
		).toContain('"sha":"external-sha"');
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-007
	test("resume refuses external commit acceptance without changed head evidence", async () => {
		const fixture = await setupFixture(1);
		const taskId = fixture.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([taskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(taskId, {
			headBeforeFinalization: "same-sha",
		});
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "same-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
		expect((await fixture.manager.getTask(taskId))?.status).not.toBe("Done");
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "commit",
		});

		process.exitCode = undefined;
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const missingHeadFixture = await setupFixture(1);
		const missingHeadTaskId = missingHeadFixture.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([missingHeadTaskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(missingHeadTaskId, {
			headBeforeFinalization: undefined,
		});
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
		expect(
			(await missingHeadFixture.manager.getTask(missingHeadTaskId))?.status,
		).not.toBe("Done");

		process.exitCode = undefined;
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const dirtyFixture = await setupFixture(1);
		const dirtyTaskId = dirtyFixture.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([dirtyTaskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(dirtyTaskId);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "before-sha",
				status: " M src/feature.ts\n",
				diffHasChanges: true,
				commitError: "hook rejected",
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
		expect((await dirtyFixture.manager.getTask(dirtyTaskId))?.status).not.toBe(
			"Done",
		);
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-008
	test("resume refuses state commit external acceptance when pending tasks are missing or not done", async () => {
		const fixture = await setupFixture(2);
		const taskIds = fixture.tasks.map((task) => task.id);
		for (const task of fixture.tasks) {
			await fixture.manager.updateTask(task.id, { status: "Done" });
		}
		await writeResumeRun(
			taskIds,
			taskIds.map((taskId) => ({ type: "task_done", taskId })),
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writePendingStateCommitFinalization(taskIds);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-state-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			false,
		);
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "completed",
			stateCommitSha: "external-state-sha",
		});

		process.exitCode = undefined;
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const notDoneFixture = await setupFixture(1);
		const notDoneTaskId = notDoneFixture.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun(
			[notDoneTaskId],
			[{ type: "task_done", taskId: notDoneTaskId }],
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writePendingStateCommitFinalization([notDoneTaskId]);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-state-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "state_commit",
		});

		process.exitCode = undefined;
		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		await setupFixture(1);
		await writeResumeRun(["TASK-999"], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "final-state-commit",
		});
		await writePendingStateCommitFinalization(["TASK-999"]);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-state-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-015
	test("resume retries pending state commit without invoking backend work", async () => {
		const fixture = await setupFixture(2);
		const taskIds = fixture.tasks.map((task) => task.id);
		for (const task of fixture.tasks) {
			await fixture.manager.updateTask(task.id, { status: "Done" });
		}
		await writeResumeRun(
			taskIds,
			taskIds.map((taskId) => ({ type: "task_done", taskId })),
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writeFile(
			join(resumeWorkdir(), "pending-finalization.json"),
			`${JSON.stringify({
				runId: "run-previous",
				planSlug: PLAN,
				createdAt: "2026-01-01T00:00:00.000Z",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				reason: "state commit failed: hook rejected",
				phase: "state_commit",
				taskIds,
				headBeforeFinalization: "before-sha",
			})}\n`,
			"utf-8",
		);
		childProcessMocks.execFile.mockImplementation(
			(
				_cmd: string,
				args: readonly string[],
				_options: unknown,
				callback: (
					error: Error | null,
					result: { stdout: string; stderr: string },
				) => void,
			) => {
				if (args[0] === "rev-parse") {
					callback(null, { stdout: "after-sha\n", stderr: "" });
					return {};
				}
				if (args[0] === "status") {
					callback(null, {
						stdout: " M missions/tasks/TASK-001 - Drive task 1.md\n",
						stderr: "",
					});
					return {};
				}
				if (args[0] === "diff") {
					const error = new Error("diff found changes") as Error & {
						code: number;
					};
					error.code = 1;
					callback(error, { stdout: "", stderr: "" });
					return {};
				}
				callback(null, { stdout: "", stderr: "" });
				return {};
			},
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			false,
		);
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "completed",
			stateCommitSha: "after-sha",
		});
		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"git",
			expect.arrayContaining([
				"commit",
				"-m",
				`Drive state: mark ${PLAN} tasks done`,
			]),
			expect.objectContaining({ cwd: temp.path }),
			expect.any(Function),
		);
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-009
	test("resume records source task-status and state-commit finalizer retry failures as attempts", async () => {
		const resetResumeCase = async () => {
			process.exitCode = undefined;
			driverMocks.runInline.mockClear();
			driverMocks.launchDetached.mockClear();
			childProcessMocks.execFile.mockClear();
			output.restore();
			output = attachJsonHelpers(captureCliOutput());
			await rm(resumeWorkdir(), { recursive: true, force: true });
		};

		const sourceSuccess = await setupFixture(1);
		const sourceSuccessTaskId = sourceSuccess.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([sourceSuccessTaskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(sourceSuccessTaskId, {
			headBeforeFinalization: "before-sha",
		});
		await seedFailedFinalizerAttempt(
			`finalizer-source-commit-${sourceSuccessTaskId}`,
			"commit",
			sourceSuccessTaskId,
		);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			false,
		);
		expect(
			await readDurableFinalizerAttempts(
				`finalizer-source-commit-${sourceSuccessTaskId}`,
			),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({
					outcome: "failed",
					nextAction: "retry",
				}),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "success",
					nextAction: "continue",
					commits: [
						{
							sha: "external-sha",
							subject: `${sourceSuccessTaskId}: Drive task 1`,
						},
					],
				}),
			}),
		]);

		await resetResumeCase();
		const sourceFailure = await setupFixture(1);
		const sourceFailureTaskId = sourceFailure.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun([sourceFailureTaskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingCommitFinalization(sourceFailureTaskId, {
			headBeforeFinalization: "same-sha",
		});
		await seedFailedFinalizerAttempt(
			`finalizer-source-commit-${sourceFailureTaskId}`,
			"commit",
			sourceFailureTaskId,
		);
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "same-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(existsSync(join(resumeWorkdir(), "pending-finalization.json"))).toBe(
			true,
		);
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "commit",
			finalizationReason: "HEAD unchanged since failed commit finalization",
		});
		expect(
			await readDurableFinalizerAttempts(
				`finalizer-source-commit-${sourceFailureTaskId}`,
			),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "failed" }),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "failed",
					summary: "HEAD unchanged since failed commit finalization",
					nextAction: "retry",
				}),
			}),
		]);

		await resetResumeCase();
		await setupFixture(1);
		const missingTaskId = "TASK-999";
		await writeResumeRun([missingTaskId], [], {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await writePendingTaskStatusFinalization(missingTaskId, "committed-sha");
		await seedFailedFinalizerAttempt(
			`finalizer-task-status-${missingTaskId}`,
			"task_status",
			missingTaskId,
			"committed-sha",
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "task_status",
			finalizationReason:
				"status update failed after commit: Task not found: TASK-999",
		});
		expect(
			await readDurableFinalizerAttempts(
				`finalizer-task-status-${missingTaskId}`,
			),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "failed" }),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "failed",
					summary:
						"status update failed after commit: Task not found: TASK-999",
					nextAction: "retry",
					commits: [{ sha: "committed-sha" }],
				}),
			}),
		]);

		await resetResumeCase();
		const notDoneState = await setupFixture(1);
		const notDoneTaskId = notDoneState.tasks[0]?.id ?? "TASK-001";
		await writeResumeRun(
			[notDoneTaskId],
			[{ type: "task_done", taskId: notDoneTaskId }],
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writePendingStateCommitFinalization([notDoneTaskId]);
		await seedFailedFinalizerAttempt("finalizer-state-commit", "state_commit");
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-state-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "state_commit",
			finalizationReason: `pending state task is not Done: ${notDoneTaskId}`,
		});
		expect(
			await readDurableFinalizerAttempts("finalizer-state-commit"),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "failed" }),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "success",
					nextAction: "continue",
				}),
			}),
			expect.objectContaining({
				attemptId: "attempt-003",
				result: expect.objectContaining({
					outcome: "failed",
					summary: `pending state task is not Done: ${notDoneTaskId}`,
					nextAction: "retry",
				}),
			}),
		]);

		await resetResumeCase();
		const dirtyState = await setupFixture(1);
		const dirtyTaskId = dirtyState.tasks[0]?.id ?? "TASK-001";
		await dirtyState.manager.updateTask(dirtyTaskId, { status: "Done" });
		await writeResumeRun(
			[dirtyTaskId],
			[{ type: "task_done", taskId: dirtyTaskId }],
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writePendingStateCommitFinalization([dirtyTaskId]);
		await seedFailedFinalizerAttempt("finalizer-state-commit", "state_commit");
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-state-sha",
				status: ["", ` M missions/tasks/${dirtyTaskId} - Drive task 1.md\n`],
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "state_commit",
			finalizationReason: `pending state task files still have changes: missions/tasks/${dirtyTaskId} - Drive task 1.md`,
		});
		expect(
			await readDurableFinalizerAttempts("finalizer-state-commit"),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "failed" }),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "success",
					nextAction: "continue",
				}),
			}),
			expect.objectContaining({
				attemptId: "attempt-003",
				result: expect.objectContaining({
					outcome: "failed",
					summary: `pending state task files still have changes: missions/tasks/${dirtyTaskId} - Drive task 1.md`,
					nextAction: "retry",
				}),
			}),
		]);

		await resetResumeCase();
		const unchangedState = await setupFixture(1);
		const unchangedTaskId = unchangedState.tasks[0]?.id ?? "TASK-001";
		await unchangedState.manager.updateTask(unchangedTaskId, {
			status: "Done",
		});
		await writeResumeRun(
			[unchangedTaskId],
			[{ type: "task_done", taskId: unchangedTaskId }],
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
			},
		);
		await writePendingStateCommitFinalization([unchangedTaskId]);
		await seedFailedFinalizerAttempt("finalizer-state-commit", "state_commit");
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "before-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(process.exitCode).toBe(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-previous",
			outcome: "finalization_failed",
			finalizationPhase: "state_commit",
			finalizationReason:
				"HEAD unchanged since failed state commit finalization",
		});
		expect(
			await readDurableFinalizerAttempts("finalizer-state-commit"),
		).toEqual([
			expect.objectContaining({
				attemptId: "attempt-001",
				result: expect.objectContaining({ outcome: "failed" }),
			}),
			expect.objectContaining({
				attemptId: "attempt-002",
				result: expect.objectContaining({
					outcome: "success",
					nextAction: "continue",
				}),
			}),
			expect.objectContaining({
				attemptId: "attempt-003",
				result: expect.objectContaining({
					outcome: "failed",
					summary: "HEAD unchanged since failed state commit finalization",
					nextAction: "retry",
				}),
			}),
		]);
	});

	test("slices resume task IDs after the highest done or blocked previous task", async () => {
		const fixture = await setupFixture(4);
		await writeResumeRun(
			fixture.tasks.map((task) => task.id),
			[
				{
					type: "task_finalization_failed",
					taskId: fixture.tasks[0]?.id ?? "TASK-001",
					phase: "commit",
					reason: "commit failed",
				},
				{ type: "task_done", taskId: fixture.tasks[1]?.id ?? "TASK-002" },
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
			taskIds: fixture.tasks.map((task) => task.id),
			remainingTaskIds: fixture.tasks.slice(2).map((task) => task.id),
		});
	});

	// @cosmo-behavior plan:durable-run-store-events#B-010
	test("resume uses legacy driver events while dual-writing normalized resume events", async () => {
		const fixture = await setupFixture(3);
		const taskIds = fixture.tasks.map((task) => task.id);
		await writeResumeRun(
			taskIds,
			[{ type: "task_done", taskId: taskIds[0] ?? "TASK-001" }],
			{
				commitPolicy: "driver-commits",
				stateCommitPolicy: "none",
			},
		);
		await writePendingCommitFinalization(taskIds[1] ?? "TASK-002", {
			headBeforeFinalization: "before-sha",
		});
		childProcessMocks.execFile.mockImplementation(
			gitMock({
				head: "external-sha",
				status: "",
				diffHasChanges: false,
			}),
		);

		await parseDrive(["--plan", PLAN, "--resume", "run-previous"]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(firstRunInlineSpec()).toMatchObject({
			runId: "run-previous",
			taskIds,
			remainingTaskIds: [taskIds[2]],
		});
		expect(
			(await fixture.manager.getTask(taskIds[1] ?? "TASK-002"))?.status,
		).toBe("Done");
		const legacyEvents = await readJsonl(join(resumeWorkdir(), "events.jsonl"));
		expect(legacyEvents.map((event) => event.type)).toEqual([
			"task_done",
			"finalize",
			"commit_made",
			"finalize",
			"finalize",
			"finalize",
			"task_done",
		]);
		expect(legacyEvents[0]).toMatchObject({
			type: "task_done",
			taskId: taskIds[0],
		});
		const runRecord = JSON.parse(
			await readFile(join(resumeWorkdir(), "run.json"), "utf-8"),
		) as { eventsPath: string };
		const normalizedEvents = await readJsonl(
			join(resumeWorkdir(), "orchestration-events.jsonl"),
		);
		expect(runRecord.eventsPath).toBe(
			join(resumeWorkdir(), "orchestration-events.jsonl"),
		);
		expect(
			normalizedEvents
				.map((event) => event.event?.type)
				.filter((type) => type !== "run_activity"),
		).toEqual([
			"step_tool_activity",
			"artifact_written",
			"step_tool_activity",
			"step_tool_activity",
			"step_tool_activity",
			"step_completed",
		]);
		expect(
			normalizedEvents.filter((event) => event.event?.type === "run_activity"),
		).toHaveLength(6);
	});
});

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveCompatProgram();
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
	events: Array<{
		type: "task_done" | "task_blocked" | "task_finalization_failed";
		taskId: string;
		phase?: "commit" | "task_status";
		reason?: string;
	}> = [],
	specOverrides: Partial<DriverRunSpec> = {},
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
		...specOverrides,
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
		events.length === 0
			? ""
			: `${events
					.map((event) =>
						JSON.stringify({
							...event,
							runId: "run-previous",
							parentSessionId: "previous-parent",
							timestamp: "2026-01-01T00:00:00.000Z",
						}),
					)
					.join("\n")}\n`,
		"utf-8",
	);
}

async function writePendingCommitFinalization(
	taskId: string,
	overrides: Partial<{
		headBeforeFinalization: string | undefined;
	}> = {},
): Promise<void> {
	await writeFile(
		join(resumeWorkdir(), "pending-finalization.json"),
		`${JSON.stringify({
			runId: "run-previous",
			planSlug: PLAN,
			createdAt: "2026-01-01T00:00:00.000Z",
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
			reason: "commit failed: hook rejected",
			phase: "commit",
			taskId,
			headBeforeFinalization: "before-sha",
			commitSubject: `${taskId}: Drive task 1`,
			verifiedAt: "2026-01-01T00:00:00.000Z",
			...overrides,
		})}\n`,
		"utf-8",
	);
}

async function writePendingTaskStatusFinalization(
	taskId: string,
	commitSha: string,
): Promise<void> {
	await writeFile(
		join(resumeWorkdir(), "pending-finalization.json"),
		`${JSON.stringify({
			runId: "run-previous",
			planSlug: PLAN,
			createdAt: "2026-01-01T00:00:00.000Z",
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
			reason: "status update failed after commit: task manager unavailable",
			phase: "task_status",
			taskId,
			commitSha,
		})}\n`,
		"utf-8",
	);
}

async function writePendingStateCommitFinalization(
	taskIds: readonly string[],
): Promise<void> {
	await writeFile(
		join(resumeWorkdir(), "pending-finalization.json"),
		`${JSON.stringify({
			runId: "run-previous",
			planSlug: PLAN,
			createdAt: "2026-01-01T00:00:00.000Z",
			commitPolicy: "driver-commits",
			stateCommitPolicy: "final-state-commit",
			reason: "state commit failed: hook rejected",
			phase: "state_commit",
			taskIds,
			headBeforeFinalization: "before-sha",
		})}\n`,
		"utf-8",
	);
}

async function seedFailedFinalizerAttempt(
	stepId: string,
	phase: "commit" | "task_status" | "state_commit",
	taskId?: string,
	commitSha?: string,
): Promise<void> {
	const store = durableRunStore();
	await store.createRun({
		scope: PLAN,
		runId: "run-previous",
		eventsPath: "orchestration-events.jsonl",
		metadata: {
			source: "drive",
			legacyEventsPath: join(resumeWorkdir(), "events.jsonl"),
			parentSessionId: "previous-parent",
			driveTaskIds: taskId ? [taskId] : [],
			configuredBackendName: "claude-cli",
		},
	});
	const result = {
		outcome: "failed" as const,
		summary: "previous finalizer attempt failed",
		artifacts: [
			{
				id: "pending-finalization",
				path: "pending-finalization.json",
				kind: "pending-finalization",
			},
		],
		nextAction: "retry" as const,
		...(commitSha ? { commits: [{ sha: commitSha }] } : {}),
	};
	const step: StepRecord = {
		id: stepId,
		runId: "run-previous",
		title: `Seeded finalizer ${stepId}`,
		kind: "finalizer",
		backend: { name: "shell-command", options: { drivePhase: phase } },
		dependsOn: taskId ? [taskId] : [],
		status: "failed",
		inputArtifacts: [],
		outputArtifacts: result.artifacts,
		result,
		latestAttemptId: "attempt-001",
	};
	await store.writeStepRecord({ scope: PLAN, runId: "run-previous" }, step);
	await store.writeStepAttemptRecord(
		{ scope: PLAN, runId: "run-previous", stepId },
		{
			attemptId: "attempt-001",
			startedAt: "2026-01-01T00:00:00.000Z",
			endedAt: "2026-01-01T00:00:01.000Z",
			result,
		},
		{ outputText: "previous finalizer attempt failed\n" },
	);
}

async function readDurableFinalizerAttempts(
	stepId: string,
): Promise<StepAttemptRecord[]> {
	return durableRunStore().listStepAttemptRecords({
		scope: PLAN,
		runId: "run-previous",
		stepId,
	});
}

function durableRunStore(): FileRunStore {
	return new FileRunStore({
		rootDir: join(temp.path, "missions", "sessions"),
	});
}

function gitMock({
	head,
	status,
	diffHasChanges,
	commitError,
}: {
	head: string;
	status: string | string[];
	diffHasChanges: boolean;
	commitError?: string;
}) {
	const statusOutputs = Array.isArray(status) ? [...status] : undefined;
	return (
		_cmd: string,
		args: readonly string[],
		_options: unknown,
		callback: (
			error: Error | null,
			result: { stdout: string; stderr: string },
		) => void,
	) => {
		if (args[0] === "rev-parse") {
			callback(null, { stdout: `${head}\n`, stderr: "" });
			return {};
		}
		if (args[0] === "status") {
			callback(null, {
				stdout: statusOutputs?.shift() ?? (Array.isArray(status) ? "" : status),
				stderr: "",
			});
			return {};
		}
		if (args[0] === "diff") {
			if (diffHasChanges) {
				const error = new Error("diff found changes") as Error & {
					code: number;
				};
				error.code = 1;
				callback(error, { stdout: "", stderr: "" });
				return {};
			}
			callback(null, { stdout: "", stderr: "" });
			return {};
		}
		if (args[0] === "commit" && commitError) {
			callback(new Error(commitError), { stdout: "", stderr: commitError });
			return {};
		}
		callback(null, { stdout: "", stderr: "" });
		return {};
	};
}

function firstRunInlineSpec(): DriverRunSpec {
	return driverMocks.runInline.mock.calls[0]?.[0] as DriverRunSpec;
}

function firstLaunchDetachedSpec(): DriverRunSpec {
	return driverMocks.launchDetached.mock.calls[0]?.[0] as DriverRunSpec;
}

function resumeWorkdir(): string {
	return join(temp.path, "missions", "sessions", PLAN, "runs", "run-previous");
}

interface JsonlRecord {
	type?: string;
	taskId?: string;
	event?: { type?: string };
}

async function readJsonl(path: string): Promise<JsonlRecord[]> {
	return (await readFile(path, "utf-8"))
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as JsonlRecord);
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
		stdoutJson: () => JSON.parse(lastJsonLine(capture.stdout())),
		stderrJson: () => JSON.parse(capture.stderr()) as Record<string, unknown>,
	});
}

function lastJsonLine(output: string): string {
	const line = output
		.trim()
		.split("\n")
		.reverse()
		.find((candidate) => candidate.startsWith("{"));
	if (!line) {
		throw new Error(`No JSON object line found in output: ${output}`);
	}
	return line;
}
