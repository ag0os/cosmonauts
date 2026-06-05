import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import type { DriverDeps } from "../../../lib/driver/driver.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
} from "../../../lib/driver/types.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn((spec: DriverRunSpec, _deps: DriverDeps): DriverHandle => {
		writeGraphRunFilesSync(spec.workdir, spec.runId);
		writeLegacyEventSync(spec.workdir, spec.runId, "2026-01-01T00:00:00.000Z");
		return createHandle(spec, {
			runId: spec.runId,
			outcome: "completed",
			tasksDone: spec.taskIds.length,
			tasksBlocked: 0,
		});
	}),
	startDetached: vi.fn(),
}));

const backendMocks = vi.hoisted(() => ({
	resolveConfiguredExternalBackend: vi.fn((name: string) => ({
		name,
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: vi.fn(),
	})),
}));

const childProcessMocks = vi.hoisted(() => ({
	execFile: vi.fn(
		(
			_cmd: string,
			args: readonly string[],
			_options: unknown,
			callback: (
				error: Error | null,
				result: { stdout: string; stderr: string },
			) => void,
		) => {
			const pid = args[1] ?? "";
			callback(null, {
				stdout: childProcessMocks.startsByPid[pid] ?? "",
				stderr: "",
			});
			return {};
		},
	),
	startsByPid: {} as Record<string, string>,
}));

vi.mock("../../../lib/driver/driver.ts", () => ({
	runInline: driverMocks.runInline,
	startDetached: driverMocks.startDetached,
}));

vi.mock("../../../lib/driver/backend-resolution.ts", () => ({
	resolveConfiguredExternalBackend:
		backendMocks.resolveConfiguredExternalBackend,
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-graph-run-");
const PLAN = "durable-frontend-migration";
let output: ReturnType<typeof captureCliOutput> & JsonOutput;

describe("cosmonauts run drive compat graph runs", () => {
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
		driverMocks.runInline.mockClear();
		driverMocks.startDetached.mockClear();
		backendMocks.resolveConfiguredExternalBackend.mockClear();
		childProcessMocks.execFile.mockClear();
		childProcessMocks.startsByPid = {};
		vi.spyOn(process, "kill").mockImplementation((pid) => {
			if (pid === 2222) {
				throw errno("ESRCH");
			}
			return true;
		});
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-019
	test("preserves drive run status list and completion files for graph runs", async () => {
		const fixture = await setupFixture();

		const runOutput = await parseJson([
			"--plan",
			PLAN,
			"--task-ids",
			fixture.taskId,
			"--mode",
			"inline",
			"--backend",
			"codex",
			"--envelope",
			fixture.envelopePath,
		]);
		const completedRunId = String(runOutput.runId);
		const completedWorkdir = runWorkdir(PLAN, completedRunId);
		await writeGraphRun({
			runId: "run-blocked",
			completion: { outcome: "blocked", tasksDone: 1, tasksBlocked: 1 },
		});
		await writeGraphRun({
			runId: "run-finalization-failed",
			completion: {
				outcome: "finalization_failed",
				tasksDone: 1,
				tasksBlocked: 0,
				finalizationPhase: "state_commit",
				finalizationReason: "state commit failed",
				pendingFinalizationPath: join(
					runWorkdir(PLAN, "run-finalization-failed"),
					"pending-finalization.json",
				),
			},
		});
		await writeGraphRun({
			runId: "run-running",
			pid: { pid: 1111, startedAt: localIso(2026, 0, 1, 0, 0, 0) },
		});
		await writeGraphRun({
			runId: "run-dead",
			pid: { pid: 2222, startedAt: localIso(2026, 0, 1, 0, 0, 0) },
		});
		await writeGraphRun({
			runId: "run-orphaned",
			pid: { pid: 3333, startedAt: localIso(2026, 0, 1, 0, 0, 0) },
		});
		await writeGraphRun({
			runId: "run-inline-running",
			inline: { pid: 4444, startedAt: localIso(2026, 0, 1, 0, 1, 0) },
		});
		await writeGraphRun({ runId: "run-graph-only" });
		childProcessMocks.startsByPid["1111"] = "Thu Jan  1 00:00:03 2026\n";
		childProcessMocks.startsByPid["3333"] = "Thu Jan  1 00:20:00 2026\n";
		childProcessMocks.startsByPid["4444"] = "Thu Jan  1 00:00:00 2026\n";

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(runOutput).toMatchObject({
			runId: completedRunId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		expect(
			await readJson(join(completedWorkdir, "run.completion.json")),
		).toMatchObject({
			runId: completedRunId,
			outcome: "completed",
		});
		expect(
			await readJson(join(completedWorkdir, "run.inline.json")),
		).toMatchObject({
			mode: "inline",
			pid: process.pid,
		});
		expect(await readJson(join(completedWorkdir, "graph.json"))).toMatchObject({
			runId: completedRunId,
		});

		await expectStatus(completedRunId, "completed", {
			workdir: completedWorkdir,
			result: { outcome: "completed" },
		});
		await expectStatus("run-blocked", "blocked", {
			result: { outcome: "blocked", tasksBlocked: 1 },
		});
		await expectStatus("run-finalization-failed", "finalization_failed", {
			result: {
				outcome: "finalization_failed",
				finalizationPhase: "state_commit",
			},
		});
		await expectStatus("run-running", "running", {
			mode: "detached",
			pid: 1111,
		});
		await expectStatus("run-dead", "dead", { mode: "detached", pid: 2222 });
		await expectStatus("run-orphaned", "orphaned", {
			mode: "detached",
			pid: 3333,
		});
		await expectStatus("run-inline-running", "running", {
			mode: "inline",
			pid: 4444,
		});

		const listOutput = await parseJson(["list"]);
		const runs = listOutput.runs as Array<Record<string, unknown>>;
		expect(statusByRunId(runs)).toMatchObject({
			[completedRunId]: "completed",
			"run-blocked": "blocked",
			"run-finalization-failed": "finalization_failed",
			"run-running": "running",
			"run-dead": "dead",
			"run-orphaned": "orphaned",
			"run-inline-running": "running",
		});
		expect(runs.map((run) => run.runId)).not.toContain("run-graph-only");
		expect(runs.find((run) => run.runId === completedRunId)).toMatchObject({
			planSlug: PLAN,
			workdir: completedWorkdir,
			result: { outcome: "completed" },
		});
	});
});

async function setupFixture(): Promise<{
	taskId: string;
	envelopePath: string;
}> {
	const taskManager = new TaskManager(process.cwd());
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Drive graph CLI compatibility task",
		labels: [`plan:${PLAN}`],
	});
	const envelopePath = join(process.cwd(), "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");
	return { taskId: task.id, envelopePath };
}

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveCompatProgram();
	program.exitOverride();
	await program.parseAsync(args, { from: "user" });
}

async function parseJson(args: string[]): Promise<Record<string, unknown>> {
	output.restore();
	output = attachJsonHelpers(captureCliOutput());
	await parseDrive(args);
	return output.stdoutJson();
}

async function expectStatus(
	runId: string,
	status: string,
	extra: Record<string, unknown>,
): Promise<void> {
	const record = await parseJson(["status", runId, "--plan", PLAN]);
	expect(record).toMatchObject({
		runId,
		planSlug: PLAN,
		status,
		workdir: runWorkdir(PLAN, runId),
		...extra,
	});
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
		abort: async () => undefined,
		result: Promise.resolve(result),
	};
}

async function writeGraphRun({
	runId,
	completion,
	pid,
	inline,
}: {
	runId: string;
	completion?: Partial<DriverResult> & Pick<DriverResult, "outcome">;
	pid?: { pid: number; startedAt: string };
	inline?: { pid: number; startedAt: string };
}): Promise<void> {
	const workdir = runWorkdir(PLAN, runId);
	await mkdir(workdir, { recursive: true });
	writeGraphRunFilesSync(workdir, runId);
	writeLegacyEventSync(workdir, runId, "2026-01-01T00:00:00.000Z");
	if (completion) {
		await writeFile(
			join(workdir, "run.completion.json"),
			`${JSON.stringify(
				{
					runId,
					tasksDone: 0,
					tasksBlocked: 0,
					...completion,
				},
				null,
			)}\n`,
			"utf-8",
		);
	}
	if (pid) {
		await writeFile(
			join(workdir, "run.pid"),
			`${JSON.stringify(pid, null, 2)}\n`,
			"utf-8",
		);
	}
	if (inline) {
		await writeFile(
			join(workdir, "run.inline.json"),
			`${JSON.stringify({ mode: "inline", ...inline }, null, 2)}\n`,
			"utf-8",
		);
	}
}

function writeGraphRunFilesSync(workdir: string, runId: string): void {
	mkdirSync(join(workdir, "steps"), { recursive: true });
	writeFileSync(
		join(workdir, "graph.json"),
		`${JSON.stringify({ runId, steps: [{ id: "TASK-1", kind: "drive" }] }, null, 2)}\n`,
		"utf-8",
	);
	writeFileSync(
		join(workdir, "steps", "TASK-1.json"),
		`${JSON.stringify({ runId, id: "TASK-1", status: "completed" }, null, 2)}\n`,
		"utf-8",
	);
}

function writeLegacyEventSync(
	workdir: string,
	runId: string,
	timestamp: string,
): void {
	writeFileSync(
		join(workdir, "events.jsonl"),
		`${JSON.stringify({ type: "run_started", runId, timestamp })}\n`,
		"utf-8",
	);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

function statusByRunId(
	runs: Array<Record<string, unknown>>,
): Record<string, unknown> {
	return Object.fromEntries(runs.map((run) => [run.runId, run.status]));
}

function runWorkdir(planSlug: string, runId: string): string {
	return join(process.cwd(), "missions", "sessions", planSlug, "runs", runId);
}

function localIso(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
): string {
	return new Date(year, month, day, hour, minute, second).toISOString();
}

function errno(code: string): NodeJS.ErrnoException {
	const error = new Error(code) as NodeJS.ErrnoException;
	error.code = code;
	return error;
}

interface JsonOutput {
	stdoutJson(): Record<string, unknown>;
}

function attachJsonHelpers(
	capture: ReturnType<typeof captureCliOutput>,
): ReturnType<typeof captureCliOutput> & JsonOutput {
	return Object.assign(capture, {
		stdoutJson: () => JSON.parse(capture.stdout()) as Record<string, unknown>,
	});
}
