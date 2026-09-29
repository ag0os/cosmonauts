import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import type { Backend } from "../../../lib/driver/backends/types.ts";
import type { DriverDeps } from "../../../lib/driver/driver.ts";
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
	runInline: vi.fn(),
	launchDetached: vi.fn(),
}));

const backendMocks = vi.hoisted(() => ({
	resolveBackend: vi.fn((name: string) => ({
		name,
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: vi.fn(),
	})),
	createCosmonautsSubagentBackend: vi.fn(
		(): Backend => ({
			name: "cosmonauts-subagent",
			capabilities: { canCommit: true, isolatedFromHostSource: false },
			run: vi.fn(),
		}),
	),
}));

const childProcessMocks = vi.hoisted(() => ({
	stdout: "",
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
			callback(null, { stdout: childProcessMocks.stdout, stderr: "" });
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

vi.mock("../../../lib/driver/backends/cosmonauts-subagent.ts", () => ({
	createCosmonautsSubagentBackend: backendMocks.createCosmonautsSubagentBackend,
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-run-characterization-");
const PLAN = "char-plan";

function createHandle(
	spec: DriverRunSpec,
	result: DriverResult | Promise<DriverResult>,
	persistCompletion = true,
): DriverHandle {
	const resolved = Promise.resolve(result);
	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		abort: vi.fn<() => Promise<void>>(async () => undefined),
		result: persistCompletion
			? resolved.then(async (completion) => {
					await mkdir(spec.workdir, { recursive: true });
					await writeFile(
						join(spec.workdir, "run.completion.json"),
						`${JSON.stringify(completion)}\n`,
						"utf-8",
					);
					return completion;
				})
			: resolved,
	};
}

function inlineReturns(result: DriverResult, persist = true) {
	driverMocks.runInline.mockImplementationOnce(
		(spec: DriverRunSpec, _deps: DriverDeps): DriverHandle =>
			createHandle(spec, { ...result, runId: spec.runId }, persist),
	);
}

function launchReturns() {
	driverMocks.launchDetached.mockImplementationOnce(
		async (spec: DriverRunSpec) => ({
			runId: spec.runId,
			planSlug: spec.planSlug,
			workdir: spec.workdir,
			eventLogPath: spec.eventLogPath,
			pid: 1,
		}),
	);
}

async function setup(count: number): Promise<{
	manager: TaskManager;
	tasks: Task[];
	ids: string[];
	envelope: string;
}> {
	const manager = new TaskManager(temp.path);
	await manager.init();
	const tasks: Task[] = [];
	for (let i = 0; i < count; i++) {
		tasks.push(
			await manager.createTask({
				title: `Task ${i + 1}`,
				labels: [`plan:${PLAN}`],
			}),
		);
	}
	const envelope = join(temp.path, "envelope.md");
	await writeFile(envelope, "Envelope\n", "utf-8");
	return { manager, tasks, ids: tasks.map((t) => t.id), envelope };
}

async function drive(args: string[]): Promise<void> {
	const program = createDriveCompatProgram();
	program.exitOverride();
	await program.parseAsync(args, { from: "user" });
}

function lastJson(text: string): Record<string, unknown> {
	const line = text
		.trim()
		.split("\n")
		.reverse()
		.find((candidate) => candidate.startsWith("{"));
	if (!line) throw new Error(`No JSON line in: ${text}`);
	return JSON.parse(line) as Record<string, unknown>;
}

const inlineSpec = () =>
	driverMocks.runInline.mock.calls[0]?.[0] as DriverRunSpec;
const detachedSpec = () =>
	driverMocks.launchDetached.mock.calls[0]?.[0] as DriverRunSpec;

describe("runDrive through the drive compat program (characterization)", () => {
	let output: ReturnType<typeof captureCliOutput>;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = captureCliOutput();
		process.exitCode = undefined;
		driverMocks.runInline.mockReset();
		driverMocks.launchDetached.mockReset();
		backendMocks.resolveBackend.mockClear();
		backendMocks.createCosmonautsSubagentBackend.mockClear();
		childProcessMocks.execFile.mockClear();
		childProcessMocks.stdout = "";
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	describe("argument failures", () => {
		test("an empty --plan value throws the missing-option error", async () => {
			await expect(drive(["--plan", ""])).rejects.toThrow(
				"Missing required option '--plan <slug>'",
			);
			expect(driverMocks.runInline).not.toHaveBeenCalled();
		});

		test("the reserved plan slug chain throws before any launch", async () => {
			await expect(drive(["--plan", "chain"])).rejects.toThrow(
				'Plan slug "chain" is reserved for graph-backed chain runs and cannot be used for Drive.',
			);
			expect(driverMocks.runInline).not.toHaveBeenCalled();
			expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		});

		test.each([
			["--backend", "nonsense", 'Invalid backend "nonsense"'],
			["--mode", "sideways", 'Invalid mode "sideways"'],
			["--commit-policy", "yolo", 'Invalid commit policy "yolo"'],
			["--state-commit-policy", "maybe", 'Invalid state commit policy "maybe"'],
			["--max-tasks", "0", "Expected a positive integer"],
			["--task-timeout", "1.5", "Expected a positive integer"],
			["--max-cost", "-1", "Expected a non-negative number"],
		])("rejects %s %s", async (flag, value, message) => {
			await expect(drive(["--plan", PLAN, flag, value])).rejects.toThrow(
				message,
			);
		});

		test("an explicitly selected Cancelled task is refused before launch", async () => {
			const fixture = await setup(1);
			await fixture.manager.updateTask(fixture.ids[0] ?? "", {
				status: "Cancelled",
			});
			await expect(
				drive([
					"--plan",
					PLAN,
					"--task-ids",
					fixture.ids[0] ?? "",
					"--envelope",
					fixture.envelope,
				]),
			).rejects.toThrow(
				`Drive cannot run Cancelled task(s): ${fixture.ids[0]} is Cancelled`,
			);
			expect(driverMocks.runInline).not.toHaveBeenCalled();
		});

		test("detached mode with the cosmonauts-subagent backend is refused with a JSON error", async () => {
			const fixture = await setup(1);
			await drive([
				"--plan",
				PLAN,
				"--mode",
				"detached",
				"--backend",
				"cosmonauts-subagent",
				"--envelope",
				fixture.envelope,
			]);
			expect(process.exitCode).toBe(1);
			expect(JSON.parse(output.stderr())).toEqual({
				error: "detached_backend_not_supported",
				backend: "cosmonauts-subagent",
				mode: "detached",
				message:
					"Backend cosmonauts-subagent is not supported for detached mode.",
			});
			expect(driverMocks.launchDetached).not.toHaveBeenCalled();
			expect(driverMocks.runInline).not.toHaveBeenCalled();
		});
	});

	describe("task selection and mode resolution", () => {
		test("defaults to the codex backend, inline mode, and every open plan task", async () => {
			const fixture = await setup(2);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 2,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(inlineSpec()).toMatchObject({
				planSlug: PLAN,
				taskIds: fixture.ids,
				backendName: "codex",
			});
			expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		});

		test("switches to detached at four or more open tasks", async () => {
			const fixture = await setup(4);
			launchReturns();
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(driverMocks.launchDetached).toHaveBeenCalledTimes(1);
			expect(driverMocks.runInline).not.toHaveBeenCalled();
			expect(detachedSpec().taskIds).toEqual(fixture.ids);
		});

		test("stays inline at three open tasks", async () => {
			const fixture = await setup(3);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 3,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		});

		test("does not select Done or Cancelled plan tasks by default", async () => {
			const fixture = await setup(3);
			await fixture.manager.updateTask(fixture.ids[0] ?? "", {
				status: "Done",
			});
			await fixture.manager.updateTask(fixture.ids[1] ?? "", {
				status: "Cancelled",
			});
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(inlineSpec().taskIds).toEqual([fixture.ids[2]]);
		});

		test("--max-tasks truncates the resolved list", async () => {
			const fixture = await setup(3);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 2,
				tasksBlocked: 0,
			});
			await drive([
				"--plan",
				PLAN,
				"--max-tasks",
				"2",
				"--envelope",
				fixture.envelope,
			]);
			expect(inlineSpec().taskIds).toEqual(fixture.ids.slice(0, 2));
		});

		test("--task-ids trims entries, drops blanks, and applies --max-tasks", async () => {
			const fixture = await setup(3);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 2,
				tasksBlocked: 0,
			});
			await drive([
				"--plan",
				PLAN,
				"--task-ids",
				` ${fixture.ids[2]} , ,${fixture.ids[0]},${fixture.ids[1]}`,
				"--max-tasks",
				"2",
				"--envelope",
				fixture.envelope,
			]);
			expect(inlineSpec().taskIds).toEqual([fixture.ids[2], fixture.ids[0]]);
		});

		test("an explicit --mode wins over the task-count heuristic", async () => {
			const fixture = await setup(4);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 4,
				tasksBlocked: 0,
			});
			await drive([
				"--plan",
				PLAN,
				"--mode",
				"inline",
				"--envelope",
				fixture.envelope,
			]);
			expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
			expect(driverMocks.launchDetached).not.toHaveBeenCalled();
		});

		test("cosmonauts-subagent inline builds the in-process backend", async () => {
			const fixture = await setup(1);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			});
			await drive([
				"--plan",
				PLAN,
				"--backend",
				"cosmonauts-subagent",
				"--envelope",
				fixture.envelope,
			]);
			expect(
				backendMocks.createCosmonautsSubagentBackend,
			).toHaveBeenCalledTimes(1);
			expect(backendMocks.resolveBackend).not.toHaveBeenCalled();
		});
	});

	describe("inline outcomes", () => {
		test("a completed run prints the scoped completion and exits 0", async () => {
			const fixture = await setup(1);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(process.exitCode).toBe(0);
			expect(lastJson(output.stdout())).toEqual({
				runId: inlineSpec().runId,
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
				scope: PLAN,
			});
		});

		test.each([
			"blocked",
			"aborted",
		] as const)("a %s run prints its completion and exits 1", async (outcome) => {
			const fixture = await setup(1);
			inlineReturns({
				runId: "",
				outcome,
				tasksDone: 0,
				tasksBlocked: 1,
				blockedReason: "why",
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			expect(process.exitCode).toBe(1);
			expect(lastJson(output.stdout())).toMatchObject({
				outcome,
				blockedReason: "why",
				scope: PLAN,
			});
		});

		test("a rejected run writes an aborted completion and rethrows", async () => {
			const fixture = await setup(1);
			driverMocks.runInline.mockImplementationOnce(
				(spec: DriverRunSpec): DriverHandle =>
					createHandle(spec, Promise.reject(new Error("kaboom"))),
			);
			await expect(
				drive(["--plan", PLAN, "--envelope", fixture.envelope]),
			).rejects.toThrow("kaboom");
			const completion = JSON.parse(
				await readFile(
					join(inlineSpec().workdir, "run.completion.json"),
					"utf-8",
				),
			);
			expect(completion).toEqual({
				runId: inlineSpec().runId,
				outcome: "aborted",
				tasksDone: 0,
				tasksBlocked: 0,
				blockedReason: "kaboom",
			});
		});

		test("a run that resolves without a persisted completion throws", async () => {
			const fixture = await setup(1);
			inlineReturns(
				{ runId: "", outcome: "completed", tasksDone: 1, tasksBlocked: 0 },
				false,
			);
			await expect(
				drive(["--plan", PLAN, "--envelope", fixture.envelope]),
			).rejects.toThrow(/^Drive graph returned without persisted completion: /);
		});

		test("streams run driver events as JSON lines on stderr while the run is live", async () => {
			const fixture = await setup(1);
			driverMocks.runInline.mockImplementationOnce(
				(spec: DriverRunSpec, deps: DriverDeps): DriverHandle => {
					const base = {
						runId: spec.runId,
						parentSessionId: spec.parentSessionId,
						timestamp: "2026-01-01T00:00:00.000Z",
					};
					deps.activityBus.publish({
						type: "driver_event",
						runId: spec.runId,
						parentSessionId: spec.parentSessionId,
						event: { ...base, type: "task_done", taskId: "TASK-1" },
					});
					deps.activityBus.publish({
						type: "driver_event",
						runId: "someone-else",
						parentSessionId: spec.parentSessionId,
						event: {
							...base,
							runId: "someone-else",
							type: "task_done",
							taskId: "X",
						},
					});
					return createHandle(spec, {
						runId: spec.runId,
						outcome: "completed",
						tasksDone: 1,
						tasksBlocked: 0,
					});
				},
			);
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			const lines = output
				.stderr()
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(lines).toEqual([
				{
					runId: inlineSpec().runId,
					parentSessionId: inlineSpec().parentSessionId,
					timestamp: "2026-01-01T00:00:00.000Z",
					type: "task_done",
					taskId: "TASK-1",
				},
			]);
		});

		test("records inline run state under the run workdir before the run starts", async () => {
			const fixture = await setup(1);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--envelope", fixture.envelope]);
			const workdir = inlineSpec().workdir;
			expect(workdir).toBe(
				join(
					process.cwd(),
					"missions",
					"sessions",
					PLAN,
					"runs",
					inlineSpec().runId,
				),
			);
			expect(
				JSON.parse(await readFile(join(workdir, "run.inline.json"), "utf-8")),
			).toMatchObject({ pid: process.pid });
		});
	});

	describe("detached launch", () => {
		test("prints the poll hint then the launch descriptor without waiting for completion", async () => {
			const fixture = await setup(1);
			launchReturns();
			await drive([
				"--plan",
				PLAN,
				"--mode",
				"detached",
				"--envelope",
				fixture.envelope,
			]);
			const spec = detachedSpec();
			const lines = output.stdout().trim().split("\n");
			expect(lines[0]).toBe(
				`Drive run started: ${spec.runId} - poll with: cosmonauts run status ${spec.runId}`,
			);
			expect(JSON.parse(lines[1] ?? "")).toEqual({
				runId: spec.runId,
				scope: PLAN,
				planSlug: PLAN,
				workdir: spec.workdir,
				eventLogPath: spec.eventLogPath,
			});
			expect(process.exitCode).toBeUndefined();
			expect(driverMocks.runInline).not.toHaveBeenCalled();
		});
	});

	describe("resume", () => {
		async function writeResume(taskIds: string[]): Promise<string> {
			const workdir = join(
				temp.path,
				"missions",
				"sessions",
				PLAN,
				"runs",
				"run-previous",
			);
			const spec: DriverRunSpec = {
				runId: "run-previous",
				parentSessionId: "previous-parent",
				projectRoot: temp.path,
				planSlug: PLAN,
				taskIds,
				backendName: "claude-cli",
				promptTemplate: {
					envelopePath: join(temp.path, "previous-envelope.md"),
				},
				preflightCommands: [],
				postflightCommands: [],
				commitPolicy: "no-commit",
				workdir,
				eventLogPath: join(workdir, "events.jsonl"),
			};
			await mkdir(workdir, { recursive: true });
			await writeFile(join(temp.path, "previous-envelope.md"), "Envelope\n");
			await writeFile(join(workdir, "spec.json"), JSON.stringify(spec));
			await writeFile(join(workdir, "events.jsonl"), "");
			return workdir;
		}

		test("a missing previous run rejects with ENOENT", async () => {
			await setup(1);
			await expect(
				drive(["--plan", PLAN, "--resume", "run-missing"]),
			).rejects.toMatchObject({ code: "ENOENT" });
		});

		test("a dirty worktree is refused with the dirty paths and exit code 1", async () => {
			const fixture = await setup(2);
			await writeResume(fixture.ids);
			childProcessMocks.stdout = " M src/a.ts\n?? b.ts\n";
			await drive(["--plan", PLAN, "--resume", "run-previous"]);
			expect(process.exitCode).toBe(1);
			expect(JSON.parse(output.stderr())).toEqual({
				error: "dirty_worktree",
				runId: "run-previous",
				planSlug: PLAN,
				dirtyPaths: ["src/a.ts", "b.ts"],
				message:
					"Refusing to resume with a dirty worktree. Pass --resume-dirty to override.",
			});
			expect(driverMocks.runInline).not.toHaveBeenCalled();
		});

		test("--resume-dirty bypasses the refusal and resumes with the original task ids and run id", async () => {
			const fixture = await setup(2);
			await writeResume(fixture.ids);
			childProcessMocks.stdout = " M src/a.ts\n";
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 2,
				tasksBlocked: 0,
			});
			await drive([
				"--plan",
				PLAN,
				"--resume",
				"run-previous",
				"--resume-dirty",
			]);
			expect(inlineSpec()).toMatchObject({
				runId: "run-previous",
				taskIds: fixture.ids,
				backendName: "claude-cli",
			});
			expect(process.exitCode).toBe(0);
		});

		test("a clean resume reuses the previous backend unless --backend overrides it", async () => {
			const fixture = await setup(1);
			await writeResume(fixture.ids);
			inlineReturns({
				runId: "",
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
			});
			await drive(["--plan", PLAN, "--resume", "run-previous"]);
			expect(backendMocks.resolveBackend).toHaveBeenCalledWith(
				"claude-cli",
				expect.anything(),
			);
		});
	});
});
