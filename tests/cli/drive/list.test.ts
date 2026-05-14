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

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
}));

const temp = useTempDir("drive-list-test-");

describe("cosmonauts drive list", () => {
	let output: ReturnType<typeof captureCliOutput> & JsonOutput;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		await mkdir(temp.path, { recursive: true });
		process.chdir(temp.path);
		output = attachJsonHelpers(captureCliOutput());
		process.exitCode = undefined;
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

	test("enumerates and classifies multiple runs across multiple plans", async () => {
		const completedWorkdir = await writeRunDir("plan-a", "run-completed");
		await writeCompletion(completedWorkdir, "run-completed", "completed");

		const runningStartedAt = localIso(2026, 0, 1, 0, 0, 0);
		const runningWorkdir = await writeRunDir("plan-a", "run-running");
		await writePid(runningWorkdir, 1111, runningStartedAt);
		childProcessMocks.startsByPid["1111"] = "Thu Jan  1 00:00:04 2026\n";

		const deadWorkdir = await writeRunDir("plan-b", "run-dead");
		await writePid(deadWorkdir, 2222, localIso(2026, 0, 1, 0, 0, 0));

		const orphanedWorkdir = await writeRunDir("plan-b", "run-orphaned");
		await writePid(orphanedWorkdir, 3333, localIso(2026, 0, 1, 0, 0, 0));
		childProcessMocks.startsByPid["3333"] = "Thu Jan  1 00:20:00 2026\n";

		const inlineWorkdir = await writeRunDir("plan-c", "run-inline");
		await writeInlineState(inlineWorkdir, 4444, localIso(2026, 0, 1, 0, 1, 0));
		await writeEvent(inlineWorkdir, localIso(2026, 0, 1, 0, 2, 0));
		childProcessMocks.startsByPid["4444"] = "Thu Jan  1 00:00:00 2026\n";

		const ignoredWorkdir = await writeRunDir("plan-c", "run-empty");
		expect(ignoredWorkdir).toContain("run-empty");

		await parseDrive(["list"]);

		expect(output.stdoutJson()).toMatchObject({
			runs: [
				{
					runId: "run-completed",
					planSlug: "plan-a",
					status: "completed",
					workdir: completedWorkdir,
					result: { runId: "run-completed", outcome: "completed" },
				},
				{
					runId: "run-running",
					planSlug: "plan-a",
					status: "running",
					workdir: runningWorkdir,
					pid: 1111,
					startedAt: runningStartedAt,
				},
				{
					runId: "run-dead",
					planSlug: "plan-b",
					status: "dead",
					workdir: deadWorkdir,
					pid: 2222,
				},
				{
					runId: "run-orphaned",
					planSlug: "plan-b",
					status: "orphaned",
					workdir: orphanedWorkdir,
					pid: 3333,
				},
				{
					runId: "run-inline",
					planSlug: "plan-c",
					status: "running",
					mode: "inline",
					workdir: inlineWorkdir,
					pid: 4444,
					lastEventAt: localIso(2026, 0, 1, 0, 2, 0),
				},
			],
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
	runId: string,
	outcome: "completed" | "aborted" | "blocked",
): Promise<void> {
	await writeFile(
		join(workdir, "run.completion.json"),
		`${JSON.stringify(
			{ runId, outcome, tasksDone: 1, tasksBlocked: 0 },
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
