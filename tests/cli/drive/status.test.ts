import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveCompatProgram } from "../../../cli/drive/subcommand.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn(),
	startDetached: vi.fn(),
}));

const childProcessMocks = vi.hoisted(() => ({
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
			callback(null, childProcessMocks.result);
			return {};
		},
	),
	result: { stdout: "", stderr: "" },
}));

vi.mock("../../../lib/driver/driver.ts", () => ({
	runInline: driverMocks.runInline,
	startDetached: driverMocks.startDetached,
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-status-test-");
const PLAN = "plan-a";
const RUN_ID = "run-123";

describe("cosmonauts run drive compat status", () => {
	let output: ReturnType<typeof captureCliOutput> & JsonOutput;
	let originalCwd: string;
	let killMock: ReturnType<typeof mockAlivePid>;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
		childProcessMocks.execFile.mockClear();
		childProcessMocks.result = { stdout: "", stderr: "" };
		killMock = mockAlivePid();
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	test("completion record present wins", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writeCompletion(workdir, "completed");
		await writePid(workdir, 1234, localIso(2026, 0, 1, 0, 0, 0));

		await parseDrive(["status", RUN_ID]);

		expect(killMock).not.toHaveBeenCalled();
		expect(childProcessMocks.execFile).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "completed",
			workdir,
			result: {
				runId: RUN_ID,
				outcome: "completed",
				tasksDone: 2,
				tasksBlocked: 0,
			},
		});
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-011
	test("reports finalization_failed completion details", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writeFinalizationFailedCompletion(workdir);

		await parseDrive(["status", RUN_ID]);

		expect(output.stdoutJson()).toEqual({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "finalization_failed",
			workdir,
			result: {
				runId: RUN_ID,
				outcome: "finalization_failed",
				tasksDone: 2,
				tasksBlocked: 0,
				finalizationPhase: "state_commit",
				finalizationReason: "state commit failed",
				finalizationTaskId: "TASK-333",
				finalizationCommitSha: "abc123def456",
				pendingFinalizationPath: join(workdir, "pending-finalization.json"),
			},
		});
		expect(output.stdout()).not.toContain("blockedTaskId");
		expect(output.stdout()).not.toContain("blockedReason");
	});

	test("pid alive and matching process start time reports running", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writePid(workdir, 1234, localIso(2026, 0, 1, 0, 0, 0));
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:00:03 2026\n",
			stderr: "",
		};

		await parseDrive(["status", RUN_ID, "--plan", PLAN]);

		expect(killMock).toHaveBeenCalledWith(1234, 0);
		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"ps",
			["-p", "1234", "-o", "lstart="],
			{ encoding: "utf-8" },
			expect.any(Function),
		);
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "running",
			mode: "detached",
			workdir,
			pid: 1234,
			startedAt: localIso(2026, 0, 1, 0, 0, 0),
		});
	});

	test("inline sentinel reports an active inline run with lastEventAt", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writeInlineState(workdir, 1234, localIso(2026, 0, 1, 0, 1, 0));
		await writeEvent(workdir, localIso(2026, 0, 1, 0, 2, 0));
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:00:00 2026\n",
			stderr: "",
		};

		await parseDrive(["status", RUN_ID, "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "running",
			mode: "inline",
			workdir,
			pid: 1234,
			startedAt: localIso(2026, 0, 1, 0, 1, 0),
			lastEventAt: localIso(2026, 0, 1, 0, 2, 0),
		});
	});

	test("pid dead reports dead", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writePid(workdir, 4321, localIso(2026, 0, 1, 0, 0, 0));
		killMock.mockImplementation(() => {
			throw errno("ESRCH");
		});

		await parseDrive(["status", RUN_ID, "--plan", PLAN]);

		expect(childProcessMocks.execFile).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "dead",
			workdir,
			pid: 4321,
		});
	});

	test("dead pid with terminal run_aborted event reports aborted", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writePid(workdir, 4321, localIso(2026, 0, 1, 0, 0, 0));
		await writeDriverEvent(workdir, {
			type: "run_aborted",
			reason: "operator stopped run",
			timestamp: localIso(2026, 0, 1, 0, 3, 0),
		});
		killMock.mockImplementation(() => {
			throw errno("ESRCH");
		});

		await parseDrive(["status", RUN_ID, "--plan", PLAN]);

		expect(childProcessMocks.execFile).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "aborted",
			workdir,
			mode: "detached",
			pid: 4321,
			lastEventAt: localIso(2026, 0, 1, 0, 3, 0),
		});
	});

	test("pid alive and start-time mismatch reports orphaned", async () => {
		const workdir = await writeRunDir(PLAN, RUN_ID);
		await writePid(workdir, 1234, localIso(2026, 0, 1, 0, 0, 0));
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:10:00 2026\n",
			stderr: "",
		};

		await parseDrive(["status", RUN_ID, "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: RUN_ID,
			planSlug: PLAN,
			status: "orphaned",
			workdir,
			pid: 1234,
		});
	});

	// @cosmo-behavior plan:durable-run-store-events#B-008
	test("ignores normalized runtime files when classifying drive status", async () => {
		const completedWorkdir = await writeRunDir(PLAN, "run-completed");
		await writeCompletion(completedWorkdir, "completed", "run-completed");
		await writePid(completedWorkdir, 1001, localIso(2026, 0, 1, 0, 0, 0));
		await writeInlineState(
			completedWorkdir,
			1002,
			localIso(2026, 0, 1, 0, 1, 0),
		);
		await writeNormalizedRuntimeFiles(completedWorkdir, "running");

		await parseDrive(["status", "run-completed", "--plan", PLAN]);

		expect(killMock).not.toHaveBeenCalled();
		expect(childProcessMocks.execFile).not.toHaveBeenCalled();
		expect(output.stdoutJson()).toMatchObject({
			runId: "run-completed",
			planSlug: PLAN,
			status: "completed",
			result: { outcome: "completed" },
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const blockedWorkdir = await writeRunDir(PLAN, "run-blocked");
		await writeCompletion(blockedWorkdir, "blocked", "run-blocked");
		await writeNormalizedRuntimeFiles(blockedWorkdir, "completed");

		await parseDrive(["status", "run-blocked", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-blocked",
			status: "blocked",
			result: { outcome: "blocked" },
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const abortedWorkdir = await writeRunDir(PLAN, "run-aborted");
		await writeCompletion(abortedWorkdir, "aborted", "run-aborted");
		await writeNormalizedRuntimeFiles(abortedWorkdir, "completed");

		await parseDrive(["status", "run-aborted", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-aborted",
			status: "aborted",
			result: { outcome: "aborted" },
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const finalizationFailedWorkdir = await writeRunDir(
			PLAN,
			"run-finalization-failed",
		);
		await writeFinalizationFailedCompletion(
			finalizationFailedWorkdir,
			"run-finalization-failed",
		);
		await writeNormalizedRuntimeFiles(finalizationFailedWorkdir, "completed");

		await parseDrive(["status", "run-finalization-failed", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-finalization-failed",
			status: "finalization_failed",
			result: { outcome: "finalization_failed" },
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const runningWorkdir = await writeRunDir(PLAN, "run-running");
		await writePid(runningWorkdir, 2001, localIso(2026, 0, 1, 0, 0, 0));
		await writeInlineState(runningWorkdir, 2002, localIso(2026, 0, 1, 0, 1, 0));
		await writeNormalizedRuntimeFiles(runningWorkdir, "completed");
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:00:03 2026\n",
			stderr: "",
		};

		await parseDrive(["status", "run-running", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-running",
			status: "running",
			mode: "detached",
			pid: 2001,
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const inlineRunningWorkdir = await writeRunDir(PLAN, "run-inline-running");
		await writeInlineState(
			inlineRunningWorkdir,
			2501,
			localIso(2026, 0, 1, 0, 1, 0),
		);
		await writeNormalizedRuntimeFiles(inlineRunningWorkdir, "completed");
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:00:00 2026\n",
			stderr: "",
		};

		await parseDrive(["status", "run-inline-running", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-inline-running",
			status: "running",
			mode: "inline",
			pid: 2501,
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const deadWorkdir = await writeRunDir(PLAN, "run-dead");
		await writePid(deadWorkdir, 3001, localIso(2026, 0, 1, 0, 0, 0));
		await writeNormalizedRuntimeFiles(deadWorkdir, "running");
		killMock.mockImplementationOnce(() => {
			throw errno("ESRCH");
		});

		await parseDrive(["status", "run-dead", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-dead",
			status: "dead",
			mode: "detached",
			pid: 3001,
		});

		output.restore();
		output = attachJsonHelpers(captureCliOutput());
		const orphanedWorkdir = await writeRunDir(PLAN, "run-orphaned");
		await writePid(orphanedWorkdir, 4001, localIso(2026, 0, 1, 0, 0, 0));
		await writeNormalizedRuntimeFiles(orphanedWorkdir, "running");
		childProcessMocks.result = {
			stdout: "Thu Jan  1 00:10:00 2026\n",
			stderr: "",
		};

		await parseDrive(["status", "run-orphaned", "--plan", PLAN]);

		expect(output.stdoutJson()).toMatchObject({
			runId: "run-orphaned",
			status: "orphaned",
			mode: "detached",
			pid: 4001,
		});
	});
});

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveCompatProgram();
	program.exitOverride();
	await program.parseAsync(args, { from: "user" });
}

async function writeRunDir(planSlug: string, runId: string): Promise<string> {
	const workdir = join(
		process.cwd(),
		"missions",
		"sessions",
		planSlug,
		"runs",
		runId,
	);
	await mkdir(workdir, { recursive: true });
	return workdir;
}

async function writeCompletion(
	workdir: string,
	outcome: "completed" | "aborted" | "blocked",
	runId = RUN_ID,
): Promise<void> {
	await writeFile(
		join(workdir, "run.completion.json"),
		`${JSON.stringify(
			{ runId, outcome, tasksDone: 2, tasksBlocked: 0 },
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

async function writeFinalizationFailedCompletion(
	workdir: string,
	runId = RUN_ID,
): Promise<void> {
	await writeFile(
		join(workdir, "run.completion.json"),
		`${JSON.stringify(
			{
				runId,
				outcome: "finalization_failed",
				tasksDone: 2,
				tasksBlocked: 0,
				finalizationPhase: "state_commit",
				finalizationReason: "state commit failed",
				finalizationTaskId: "TASK-333",
				finalizationCommitSha: "abc123def456",
				pendingFinalizationPath: join(workdir, "pending-finalization.json"),
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

async function writeNormalizedRuntimeFiles(
	workdir: string,
	status: string,
): Promise<void> {
	await writeFile(
		join(workdir, "run.json"),
		`${JSON.stringify(
			{
				runId: "normalized-run",
				kind: "drive",
				status,
				eventsPath: join(workdir, "orchestration-events.jsonl"),
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
	await writeFile(
		join(workdir, "orchestration-events.jsonl"),
		`${JSON.stringify({
			seq: 1,
			runId: "normalized-run",
			timestamp: "2026-01-01T00:00:00.000Z",
			event: { type: status === "completed" ? "run_completed" : "run_started" },
		})}\n`,
		"utf-8",
	);
}

async function writePid(
	workdir: string,
	pid: number,
	startedAt: string,
): Promise<void> {
	await writeFile(
		join(workdir, "run.pid"),
		`${JSON.stringify({ pid, startedAt }, null, 2)}\n`,
		"utf-8",
	);
}

async function writeInlineState(
	workdir: string,
	pid: number,
	startedAt: string,
): Promise<void> {
	await writeFile(
		join(workdir, "run.inline.json"),
		`${JSON.stringify({ mode: "inline", pid, startedAt }, null, 2)}\n`,
		"utf-8",
	);
}

async function writeEvent(workdir: string, timestamp: string): Promise<void> {
	await writeFile(
		join(workdir, "events.jsonl"),
		`${JSON.stringify({ type: "task_started", timestamp })}\n`,
		"utf-8",
	);
}

async function writeDriverEvent(
	workdir: string,
	event: Record<string, unknown>,
): Promise<void> {
	await writeFile(
		join(workdir, "events.jsonl"),
		`${JSON.stringify(event)}\n`,
		"utf-8",
	);
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

function mockAlivePid() {
	return vi.spyOn(process, "kill").mockImplementation(() => true);
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
