import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	appendFile,
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
import {
	bridgeJsonlToActivityBus,
	type DriverBusEvent,
} from "../../lib/driver/event-stream.ts";
import { getPlanLockPath, isProcessAlive } from "../../lib/driver/lock.ts";
import {
	readDriveTerminalRecord,
	writeFallbackRunCompletion,
} from "../../lib/driver/run-state.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { recordEpisode } from "../../lib/memory/episode.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

type ChildProcess = import("node:child_process").ChildProcess;

const detachedSpawnSeam = vi.hoisted(() => ({
	next: undefined as (() => ChildProcess) | undefined,
}));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	const spawn = ((...args: unknown[]) => {
		const replacement = detachedSpawnSeam.next;
		if (replacement) {
			detachedSpawnSeam.next = undefined;
			return replacement();
		}
		return Reflect.apply(actual.spawn, undefined, args);
	}) as typeof actual.spawn;
	return { ...actual, spawn };
});

const temp = useTempDir("driver-detached-test-");

const envKeys = [
	"COSMONAUTS_DRIVER_CODEX_BINARY",
	"COSMONAUTS_TEST_LOCK_PATH",
	"COSMONAUTS_TEST_LOCK_OBSERVED",
	"COSMONAUTS_TEST_BACKEND_READY",
	"COSMONAUTS_TEST_BACKEND_RELEASE",
] as const;
const savedEnv: Partial<Record<(typeof envKeys)[number], string>> = {};
const sentinelPids: number[] = [];

afterEach(() => {
	detachedSpawnSeam.next = undefined;
	for (const pid of sentinelPids.splice(0)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// The escalation path is expected to have killed it already.
		}
	}
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

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-002
	test("bridges a post-terminal episode capture failure to the detached parent bus", async () => {
		const fixture = await setupFixture({
			runId: "run-detached-terminal-capture-failure",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(fixture.projectRoot);
		const fakeCodex = await writeBlockingFakeCodex(
			join(temp.path, "blocking-bin"),
		);
		const readyPath = join(fixture.spec.workdir, "backend-ready");
		const releasePath = join(fixture.spec.workdir, "backend-release");
		setEnv("COSMONAUTS_DRIVER_CODEX_BINARY", fakeCodex);
		setEnv("COSMONAUTS_TEST_BACKEND_READY", readyPath);
		setEnv("COSMONAUTS_TEST_BACKEND_RELEASE", releasePath);

		const handle = startDetached(fixture.spec, {
			...fixture.deps,
			cosmonautsRoot: fixture.projectRoot,
		});
		await waitForFile(readyPath);
		await blockEpisodeDirectory(fixture.projectRoot);
		await writeFile(releasePath, "continue\n", "utf-8");

		const result = await handle.result;
		expect(result).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
		});
		const legacyEvents = await readDriverEvents(fixture.spec.eventLogPath);
		const legacyDiagnostics = legacyEvents.filter(isEpisodeCaptureDiagnostic);
		expect(legacyDiagnostics).toHaveLength(1);
		expect(legacyEvents.findIndex(isTerminalDriverEvent)).toBeLessThan(
			legacyEvents.findIndex(isEpisodeCaptureDiagnostic),
		);

		const parentEvents = publishedDriverEvents(fixture.deps.published);
		const parentDiagnostics = parentEvents.filter(isEpisodeCaptureDiagnostic);
		expect(parentDiagnostics).toEqual(legacyDiagnostics);
		expect(parentDiagnostics).toHaveLength(1);
		expect(parentEvents.findIndex(isTerminalDriverEvent)).toBeLessThan(
			parentEvents.findIndex(isEpisodeCaptureDiagnostic),
		);

		const durable = await new FileRunStore({
			rootDir: join(fixture.projectRoot, "missions", "sessions"),
		}).readEvents({ scope: fixture.spec.planSlug, runId: fixture.spec.runId });
		expect(
			durable.diagnostics.filter(
				(diagnostic) => diagnostic.code === "episode_capture_failed",
			),
		).toHaveLength(1);
		expect(
			JSON.parse(
				await readFile(
					join(fixture.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			),
		).toEqual(result);
	}, 30_000);

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-004
	test("bounds post-terminal bridge drain when the child does not exit", async () => {
		const fixture = await setupFixture({
			runId: "run-detached-bounded-drain",
			episodeIdentity: true,
		});
		const prebuiltRoot = join(temp.path, "bounded-drain-prebuilt");
		await writeFakePrebuiltRunner(prebuiltRoot, fixture.spec.runId);
		await mkdir(fixture.spec.workdir, { recursive: true });
		const terminal = runCompletedDriverEvent(fixture.spec);
		const diagnostic = episodeCaptureFailedDriverEvent(fixture.spec);
		await writeFile(
			fixture.spec.eventLogPath,
			`${JSON.stringify(terminal)}\n${JSON.stringify(diagnostic)}\n`,
			"utf-8",
		);
		await writeFile(
			join(fixture.spec.workdir, "run.completion.json"),
			`${JSON.stringify(completedResult(fixture.spec.runId, "2026-07-22T22:00:00.000Z"), null, 2)}\n`,
			"utf-8",
		);
		const child = createMockDetachedChild(42104);
		detachedSpawnSeam.next = () => child;

		const startedAt = Date.now();
		const handle = startDetached(fixture.spec, {
			...fixture.deps,
			cosmonautsRoot: prebuiltRoot,
		});
		await expect(handle.result).resolves.toMatchObject({
			outcome: "completed",
		});
		const elapsedMs = Date.now() - startedAt;

		expect(elapsedMs).toBeGreaterThanOrEqual(1_900);
		expect(elapsedMs).toBeLessThan(4_000);
		expect(publishedDriverEvents(fixture.deps.published)).toEqual([
			terminal,
			diagnostic,
		]);
		await appendFile(
			fixture.spec.eventLogPath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(fixture.spec, "late"))}\n`,
			"utf-8",
		);
		await delay(300);
		expect(publishedDriverEvents(fixture.deps.published)).toEqual([
			terminal,
			diagnostic,
		]);

		const identityIncomplete = await setupFixture({
			runId: "run-detached-immediate-terminal-stop",
		});
		const immediatePrebuiltRoot = join(temp.path, "immediate-stop-prebuilt");
		await writeFakePrebuiltRunner(
			immediatePrebuiltRoot,
			identityIncomplete.spec.runId,
		);
		await mkdir(identityIncomplete.spec.workdir, { recursive: true });
		const immediateTerminal = runCompletedDriverEvent(identityIncomplete.spec);
		await writeFile(
			identityIncomplete.spec.eventLogPath,
			`${JSON.stringify(immediateTerminal)}\n${JSON.stringify(episodeCaptureFailedDriverEvent(identityIncomplete.spec))}\n`,
			"utf-8",
		);
		await writeFile(
			join(identityIncomplete.spec.workdir, "run.completion.json"),
			`${JSON.stringify(completedResult(identityIncomplete.spec.runId, "2026-07-22T22:10:00.000Z"), null, 2)}\n`,
			"utf-8",
		);
		detachedSpawnSeam.next = () => createMockDetachedChild(42108);
		const immediateStartedAt = Date.now();
		const immediateHandle = startDetached(identityIncomplete.spec, {
			...identityIncomplete.deps,
			cosmonautsRoot: immediatePrebuiltRoot,
		});
		await expect(immediateHandle.result).resolves.toMatchObject({
			outcome: "completed",
		});
		expect(Date.now() - immediateStartedAt).toBeLessThan(1_000);
		expect(publishedDriverEvents(identityIncomplete.deps.published)).toEqual([
			immediateTerminal,
		]);

		const abortFixture = await setupFixture({
			runId: "run-detached-abort-drain",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(abortFixture.projectRoot);
		const abortPrebuiltRoot = join(temp.path, "abort-drain-prebuilt");
		await writeAbortPrebuiltRunner(abortPrebuiltRoot);
		const abortHandle = startDetached(abortFixture.spec, {
			...abortFixture.deps,
			cosmonautsRoot: abortPrebuiltRoot,
		});
		await waitForFile(join(abortFixture.spec.workdir, "abort-ready"));
		const abortTerminal = runCompletedDriverEvent(abortFixture.spec);
		await appendFile(
			abortFixture.spec.eventLogPath,
			`${JSON.stringify(abortTerminal)}\n`,
			"utf-8",
		);
		await waitFor(() =>
			publishedDriverEvents(abortFixture.deps.published).some(
				(event) => event.type === "run_completed",
			),
		);
		await abortHandle.abort();
		await expect(abortHandle.result).resolves.toMatchObject({
			outcome: "aborted",
		});
		await appendFile(
			abortFixture.spec.eventLogPath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(abortFixture.spec, "after abort"))}\n`,
			"utf-8",
		);
		await delay(300);
		expect(
			publishedDriverEvents(abortFixture.deps.published).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toEqual([]);
	}, 10_000);

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-027
	test("stops a draining bridge when the detached result rejects", async () => {
		const resolved = await setupFixture({
			runId: "run-drain-finally-resolved",
			episodeIdentity: true,
		});
		const resolvedPrebuilt = join(temp.path, "drain-finally-resolved");
		await writeFakePrebuiltRunner(resolvedPrebuilt, resolved.spec.runId);
		await mkdir(resolved.spec.workdir, { recursive: true });
		await writeFile(
			resolved.spec.eventLogPath,
			`${JSON.stringify(runCompletedDriverEvent(resolved.spec))}\n`,
			"utf-8",
		);
		await writeFile(
			join(resolved.spec.workdir, "run.completion.json"),
			`${JSON.stringify(completedResult(resolved.spec.runId, "2026-07-22T23:00:00.000Z"), null, 2)}\n`,
			"utf-8",
		);
		detachedSpawnSeam.next = () => createMockDetachedChild(42105, true);
		const resolvedHandle = startDetached(resolved.spec, {
			...resolved.deps,
			cosmonautsRoot: resolvedPrebuilt,
		});
		await expect(resolvedHandle.result).resolves.toMatchObject({
			outcome: "completed",
		});
		await appendFile(
			resolved.spec.eventLogPath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(resolved.spec, "after resolve"))}\n`,
			"utf-8",
		);
		await delay(250);
		expect(
			publishedDriverEvents(resolved.deps.published).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toEqual([]);

		const rejected = await setupFixture({
			runId: "run-drain-finally-rejected",
			episodeIdentity: true,
		});
		const rejectedPrebuilt = join(temp.path, "drain-finally-rejected");
		await writeFakePrebuiltRunner(rejectedPrebuilt, rejected.spec.runId);
		await mkdir(rejected.spec.workdir, { recursive: true });
		await writeFile(
			rejected.spec.eventLogPath,
			`${JSON.stringify(runCompletedDriverEvent(rejected.spec))}\n`,
			"utf-8",
		);
		const rejectedChild = createMockDetachedChild(42106);
		detachedSpawnSeam.next = () => rejectedChild;
		const rejectedHandle = startDetached(rejected.spec, {
			...rejected.deps,
			cosmonautsRoot: rejectedPrebuilt,
		});
		await waitFor(() =>
			publishedDriverEvents(rejected.deps.published).some(
				(event) => event.type === "run_completed",
			),
		);
		rejectedChild.emit("exit", 1, null);
		await expect(rejectedHandle.result).rejects.toThrow(
			"Detached driver exited before writing completion",
		);
		await appendFile(
			rejected.spec.eventLogPath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(rejected.spec, "after reject"))}\n`,
			"utf-8",
		);
		await delay(250);
		expect(
			publishedDriverEvents(rejected.deps.published).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toEqual([]);

		const launchThrow = await setupFixture({
			runId: "run-drain-finally-launch-throw",
			episodeIdentity: true,
		});
		const launchThrowPrebuilt = join(temp.path, "drain-finally-launch-throw");
		await writeFakePrebuiltRunner(launchThrowPrebuilt, launchThrow.spec.runId);
		await mkdir(launchThrow.spec.workdir, { recursive: true });
		await writeFile(
			launchThrow.spec.eventLogPath,
			`${JSON.stringify(runCompletedDriverEvent(launchThrow.spec))}\n`,
			"utf-8",
		);
		detachedSpawnSeam.next = () => createPidThrowingDetachedChild(42107, 3);
		const launchThrowHandle = startDetached(launchThrow.spec, {
			...launchThrow.deps,
			cosmonautsRoot: launchThrowPrebuilt,
		});
		await expect(launchThrowHandle.result).rejects.toThrow(
			"fixture pid access failed",
		);
		await appendFile(
			launchThrow.spec.eventLogPath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(launchThrow.spec, "after launch throw"))}\n`,
			"utf-8",
		);
		await delay(250);
		expect(
			publishedDriverEvents(launchThrow.deps.published).filter(
				isEpisodeCaptureDiagnostic,
			),
		).toEqual([]);

		const bridgePath = join(temp.path, "self-stopping-drain.jsonl");
		const selfStoppingPublished: DriverBusEvent[] = [];
		await writeFile(
			bridgePath,
			`${JSON.stringify(runCompletedDriverEvent(launchThrow.spec))}\n`,
			"utf-8",
		);
		const bridge = bridgeJsonlToActivityBus(
			bridgePath,
			launchThrow.spec.runId,
			launchThrow.spec.parentSessionId,
			{ publish: (event) => selfStoppingPublished.push(event) },
			{ bridgeDriverDiagnostics: true },
		);
		await waitFor(() => selfStoppingPublished.length === 1);
		await delay(2_200);
		await appendFile(
			bridgePath,
			`${JSON.stringify(episodeCaptureFailedDriverEvent(launchThrow.spec, "after deadline"))}\n`,
			"utf-8",
		);
		await delay(250);
		expect(selfStoppingPublished).toHaveLength(1);
		await Promise.all([bridge.finish(), bridge.finish()]);
		bridge.stop();
		bridge.stop();
	}, 15_000);

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

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-009
	test("keeps pre-spawn abort and resume to one terminal attempt", async () => {
		const fixture = await setupFixture({
			runId: "run-pre-spawn-abort-resume",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(fixture.projectRoot);
		await recordDetachedStartEpisode(fixture.spec);
		const prebuiltRoot = join(temp.path, "pre-spawn-resume-prebuilt-root");
		await writeFakePrebuiltRunner(prebuiltRoot, fixture.spec.runId);
		const spawned = deferred<void>();
		const child = createMockDetachedChild(42009, true);
		let handle: ReturnType<typeof startDetached>;
		let parentAbort: Promise<void> | undefined;
		detachedSpawnSeam.next = () => {
			parentAbort = handle.abort();
			spawned.resolve();
			return child;
		};

		handle = startDetached(fixture.spec, {
			...fixture.deps,
			cosmonautsRoot: prebuiltRoot,
		});
		const rejectedResult = handle.result.catch((error: unknown) => error);
		await spawned.promise;
		await requirePromise(parentAbort);
		await expect(rejectedResult).resolves.toBeInstanceOf(Error);

		const completionPath = join(fixture.spec.workdir, "run.completion.json");
		const parentCompletion = JSON.parse(
			await readFile(completionPath, "utf-8"),
		) as DriverResult;
		expect(parentCompletion).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
			completedAt: expect.any(String),
		});

		const childCompletion = completedResult(
			fixture.spec.runId,
			"2026-07-22T20:09:00.000Z",
		);
		await recordDriveTerminalEpisode(fixture.spec, childCompletion);
		const settledCompletion = await writeFallbackRunCompletion(
			fixture.spec.workdir,
			childCompletion,
		);
		await recordDriveTerminalEpisode(fixture.spec, settledCompletion);

		const freshResumeSpec = JSON.parse(
			await readFile(join(fixture.spec.workdir, "spec.json"), "utf-8"),
		) as DriverRunSpec;
		await recordDriveTerminalEpisode(freshResumeSpec, childCompletion);

		expect(await readFile(completionPath, "utf-8")).toBe(
			`${JSON.stringify(parentCompletion, null, 2)}\n`,
		);
		const ledger = await readDriveTerminalRecord(
			fixture.spec.workdir,
			fixture.spec.episodeAttemptId ?? "",
		);
		expect(ledger).toMatchObject({
			attemptId: fixture.spec.episodeAttemptId,
			outcome: "aborted",
			state: "recorded",
		});
		const episodes = await readProjectDriveEpisodes(fixture.projectRoot);
		const attemptTag = `attempt:${fixture.spec.episodeAttemptId}`;
		const terminalEpisodes = episodes.filter(
			(episode) =>
				episode.tags.includes(attemptTag) && episode.outcome !== "started",
		);
		expect(terminalEpisodes).toHaveLength(1);
		expect(
			new Set(terminalEpisodes.map((episode) => episode.outcome)).size,
		).toBe(1);
		expect(terminalEpisodes.map((episode) => episode.outcome)).not.toEqual(
			expect.arrayContaining(["aborted", "completed"]),
		);
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

	// TASK-500 PR-001
	test("escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline", async () => {
		const fixture = await setupFixture({ runId: "run-abort-sigterm-ignored" });
		const prebuiltRoot = join(temp.path, "sigterm-ignored-prebuilt");
		await writeFakePrebuiltRunner(prebuiltRoot, fixture.spec.runId);
		const sentinelPid = await spawnSigtermIgnoringSentinel(
			join(temp.path, "sigterm-ignored-sentinel"),
		);
		const child = createMockDetachedChild(sentinelPid);
		const kill = vi.spyOn(process, "kill");

		try {
			detachedSpawnSeam.next = () => child;
			const handle = startDetached(fixture.spec, {
				...fixture.deps,
				cosmonautsRoot: prebuiltRoot,
			});
			await waitForFile(join(fixture.spec.workdir, "run.pid"));
			const baselineExitListeners = child.listenerCount("exit");

			const startedAt = Date.now();
			await handle.abort();
			const elapsedMs = Date.now() - startedAt;

			expect(
				kill.mock.calls
					.filter(([pid]) => pid === sentinelPid)
					.map(([, signal]) => signal)
					.filter((signal) => signal !== 0),
			).toEqual(["SIGTERM", "SIGKILL"]);
			await waitFor(() => !isProcessAlive(sentinelPid));
			expect(elapsedMs).toBeGreaterThanOrEqual(2_800);
			expect(elapsedMs).toBeLessThan(8_000);
			expect(child.listenerCount("exit")).toBe(baselineExitListeners);
			expect(child.listenerCount("error")).toBe(0);

			const abortedResult = {
				runId: fixture.spec.runId,
				outcome: "aborted",
				tasksDone: 0,
				tasksBlocked: 0,
			};
			await expect(handle.result).resolves.toEqual(abortedResult);
			expect(
				await readFile(
					join(fixture.spec.workdir, "run.completion.json"),
					"utf-8",
				),
			).toBe(`${JSON.stringify(abortedResult, null, 2)}\n`);
			await expect(
				stat(join(fixture.projectRoot, "memory", "agent")),
			).rejects.toMatchObject({ code: "ENOENT" });

			// The escalation deadline must not delay a child that does exit; the
			// sentinel pid is now dead, so this abort only waits on the handle.
			const fast = await setupFixture({ runId: "run-abort-fast-exit" });
			const fastPrebuilt = join(temp.path, "fast-exit-prebuilt");
			await writeFakePrebuiltRunner(fastPrebuilt, fast.spec.runId);
			const fastChild = createMockDetachedChild(sentinelPid);
			detachedSpawnSeam.next = () => fastChild;
			const fastHandle = startDetached(fast.spec, {
				...fast.deps,
				cosmonautsRoot: fastPrebuilt,
			});
			await waitForFile(join(fast.spec.workdir, "run.pid"));

			const fastStartedAt = Date.now();
			const aborting = fastHandle.abort();
			setTimeout(() => fastChild.emit("exit", null, "SIGTERM"), 50);
			await aborting;

			expect(Date.now() - fastStartedAt).toBeLessThan(1_500);
			expect(fastChild.listenerCount("exit")).toBe(0);
			expect(fastChild.listenerCount("error")).toBe(0);
			await expect(fastHandle.result).resolves.toEqual({
				runId: fast.spec.runId,
				outcome: "aborted",
				tasksDone: 0,
				tasksBlocked: 0,
			});
			// Let the unexpected-exit watchdog observe the completion before teardown.
			await delay(700);
		} finally {
			kill.mockRestore();
		}
	}, 30_000);

	// TASK-500 PR-001
	test("keeps one completion-backed aborted terminal when abort escalates to SIGKILL", async () => {
		const fixture = await setupFixture({
			runId: "run-abort-sigterm-ignored-enabled",
			episodeIdentity: true,
		});
		await writeEpisodicConfig(fixture.projectRoot);
		await recordDetachedStartEpisode(fixture.spec);
		const prebuiltRoot = join(temp.path, "sigterm-ignored-enabled-prebuilt");
		await writeFakePrebuiltRunner(prebuiltRoot, fixture.spec.runId);
		const sentinelPid = await spawnSigtermIgnoringSentinel(
			join(temp.path, "sigterm-ignored-enabled-sentinel"),
		);

		detachedSpawnSeam.next = () => createMockDetachedChild(sentinelPid);
		const handle = startDetached(fixture.spec, {
			...fixture.deps,
			cosmonautsRoot: prebuiltRoot,
		});
		await waitForFile(join(fixture.spec.workdir, "run.pid"));

		await Promise.all([handle.abort(), handle.abort()]);
		await waitFor(() => !isProcessAlive(sentinelPid));

		const completion = JSON.parse(
			await readFile(
				join(fixture.spec.workdir, "run.completion.json"),
				"utf-8",
			),
		) as DriverResult;
		expect(completion).toMatchObject({
			runId: fixture.spec.runId,
			outcome: "aborted",
			completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
		});
		await expect(handle.result).resolves.toEqual(completion);

		const attemptTag = `attempt:${fixture.spec.episodeAttemptId}`;
		const attemptEpisodes = (
			await readProjectDriveEpisodes(fixture.projectRoot)
		).filter((episode) => episode.tags.includes(attemptTag));
		const terminalEpisodes = attemptEpisodes.filter(
			(episode) => episode.outcome !== "started",
		);
		expect(attemptEpisodes).toHaveLength(2);
		expect(terminalEpisodes).toHaveLength(1);
		expect(terminalEpisodes[0]).toMatchObject({
			action: "drive.run",
			outcome: "aborted",
			timestamp: completion.completedAt,
		});
		expect(
			await readDriveTerminalRecord(
				fixture.spec.workdir,
				fixture.spec.episodeAttemptId ?? "",
			),
		).toMatchObject({ outcome: "aborted", state: "recorded" });
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

/**
 * A live process that ignores SIGTERM, so only escalation can end it. The pid is
 * registered for `afterEach` cleanup so a timed-out test cannot leak it.
 */
async function spawnSigtermIgnoringSentinel(dir: string): Promise<number> {
	await mkdir(dir, { recursive: true });
	const scriptPath = join(dir, "ignore-sigterm.sh");
	const readyPath = join(dir, "sentinel-ready");
	await writeFile(
		scriptPath,
		`#!/usr/bin/env bash
trap '' TERM
printf 'ready\\n' > "$1"
while true; do
  sleep 0.05
done
`,
		"utf-8",
	);
	await chmod(scriptPath, 0o755);

	const child = spawn(scriptPath, [readyPath], { stdio: "ignore" });
	child.unref();
	const pid = child.pid;
	if (pid === undefined) {
		throw new Error("Sentinel process did not expose a PID");
	}
	sentinelPids.push(pid);
	await waitForFile(readyPath);
	return pid;
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

async function writeBlockingFakeCodex(binDir: string): Promise<string> {
	await mkdir(binDir, { recursive: true });
	const path = join(binDir, "blocking-fake-codex");
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
if [ -z "$summary_path" ] || [ -z "\${COSMONAUTS_TEST_BACKEND_READY:-}" ] || [ -z "\${COSMONAUTS_TEST_BACKEND_RELEASE:-}" ]; then
  exit 64
fi
printf 'ready\\n' > "$COSMONAUTS_TEST_BACKEND_READY"
while [ ! -f "$COSMONAUTS_TEST_BACKEND_RELEASE" ]; do
  sleep 0.02
done
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

function runCompletedDriverEvent(
	spec: DriverRunSpec,
): Extract<DriverEvent, { type: "run_completed" }> {
	return {
		type: "run_completed",
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: "2026-07-22T22:00:00.000Z",
		summary: {
			total: spec.taskIds.length,
			done: spec.taskIds.length,
			blocked: 0,
		},
	};
}

function episodeCaptureFailedDriverEvent(
	spec: DriverRunSpec,
	message = "Episode capture skipped: fixture failure",
): Extract<DriverEvent, { type: "driver_diagnostic" }> {
	return {
		type: "driver_diagnostic",
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: "2026-07-22T22:00:01.000Z",
		level: "warning",
		code: "episode_capture_failed",
		message,
	};
}

function isTerminalDriverEvent(event: DriverEvent): boolean {
	return (
		event.type === "run_completed" ||
		event.type === "run_aborted" ||
		event.type === "run_finalization_failed"
	);
}

function createMockDetachedChild(pid: number, exited = false): ChildProcess {
	const emitter = new EventEmitter();
	Object.assign(emitter, {
		pid,
		exitCode: exited ? 0 : null,
		signalCode: null,
		unref: vi.fn(),
	});
	return emitter as ChildProcess;
}

function createPidThrowingDetachedChild(
	pid: number,
	throwOnAccess: number,
): ChildProcess {
	const emitter = new EventEmitter();
	let accesses = 0;
	Object.assign(emitter, {
		exitCode: null,
		signalCode: null,
		unref: vi.fn(),
	});
	Object.defineProperty(emitter, "pid", {
		get() {
			accesses += 1;
			if (accesses === throwOnAccess) {
				throw new Error("fixture pid access failed");
			}
			return pid;
		},
	});
	return emitter as ChildProcess;
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function requirePromise<T>(promise: Promise<T> | undefined): Promise<T> {
	if (!promise) throw new Error("Expected the race seam to publish a promise");
	return promise;
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
