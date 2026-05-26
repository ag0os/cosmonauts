import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	clearPendingFinalization,
	PENDING_FINALIZATION_FILENAME,
	type PendingFinalizationState,
	pendingFinalizationPath,
	readPendingFinalization,
	writePendingFinalization,
} from "../../lib/driver/run-state.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-state-test-");

describe("run-state", () => {
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
