import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createDriveStepProjector,
	type DriveStepProjector,
} from "../../lib/driver/durable-steps.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";
import {
	FileRunStore,
	type RunRecord,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("driver-durable-steps-unit-");
const PLAN_SLUG = "durable-step-unit";
const RUN_ID = "run-durable-step-retry";
const TASK_ID = "TASK-1";

describe("Drive durable step projector", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-005
	test("appends a new attempt when Drive retries a task", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			metadata: {
				driveTaskIds: [TASK_ID],
				configuredBackendName: "codex",
			},
		});
		const projector = createProjector(store, record);

		await projector.project(event("task_started", { taskId: TASK_ID }));
		await projector.project(
			event("spawn_started", { taskId: TASK_ID, backend: "codex" }),
		);
		await projector.project(
			event("spawn_completed", {
				taskId: TASK_ID,
				report: {
					outcome: "failure",
					files: [],
					verification: [],
					notes: "first attempt blocked on missing file",
				},
			}),
		);
		await projector.project(
			event("task_blocked", {
				taskId: TASK_ID,
				reason: "first attempt blocked on missing file",
				contradicted: {
					path: "lib/driver/durable-steps.ts",
					existsOnDisk: true,
				},
			}),
		);
		await projector.project(
			event("spawn_started", { taskId: TASK_ID, backend: "codex" }),
		);
		await projector.project(
			event("spawn_completed", {
				taskId: TASK_ID,
				report: {
					outcome: "success",
					files: [{ path: "lib/driver/durable-steps.ts", change: "modified" }],
					verification: [{ command: "bun run test", status: "pass" }],
					notes: "retry completed successfully",
				},
			}),
		);
		await projector.project(event("task_done", { taskId: TASK_ID }));

		const step = await requireStep(store, record);
		const attempts = await store.listStepAttemptRecords({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			stepId: TASK_ID,
		});
		const firstOutput = await readFile(
			join(record.stepsDir, TASK_ID, "attempts", "attempt-001", "output.md"),
			"utf-8",
		);
		const secondOutput = await readFile(
			join(record.stepsDir, TASK_ID, "attempts", "attempt-002", "output.md"),
			"utf-8",
		);

		expect(attempts.map((attempt) => attempt.attemptId)).toEqual([
			"attempt-001",
			"attempt-002",
		]);
		expect(attempts[0]?.result).toMatchObject({
			outcome: "failed",
			summary: "first attempt blocked on missing file",
			nextAction: "wait_for_human",
		});
		expect(attempts[1]?.result).toMatchObject({
			outcome: "success",
			summary: "retry completed successfully",
			nextAction: "continue",
		});
		expect(firstOutput).toContain("first attempt blocked on missing file");
		expect(secondOutput).toContain("retry completed successfully");
		expect(step.latestAttemptId).toBe("attempt-002");
		expect(step.status).toBe("completed");
		expect(step.result).toEqual(attempts[1]?.result);
		expect(step.result?.files).toEqual([
			{ path: "lib/driver/durable-steps.ts", status: "modified" },
		]);
	});

	// @cosmo-behavior plan:durable-backend-step-model#B-006
	test("resume task_done preserves a persisted unknown result instead of fabricating success", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: PLAN_SLUG,
			runId: RUN_ID,
			metadata: {
				driveTaskIds: [TASK_ID],
				configuredBackendName: "codex",
			},
		});

		// First process: a malformed backend report persists an `unknown` result.
		const projector = createProjector(store, record);
		await projector.project(event("task_started", { taskId: TASK_ID }));
		await projector.project(
			event("spawn_started", { taskId: TASK_ID, backend: "codex" }),
		);
		await projector.project(
			event("spawn_completed", {
				taskId: TASK_ID,
				report: {
					outcome: "unknown",
					raw: "prose with no fenced report and no OUTCOME marker",
				},
			}),
		);

		const beforeResume = await requireStep(store, record);
		expect(beforeResume.result?.outcome).toBe("unknown");

		// Resume: a fresh projector (empty in-memory latest-result map) sees only the
		// task_done emitted by pending task-status finalization recovery.
		const resumeProjector = createProjector(store, record);
		await resumeProjector.project(event("task_done", { taskId: TASK_ID }));

		const step = await requireStep(store, record);
		expect(step.status).toBe("completed");
		expect(step.result?.outcome).toBe("unknown");
		expect(step.result?.nextAction).not.toBe("continue");
		expect(resumeProjector.latestTaskResult(TASK_ID)?.outcome).toBe("unknown");
	});
});

function createProjector(
	store: FileRunStore,
	record: RunRecord,
): DriveStepProjector {
	return createDriveStepProjector({
		store,
		ref: { scope: PLAN_SLUG, runId: RUN_ID },
		projectRoot: temp.path,
		workdir: record.runDir,
		configuredBackendName: "codex",
		taskIds: [TASK_ID],
	});
}

async function requireStep(
	store: FileRunStore,
	record: RunRecord,
): Promise<StepRecord> {
	const step = await store.readStepRecord({
		scope: record.scope,
		runId: record.runId,
		stepId: TASK_ID,
	});
	if (!step) {
		throw new Error(`Missing step record: ${TASK_ID}`);
	}
	return step;
}

function event<T extends DriverEvent["type"]>(
	type: T,
	fields: Omit<
		Extract<DriverEvent, { type: T }>,
		"type" | "runId" | "parentSessionId" | "timestamp"
	>,
): Extract<DriverEvent, { type: T }> {
	return {
		type,
		runId: RUN_ID,
		parentSessionId: "parent-session",
		timestamp: "2026-06-04T00:00:00.000Z",
		...fields,
	} as Extract<DriverEvent, { type: T }>;
}
