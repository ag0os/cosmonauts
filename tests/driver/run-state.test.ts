import { createHash } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { recordDriveTerminalEpisode } from "../../lib/driver/drive-graph-runner.ts";
import {
	clearPendingFinalization,
	PENDING_FINALIZATION_FILENAME,
	type PendingFinalizationState,
	pendingFinalizationPath,
	readDriveTerminalRecord,
	readPendingFinalization,
	writeDriveTerminalRecord,
	writePendingFinalization,
} from "../../lib/driver/run-state.ts";
import type { DriverResult, DriverRunSpec } from "../../lib/driver/types.ts";
import type { MemoryWarning } from "../../lib/memory/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-state-test-");

describe("run-state", () => {
	// @cosmo-behavior plan:episodic-log-detached-hardening#B-022
	test("marks an attempt only after successful terminal capture and permits retry after failure", async () => {
		const projectRoot = join(temp.path, "project");
		const workdir = join(projectRoot, "run");
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await mkdir(join(projectRoot, "memory"), { recursive: true });
		await mkdir(workdir, { recursive: true });
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
			"utf-8",
		);
		await writeFile(join(projectRoot, "memory", "agent"), "path collision");
		const spec = {
			runId: "run-two-phase-ledger",
			parentSessionId: "parent-two-phase-ledger",
			projectRoot,
			planSlug: "episodic-log-detached-hardening",
			taskIds: [],
			backendName: "codex",
			promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
			preflightCommands: [],
			postflightCommands: [],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
			episodeSource: "test/worker",
			episodeAttemptId: "attempt/two-phase/../unsafe",
		} satisfies DriverRunSpec;
		const result = {
			runId: spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			completedAt: "2026-07-22T16:00:00.000Z",
		} satisfies DriverResult;
		const warnings: MemoryWarning[] = [];

		await recordDriveTerminalEpisode(spec, result, (warning) => {
			warnings.push(warning);
		});

		expect(
			await readDriveTerminalRecord(workdir, spec.episodeAttemptId),
		).toEqual({
			version: 1,
			attemptId: spec.episodeAttemptId,
			outcome: "completed",
			timestamp: result.completedAt,
			state: "intended",
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain("Episode capture skipped");

		await rm(join(projectRoot, "memory", "agent"));
		await recordDriveTerminalEpisode(spec, result, (warning) => {
			warnings.push(warning);
		});

		expect(
			await readDriveTerminalRecord(workdir, spec.episodeAttemptId),
		).toEqual({
			version: 1,
			attemptId: spec.episodeAttemptId,
			outcome: "completed",
			timestamp: result.completedAt,
			state: "recorded",
		});
		const episodesDir = join(projectRoot, "memory", "agent", "episodes");
		const episodeNames = await readdir(episodesDir);
		expect(episodeNames).toHaveLength(1);
		const episodeBytes = await readFile(
			join(episodesDir, episodeNames[0] as string),
			"utf-8",
		);

		await recordDriveTerminalEpisode(spec, result, (warning) => {
			warnings.push(warning);
		});

		expect(await readdir(episodesDir)).toEqual(episodeNames);
		expect(
			await readFile(join(episodesDir, episodeNames[0] as string), "utf-8"),
		).toBe(episodeBytes);
		expect(warnings).toHaveLength(1);
	});

	test("stores validated terminal records at deterministic hashed paths", async () => {
		const workdir = join(temp.path, "record-storage");
		const attemptId = "../../unsafe/attempt\\name";
		const ledgerDir = join(workdir, "run.terminal-episodes");
		const digest = createHash("sha256").update(attemptId).digest("hex");
		const recordPath = join(ledgerDir, `${digest}.json`);
		const record = {
			version: 1,
			attemptId,
			outcome: "blocked",
			timestamp: "2026-07-22T16:01:00.000Z",
			state: "intended",
		} as const;

		await expect(stat(ledgerDir)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			readDriveTerminalRecord(workdir, attemptId),
		).resolves.toBeUndefined();
		await expect(stat(ledgerDir)).rejects.toMatchObject({ code: "ENOENT" });

		await writeDriveTerminalRecord(workdir, record);
		const firstBytes = await readFile(recordPath, "utf-8");
		expect(await readdir(ledgerDir)).toEqual([`${digest}.json`]);
		expect(firstBytes).toBe(`${JSON.stringify(record, null, 2)}\n`);
		expect(await readDriveTerminalRecord(workdir, attemptId)).toEqual(record);

		await writeDriveTerminalRecord(workdir, record);
		expect(await readFile(recordPath, "utf-8")).toBe(firstBytes);

		for (const malformed of [
			"{",
			JSON.stringify({ version: 1, attemptId }),
			JSON.stringify({ ...record, timestamp: "not-a-timestamp" }),
			JSON.stringify({ ...record, attemptId: "different-attempt" }),
		]) {
			await writeFile(recordPath, malformed, "utf-8");
			await expect(
				readDriveTerminalRecord(workdir, attemptId),
			).resolves.toBeUndefined();
		}
	});

	test("does not create a terminal ledger without complete episode identity", async () => {
		const projectRoot = join(temp.path, "identity-gate");
		const workdir = join(projectRoot, "run");
		const result = {
			runId: "run-without-identity",
			outcome: "completed",
			tasksDone: 0,
			tasksBlocked: 0,
			completedAt: "2026-07-22T16:02:00.000Z",
		} satisfies DriverResult;
		const spec = {
			runId: result.runId,
			parentSessionId: "parent-without-identity",
			projectRoot,
			planSlug: "episodic-log-detached-hardening",
			taskIds: [],
			backendName: "codex",
			promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
			preflightCommands: [],
			postflightCommands: [],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
		} satisfies DriverRunSpec;

		await recordDriveTerminalEpisode(spec, result);

		await expect(
			stat(join(workdir, "run.terminal-episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("captures unclaimed when terminal ledger access fails", async () => {
		const projectRoot = join(temp.path, "ledger-failure");
		const workdir = join(projectRoot, "run");
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await mkdir(join(projectRoot, "memory"), { recursive: true });
		await mkdir(workdir, { recursive: true });
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
			"utf-8",
		);
		await writeFile(
			join(workdir, "run.terminal-episodes"),
			"ledger path collision",
			"utf-8",
		);
		const spec = {
			runId: "run-ledger-failure",
			parentSessionId: "parent-ledger-failure",
			projectRoot,
			planSlug: "episodic-log-detached-hardening",
			taskIds: [],
			backendName: "codex",
			promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
			preflightCommands: [],
			postflightCommands: [],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
			workdir,
			eventLogPath: join(workdir, "events.jsonl"),
			episodeSource: "test/worker",
			episodeAttemptId: "attempt-ledger-failure",
		} satisfies DriverRunSpec;
		const warnings: MemoryWarning[] = [];

		await recordDriveTerminalEpisode(
			spec,
			{
				runId: spec.runId,
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
				completedAt: "2026-07-22T16:03:00.000Z",
			},
			(warning) => {
				warnings.push(warning);
			},
		);

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			path: join(workdir, "run.terminal-episodes"),
			message: expect.stringContaining("Episode terminal ledger unavailable"),
		});
		expect(
			await readdir(join(projectRoot, "memory", "agent", "episodes")),
		).toHaveLength(1);
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-004
	test("persists phase-specific pending finalization state", async () => {
		const states = [
			{
				runId: "run-commit",
				planSlug: "drive-resilience-state-model",
				createdAt: "2026-05-26T00:00:00.000Z",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				reason: "git commit failed",
				phase: "commit",
				taskId: "TASK-1",
				headBeforeFinalization: "head-before",
				commitSubject: "TASK-1: Implement behavior",
				verifiedAt: "2026-05-26T00:01:00.000Z",
			},
			{
				runId: "run-task-status",
				planSlug: "drive-resilience-state-model",
				createdAt: "2026-05-26T00:00:00.000Z",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				reason: "task update failed",
				phase: "task_status",
				taskId: "TASK-2",
				commitSha: "abc123",
				commitSubject: "TASK-2: Implement behavior",
			},
			{
				runId: "run-state-commit",
				planSlug: "drive-resilience-state-model",
				createdAt: "2026-05-26T00:00:00.000Z",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				reason: "state commit failed",
				phase: "state_commit",
				taskIds: ["TASK-1", "TASK-2"],
				headBeforeFinalization: "head-before-state",
			},
		] satisfies PendingFinalizationState[];

		for (const state of states) {
			const workdir = `${temp.path}/${state.runId}`;
			await writePendingFinalization(workdir, state);

			expect(await readPendingFinalization(workdir)).toEqual(state);
			expect(
				JSON.parse(await readFile(pendingFinalizationPath(workdir), "utf-8")),
			).toEqual(state);

			await clearPendingFinalization(workdir);
			expect(await readPendingFinalization(workdir)).toBeUndefined();
		}
	});

	test("uses the pending finalization filename", () => {
		expect(pendingFinalizationPath(temp.path)).toBe(
			`${temp.path}/${PENDING_FINALIZATION_FILENAME}`,
		);
	});
});
