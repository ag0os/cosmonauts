import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDriveProgram } from "../../../cli/drive/subcommand.ts";
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

describe("cosmonauts drive status", () => {
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
});

async function parseDrive(args: string[]): Promise<void> {
	const program = createDriveProgram();
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
): Promise<void> {
	await writeFile(
		join(workdir, "run.completion.json"),
		`${JSON.stringify(
			{ runId: RUN_ID, outcome, tasksDone: 2, tasksBlocked: 0 },
			null,
			2,
		)}\n`,
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
