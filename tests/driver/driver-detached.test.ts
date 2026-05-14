import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	BackendLivenessCheckError,
	DetachedNotSupportedError,
	type DriverDeps,
	startDetached,
} from "../../lib/driver/driver.ts";
import type { DriverBusEvent } from "../../lib/driver/event-stream.ts";
import { getPlanLockPath } from "../../lib/driver/lock.ts";
import type { DriverRunSpec } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-detached-test-");

const envKeys = [
	"COSMONAUTS_DRIVER_CODEX_BINARY",
	"COSMONAUTS_TEST_LOCK_PATH",
	"COSMONAUTS_TEST_LOCK_OBSERVED",
] as const;
const savedEnv: Partial<Record<(typeof envKeys)[number], string>> = {};

afterEach(() => {
	for (const key of envKeys) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
});

describe("startDetached", () => {
	test("rejects cosmonauts-subagent before creating the workdir", async () => {
		const { spec, deps } = await setupFixture({
			runId: "run-detached-unsupported",
			backendName: "cosmonauts-subagent",
		});

		expect(() => startDetached(spec, deps)).toThrow(DetachedNotSupportedError);
		await expect(stat(spec.workdir)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("runs backend liveness before creating the workdir and reports failures structurally", async () => {
		const { spec, deps } = await setupFixture({
			runId: "run-detached-liveness-fail",
			livenessExitCode: 7,
		});

		expect(() => startDetached(spec, deps)).toThrow(BackendLivenessCheckError);
		try {
			startDetached(spec, deps);
		} catch (error) {
			expect(error).toMatchObject({
				name: "BackendLivenessCheckError",
				code: "BACKEND_LIVENESS_CHECK_FAILED",
				exitCode: 7,
			} satisfies Partial<BackendLivenessCheckError>);
		}
		await expect(stat(spec.workdir)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("copies a prebuilt runner binary into the run workdir when available", async () => {
		const { spec, deps } = await setupFixture({
			runId: "run-detached-prebuilt",
		});
		const prebuiltRoot = join(temp.path, "prebuilt-root");
		await writeFakePrebuiltRunner(prebuiltRoot, spec.runId);

		const result = await startDetached(spec, {
			...deps,
			cosmonautsRoot: prebuiltRoot,
		}).result;

		expect(result).toEqual({
			runId: spec.runId,
			outcome: "completed",
			tasksDone: 0,
			tasksBlocked: 0,
		});
		const copiedBinary = await readFile(
			join(spec.workdir, "bin", "cosmonauts-drive-step"),
			"utf-8",
		);
		expect(copiedBinary).toContain("prebuilt-test-runner");
	});

	test("driver detached codex e2e prepares the workdir, launches the compiled runner, bridges events, and leaves locking to the child", async () => {
		const { spec, deps, taskId, projectRoot } = await setupFixture({
			runId: "run-detached-success",
		});
		const fakeCodex = await writeFakeCodex(join(temp.path, "bin"));
		const lockPath = getPlanLockPath(spec.planSlug, projectRoot);
		const observedLockPath = join(spec.workdir, "lock-observed.json");
		setEnv("COSMONAUTS_DRIVER_CODEX_BINARY", fakeCodex);
		setEnv("COSMONAUTS_TEST_LOCK_PATH", lockPath);
		setEnv("COSMONAUTS_TEST_LOCK_OBSERVED", observedLockPath);

		const handle = startDetached(spec, {
			...deps,
			cosmonautsRoot: projectRoot,
		});

		await waitForFile(join(spec.workdir, "run.pid"));
		const pidRecord = JSON.parse(
			await readFile(join(spec.workdir, "run.pid"), "utf-8"),
		) as {
			pid: number;
			startedAt: string;
			runArgv: string[];
			cosmonautsPath: string;
		};
		expect(pidRecord.pid).toEqual(expect.any(Number));
		expect(pidRecord.pid).not.toBe(process.pid);
		expect(pidRecord.startedAt).toEqual(expect.any(String));
		expect(pidRecord.runArgv).toEqual([join(spec.workdir, "run.sh")]);
		expect(pidRecord.cosmonautsPath).toBe(
			join(spec.workdir, "bin", "cosmonauts-drive-step"),
		);

		const result = await handle.result;
		expect(result).toEqual({
			runId: spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});

		await waitFor(() =>
			publishedEventTypes(deps.published).includes("run_completed"),
		);

		await expect(stat(join(spec.workdir, "run.sh"))).resolves.toBeTruthy();
		await expect(
			stat(join(spec.workdir, "prompts", `${taskId}.md`)),
		).resolves.toBeTruthy();
		await expect(
			stat(join(spec.workdir, "bin", "cosmonauts-drive-step")),
		).resolves.toBeTruthy();
		await expect(stat(spec.eventLogPath)).resolves.toBeTruthy();
		await expect(
			stat(join(spec.workdir, "run.completion.json")),
		).resolves.toBeTruthy();

		const writtenSpec = JSON.parse(
			await readFile(join(spec.workdir, "spec.json"), "utf-8"),
		);
		expect(writtenSpec).toEqual(spec);
		expect(await readFile(join(spec.workdir, "task-queue.txt"), "utf-8")).toBe(
			`${taskId}\n`,
		);

		const observedLock = JSON.parse(
			await readFile(observedLockPath, "utf-8"),
		) as { runId: string; pid: number };
		expect(observedLock.runId).toBe(spec.runId);
		expect(observedLock.pid).not.toBe(process.pid);

		expect(publishedEventTypes(deps.published)).toContain("task_done");
		expect(publishedEventTypes(deps.published)).toContain("run_completed");
		await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	}, 30_000);
});

interface FixtureOptions {
	runId: string;
	backendName?: DriverRunSpec["backendName"];
	livenessExitCode?: number;
}

interface Fixture {
	projectRoot: string;
	taskId: string;
	spec: DriverRunSpec;
	deps: DriverDeps & { published: DriverBusEvent[] };
}

async function setupFixture(options: FixtureOptions): Promise<Fixture> {
	const projectRoot = join(temp.path, options.runId, "project");
	const planSlug = "external-backends-and-cli";
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		planSlug,
		"runs",
		options.runId,
	);
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Detached Fixture",
		description: "Exercise startDetached.",
	});
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Use the fake backend report.", "utf-8");

	const spec: DriverRunSpec = {
		runId: options.runId,
		parentSessionId: `parent-${options.runId}`,
		projectRoot,
		planSlug,
		taskIds: [task.id],
		backendName: options.backendName ?? "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	const published: DriverBusEvent[] = [];
	const deps = {
		taskManager,
		backend: createLivenessBackend(options.livenessExitCode ?? 0),
		activityBus: {
			publish: (event: DriverBusEvent) => published.push(event),
		},
		cosmonautsRoot: resolve("."),
		published,
	};

	return { projectRoot, taskId: task.id, spec, deps };
}

function createLivenessBackend(exitCode: number): Backend {
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		livenessCheck() {
			return {
				argv: [process.execPath, "-e", `process.exit(${exitCode})`],
				expectExitZero: true,
			};
		},
		run: vi.fn<() => Promise<BackendRunResult>>(),
	};
}

async function writeFakePrebuiltRunner(
	cosmonautsRoot: string,
	runId: string,
): Promise<string> {
	const binDir = join(cosmonautsRoot, "bin");
	await mkdir(binDir, { recursive: true });
	const path = join(binDir, "cosmonauts-drive-step");
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
# prebuilt-test-runner
if [ "\${1:-}" != "--workdir" ] || [ -z "\${2:-}" ]; then
  echo "usage: cosmonauts-drive-step --workdir <dir>" >&2
  exit 64
fi
workdir="$2"
completion_tmp="$workdir/run.completion.json.$$"
printf '{"runId":"${runId}","outcome":"completed","tasksDone":0,"tasksBlocked":0}\n' > "$completion_tmp"
mv "$completion_tmp" "$workdir/run.completion.json"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function writeFakeCodex(binDir: string): Promise<string> {
	await mkdir(binDir, { recursive: true });
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
  observed_tmp="$COSMONAUTS_TEST_LOCK_OBSERVED.$$"
  cat "$COSMONAUTS_TEST_LOCK_PATH" > "$observed_tmp"
  mv "$observed_tmp" "$COSMONAUTS_TEST_LOCK_OBSERVED"
fi
sleep 0.05
printf '\`\`\`json\\n{"outcome":"success","files":[],"verification":[]}\\n\`\`\`\\n' > "$summary_path"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

function setEnv(key: (typeof envKeys)[number], value: string): void {
	if (!(key in savedEnv)) {
		savedEnv[key] = process.env[key];
	}
	process.env[key] = value;
}

function publishedEventTypes(events: DriverBusEvent[]): string[] {
	return events.flatMap((event) =>
		"event" in event ? [event.event.type] : [],
	);
}

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
	await waitFor(() => fileExists(path), timeoutMs);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs = 5_000,
): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await predicate()) {
			return;
		}
		await delay(50);
	}
	throw new Error("Timed out waiting for detached driver expectation");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
