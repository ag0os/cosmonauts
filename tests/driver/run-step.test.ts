import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	acquirePlanLock,
	getPlanLockPath,
	type LockHandle,
} from "../../lib/driver/lock.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("run-step-test-");

let compiledDir = "";
let binaryPath = "";

describe("run-step binary", () => {
	beforeAll(async () => {
		compiledDir = await mkdtemp(join(tmpdir(), "run-step-bin-"));
		binaryPath = join(compiledDir, "cosmonauts-drive-step");

		await execFileAsync(
			"bun",
			["build", "--compile", "lib/driver/run-step.ts", "--outfile", binaryPath],
			{
				cwd: resolve("."),
				maxBuffer: 1024 * 1024 * 10,
			},
		);
	});

	afterAll(async () => {
		await rm(compiledDir, { recursive: true, force: true });
	});

	test("runs from outside the source directory and writes completion, events, task status, and lock effects", async () => {
		const fixture = await setupFixture("run-276");
		const fakeCodex = await writeFakeCodex(fixture.binDir);
		const lockPath = getPlanLockPath(
			fixture.spec.planSlug,
			fixture.projectRoot,
		);
		const lockObservedPath = join(fixture.workdir, "lock-observed.txt");
		const outsideCwd = join(temp.path, "outside-cwd");
		await mkdir(outsideCwd, { recursive: true });

		const result = await execBinary(["--workdir", fixture.workdir], {
			cwd: outsideCwd,
			env: {
				COSMONAUTS_DRIVER_CODEX_BINARY: fakeCodex,
				COSMONAUTS_TEST_LOCK_PATH: lockPath,
				COSMONAUTS_TEST_LOCK_OBSERVED: lockObservedPath,
			},
		});

		expect(result).toMatchObject({ exitCode: 0 });
		await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readFile(lockObservedPath, "utf-8")).toBe("present\n");

		const completion = JSON.parse(
			await readFile(join(fixture.workdir, "run.completion.json"), "utf-8"),
		);
		expect(completion).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});

		const events = await readEvents(fixture.spec.eventLogPath);
		expect(events.map((event) => event.type)).toEqual([
			"run_started",
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
			"run_completed",
		]);
		expect(events[0]).toMatchObject({
			type: "run_started",
			mode: "detached",
			backend: "codex",
		});
		expect(events.find(isSpawnCompleted)?.report).toMatchObject({
			outcome: "success",
		});

		const taskManager = new TaskManager(fixture.projectRoot);
		await taskManager.init();
		expect((await taskManager.getTask(fixture.taskId))?.status).toBe("Done");
	});

	test("does not parse stale Codex env for claude-cli specs", async () => {
		const fixture = await setupFixture("run-claude-env", {
			backendName: "claude-cli",
		});
		const fakeClaude = await writeFakeClaude(fixture.binDir);

		const result = await execBinary(["--workdir", fixture.workdir], {
			cwd: temp.path,
			env: {
				COSMONAUTS_DRIVER_CLAUDE_BINARY: fakeClaude,
				COSMONAUTS_DRIVER_CODEX_EXEC_ARGS: "'unterminated",
			},
		});

		expect(result).toMatchObject({ exitCode: 0 });
		const events = await readEvents(fixture.spec.eventLogPath);
		expect(events[0]).toMatchObject({
			type: "run_started",
			backend: "claude-cli",
		});
		expect(events.find(isSpawnCompleted)?.report).toMatchObject({
			outcome: "success",
		});
	});

	test("exits nonzero without entering the loop when the plan lock is active", async () => {
		const fixture = await setupFixture("run-locked");
		const fakeCodex = await writeFakeCodex(fixture.binDir);
		const lock = await acquirePlanLock(
			fixture.spec.planSlug,
			"already-running",
			fixture.projectRoot,
		);
		if ("error" in lock) {
			throw new Error("Fixture lock unexpectedly active");
		}

		try {
			const result = await execBinary(["--workdir", fixture.workdir], {
				cwd: temp.path,
				env: { COSMONAUTS_DRIVER_CODEX_BINARY: fakeCodex },
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Plan lock active");
			await expect(
				stat(join(fixture.workdir, "run.completion.json")),
			).rejects.toMatchObject({ code: "ENOENT" });
			const taskManager = new TaskManager(fixture.projectRoot);
			await taskManager.init();
			expect((await taskManager.getTask(fixture.taskId))?.status).toBe("To Do");
		} finally {
			await (lock as LockHandle).release();
		}
	});
});

interface Fixture {
	projectRoot: string;
	workdir: string;
	binDir: string;
	taskId: string;
	spec: DriverRunSpec;
}

async function setupFixture(
	runId: string,
	overrides: Partial<Pick<DriverRunSpec, "backendName">> = {},
): Promise<Fixture> {
	const projectRoot = join(temp.path, runId, "project");
	const planSlug = "external-backends-and-cli";
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		planSlug,
		"runs",
		runId,
	);
	const binDir = join(temp.path, runId, "bin");
	await mkdir(workdir, { recursive: true });
	await mkdir(binDir, { recursive: true });

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Run Step Fixture",
		description: "Exercise the compiled run-step binary.",
	});
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Use the fake backend report.", "utf-8");

	const spec: DriverRunSpec = {
		runId,
		parentSessionId: "parent-session-276",
		projectRoot,
		planSlug,
		taskIds: [task.id],
		backendName: overrides.backendName ?? "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	await writeFile(
		join(workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);

	return { projectRoot, workdir, binDir, taskId: task.id, spec };
}

async function writeFakeCodex(binDir: string): Promise<string> {
	const path = join(binDir, "fake-codex");
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
summary_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      summary_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [ -z "$summary_path" ]; then
  echo "missing summary path" >&2
  exit 64
fi
if [ -n "\${COSMONAUTS_TEST_LOCK_PATH:-}" ] && [ -n "\${COSMONAUTS_TEST_LOCK_OBSERVED:-}" ]; then
  if [ -f "$COSMONAUTS_TEST_LOCK_PATH" ]; then
    printf 'present\\n' > "$COSMONAUTS_TEST_LOCK_OBSERVED"
  else
    printf 'missing\\n' > "$COSMONAUTS_TEST_LOCK_OBSERVED"
  fi
fi
printf '\`\`\`json\\n{"outcome":"success","files":[],"verification":[]}\\n\`\`\`\\n' > "$summary_path"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function writeFakeClaude(binDir: string): Promise<string> {
	const path = join(binDir, "fake-claude");
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
printf '\`\`\`json\\n{"outcome":"success","files":[],"verification":[]}\\n\`\`\`\\n'
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function execBinary(
	args: string[],
	options: { cwd: string; env?: Record<string, string> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(binaryPath, args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			encoding: "utf-8",
			maxBuffer: 1024 * 1024,
		});
		return { exitCode: 0, stdout: String(stdout), stderr: String(stderr) };
	} catch (error) {
		const err = error as {
			code?: number;
			stdout?: string | Buffer;
			stderr?: string | Buffer;
		};
		return {
			exitCode: typeof err.code === "number" ? err.code : 1,
			stdout: String(err.stdout ?? ""),
			stderr: String(err.stderr ?? ""),
		};
	}
}

async function readEvents(path: string): Promise<DriverEvent[]> {
	const raw = await readFile(path, "utf-8");
	return raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

function isSpawnCompleted(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "spawn_completed" }> {
	return event.type === "spawn_completed";
}
