import {
	chmod,
	mkdir,
	readFile,
	rm,
	stat,
	utimes,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { recordDriveTerminalEpisode } from "../../lib/driver/drive-graph-runner.ts";
import {
	BackendLivenessCheckError,
	DetachedNotSupportedError,
	type DriverDeps,
	startDetached,
} from "../../lib/driver/driver.ts";
import type { DriverBusEvent } from "../../lib/driver/event-stream.ts";
import { getPlanLockPath } from "../../lib/driver/lock.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import { recordEpisode } from "../../lib/memory/episode.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
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
		expect(writtenSpec).not.toHaveProperty("episodeSource");
		expect(writtenSpec).not.toHaveProperty("episodeAttemptId");
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
		await expect(
			stat(join(projectRoot, "memory", "agent")),
		).rejects.toMatchObject({ code: "ENOENT" });
	}, 30_000);

	// @cosmo-behavior plan:episodic-log#B-019
	test("reconciles one terminal episode when the parent aborts after detached start", async () => {
		const cases = [
			{
				name: "before-completion",
				existingCompletion: undefined,
				expectedOutcome: "aborted",
				terminalAlreadyCaptured: false,
			},
			{
				name: "between-completion-and-capture",
				existingCompletion: completedResult(
					"run-abort-between-completion-and-capture",
					"2026-07-21T15:01:00.000Z",
				),
				expectedOutcome: "completed",
				terminalAlreadyCaptured: false,
			},
			{
				name: "after-normal-terminal-capture",
				existingCompletion: completedResult(
					"run-abort-after-normal-terminal-capture",
					"2026-07-21T15:02:00.000Z",
				),
				expectedOutcome: "completed",
				terminalAlreadyCaptured: true,
			},
		] as const;

		for (const testCase of cases) {
			const runId = `run-abort-${testCase.name}`;
			const fixture = await setupFixture({
				runId,
				episodeIdentity: true,
			});
			await writeEpisodicConfig(fixture.projectRoot);
			await recordDetachedStartEpisode(fixture.spec);
			const prebuiltRoot = join(temp.path, `${testCase.name}-prebuilt-root`);
			await writeAbortPrebuiltRunner(prebuiltRoot, testCase.existingCompletion);

			const handle = startDetached(fixture.spec, {
				...fixture.deps,
				cosmonautsRoot: prebuiltRoot,
			});
			await waitForFile(join(fixture.spec.workdir, "abort-ready"));
			const completionPath = join(fixture.spec.workdir, "run.completion.json");

			if (testCase.terminalAlreadyCaptured && testCase.existingCompletion) {
				await recordDriveTerminalEpisode(
					fixture.spec,
					testCase.existingCompletion,
				);
				await writeFile(
					completionPath,
					`${JSON.stringify(testCase.existingCompletion, null, 2)}\n`,
					"utf-8",
				);
				await utimes(
					completionPath,
					new Date("2030-01-01T00:00:00.000Z"),
					new Date("2030-01-01T00:00:00.000Z"),
				);
			}

			await Promise.all([handle.abort(), handle.abort()]);
			await expect(
				readFile(join(fixture.spec.workdir, "child-exited"), "utf-8"),
			).resolves.toBe("SIGTERM\n");
			const result = await handle.result;
			const completionBytes = await readFile(completionPath, "utf-8");
			const completion = JSON.parse(completionBytes) as DriverResult;

			expect(result, testCase.name).toEqual(completion);
			expect(completion, testCase.name).toMatchObject({
				runId,
				outcome: testCase.expectedOutcome,
				tasksDone: 0,
				tasksBlocked: 0,
				completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
			});
			if (testCase.existingCompletion) {
				expect(completionBytes, testCase.name).toBe(
					`${JSON.stringify(testCase.existingCompletion, null, 2)}\n`,
				);
			}

			const episodes = await readProjectDriveEpisodes(fixture.projectRoot);
			const attemptTag = `attempt:${fixture.spec.episodeAttemptId}`;
			const attemptEpisodes = episodes.filter(
				(episode) =>
					episode.subject.id === runId && episode.tags.includes(attemptTag),
			);
			expect(attemptEpisodes, testCase.name).toHaveLength(2);
			expect(
				attemptEpisodes.filter((episode) => episode.outcome === "started"),
				testCase.name,
			).toHaveLength(1);
			const terminalEpisodes = attemptEpisodes.filter(
				(episode) => episode.outcome !== "started",
			);
			expect(terminalEpisodes, testCase.name).toHaveLength(1);
			expect(terminalEpisodes[0], testCase.name).toMatchObject({
				action: "drive.run",
				outcome: testCase.expectedOutcome,
				timestamp: completion.completedAt,
			});
		}
	}, 30_000);

	test("keeps abort capture and reporter failures non-fatal with one established warning", async () => {
		const captureFailure = await setupFixture({
			runId: "run-abort-capture-failure",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(captureFailure.projectRoot);
		await blockEpisodeDirectory(captureFailure.projectRoot);
		const captureCompletion = completedResult(
			captureFailure.spec.runId,
			"2026-07-21T15:03:00.000Z",
		);
		const capturePrebuiltRoot = join(
			temp.path,
			"capture-failure-prebuilt-root",
		);
		await writeAbortPrebuiltRunner(capturePrebuiltRoot, captureCompletion);
		const captureHandle = startDetached(captureFailure.spec, {
			...captureFailure.deps,
			cosmonautsRoot: capturePrebuiltRoot,
		});
		await waitForFile(join(captureFailure.spec.workdir, "abort-ready"));

		await expect(captureHandle.abort()).resolves.toBeUndefined();
		await expect(captureHandle.result).resolves.toEqual(captureCompletion);
		const diagnostics = (
			await readDriverEvents(captureFailure.spec.eventLogPath)
		).filter(isEpisodeCaptureDiagnostic);
		expect(diagnostics).toHaveLength(1);
		expect(
			publishedDriverEvents(captureFailure.deps.published).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toHaveLength(1);

		const reporterFailure = await setupFixture({
			runId: "run-abort-reporter-failure",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(reporterFailure.projectRoot);
		await blockEpisodeDirectory(reporterFailure.projectRoot);
		const reporterCompletion = completedResult(
			reporterFailure.spec.runId,
			"2026-07-21T15:04:00.000Z",
		);
		const reporterPrebuiltRoot = join(
			temp.path,
			"reporter-failure-prebuilt-root",
		);
		await writeAbortPrebuiltRunner(reporterPrebuiltRoot, reporterCompletion);
		const reporterHandle = startDetached(reporterFailure.spec, {
			...reporterFailure.deps,
			cosmonautsRoot: reporterPrebuiltRoot,
		});
		await waitForFile(join(reporterFailure.spec.workdir, "abort-ready"));
		await writeFile(reporterFailure.spec.eventLogPath, "", "utf-8");
		await chmod(reporterFailure.spec.eventLogPath, 0o444);
		const stderr = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		try {
			await expect(reporterHandle.abort()).resolves.toBeUndefined();
			await expect(reporterHandle.result).resolves.toEqual(reporterCompletion);
			expect(
				stderr.mock.calls.filter(([message]) =>
					String(message).includes("Episode capture skipped"),
				),
			).toHaveLength(1);
		} finally {
			stderr.mockRestore();
		}
	}, 30_000);
});

interface FixtureOptions {
	runId: string;
	backendName?: DriverRunSpec["backendName"];
	livenessExitCode?: number;
	episodeIdentity?: boolean;
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
		...(options.episodeIdentity
			? {
					episodeSource: "fixture/worker",
					episodeAttemptId: `attempt-${options.runId}`,
				}
			: {}),
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

async function writeAbortPrebuiltRunner(
	cosmonautsRoot: string,
	completion?: DriverResult,
): Promise<string> {
	const binDir = join(cosmonautsRoot, "bin");
	await mkdir(binDir, { recursive: true });
	const path = join(binDir, "cosmonauts-drive-step");
	const completionWrite = completion
		? `completion_tmp="$workdir/run.completion.json.$$"
cat > "$completion_tmp" <<'EOF'
${JSON.stringify(completion, null, 2)}
EOF
mv "$completion_tmp" "$workdir/run.completion.json"`
		: "";
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" != "--workdir" ] || [ -z "\${2:-}" ]; then
  exit 64
fi
workdir="$2"
on_term() {
  printf 'SIGTERM\\n' > "$workdir/child-exited"
  sleep 0.1
  exit 143
}
trap on_term TERM
${completionWrite}
printf 'ready\\n' > "$workdir/abort-ready"
while true; do
  sleep 0.05
done
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

function completedResult(runId: string, completedAt: string): DriverResult {
	return {
		runId,
		outcome: "completed",
		tasksDone: 0,
		tasksBlocked: 0,
		completedAt,
	};
}

async function writeEpisodicConfig(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

async function recordDetachedStartEpisode(spec: DriverRunSpec): Promise<void> {
	if (!spec.episodeSource || !spec.episodeAttemptId) {
		throw new Error("Expected frozen detached episode identity");
	}
	await recordEpisode({
		projectRoot: spec.projectRoot,
		event: {
			scope: "project",
			source: spec.episodeSource,
			action: "drive.run",
			outcome: "started",
			subject: { kind: "run", id: spec.runId },
			tags: [`attempt:${spec.episodeAttemptId}`],
			timestamp: "2026-07-21T15:00:00.000Z",
			summary: `Started Drive run "${spec.runId}".`,
			details: `Attempt ${spec.episodeAttemptId} started.`,
		},
	});
}

async function readProjectDriveEpisodes(projectRoot: string) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;

	return records.map((record) => {
		const metadata = parseEpisodeRecord(record);
		if (!metadata) throw new Error(`Invalid episode record: ${record.path}`);
		return {
			...metadata,
			tags: record.tags,
			timestamp: record.timestamp,
		};
	});
}

async function blockEpisodeDirectory(projectRoot: string): Promise<void> {
	const episodeDir = join(projectRoot, "memory", "agent", "episodes");
	await rm(episodeDir, { recursive: true, force: true });
	await mkdir(join(projectRoot, "memory", "agent"), { recursive: true });
	await writeFile(episodeDir, "path collision", "utf-8");
}

async function readDriverEvents(path: string): Promise<DriverEvent[]> {
	return (await readFile(path, "utf-8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

function isEpisodeCaptureDiagnostic(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "driver_diagnostic" }> {
	return (
		event.type === "driver_diagnostic" &&
		event.code === "episode_capture_failed"
	);
}

function publishedDriverEvents(events: DriverBusEvent[]): DriverEvent[] {
	return events.flatMap((event) => ("event" in event ? [event.event] : []));
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
