import { writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type OrchestrationEvent,
	type RunRecord,
	runStatus,
	runWatch,
	type StoredOrchestrationEvent,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-controller-");

describe("durable runtime controller", () => {
	// @cosmo-behavior plan:durable-run-store-events#B-012
	test("pages normalized events by sequence cursor and reports malformed lines", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-watch",
		});
		await store.appendEvent(ref(record), {
			type: "run_started",
			runId: record.runId,
		});
		const output = await store.appendEvent(ref(record), {
			type: "step_output",
			runId: record.runId,
			stepId: "TASK-1",
			chunk: "Hello from worker\nwith whitespace",
		});
		await writeFile(record.eventsPath, "not-json\n", { flag: "a" });
		const completed = await store.appendEvent(ref(record), {
			type: "run_completed",
			runId: record.runId,
			result: { outcome: "completed" },
		});

		const limited = await runWatch(store, ref(record), {
			sinceSeq: 1,
			limit: 1,
		});
		expect(limited.cursor).toBe(3);
		expect(limited.events).toHaveLength(1);
		expect(limited.events[0]).toEqual({
			seq: 2,
			text: "2 step_output TASK-1: Hello from worker with whitespace",
			envelope: output,
		});
		expect(limited.diagnostics).toEqual([
			expect.objectContaining({
				code: "malformed_event_json",
				line: 3,
			}),
		]);

		const page = await runWatch(store, ref(record), { sinceSeq: 1 });
		expect(page.cursor).toBe(3);
		expect(page.events.map((event) => event.seq)).toEqual([2, 3]);
		expect(page.events.map((event) => event.text)).toEqual([
			"2 step_output TASK-1: Hello from worker with whitespace",
			"3 run_completed: completed",
		]);
		expect(page.events.map((event) => event.envelope)).toEqual([
			output,
			completed,
		]);
	});

	// @cosmo-behavior plan:durable-run-store-events#B-013
	test("derives status from terminal events when run records disagree", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-status",
			status: "completed",
		});
		const finalizationDetails = {
			kind: "finalization",
			finalizationPhase: "state_commit",
			finalizationReason: "state commit failed",
			finalizationTaskId: "TASK-1",
			finalizationCommitSha: "abc123",
		};
		const finalizationActivity = envelope(record, 4, {
			type: "step_tool_activity",
			runId: record.runId,
			stepId: "TASK-1",
			details: finalizationDetails,
		});
		const terminalFailure = envelope(record, 5, {
			type: "run_failed",
			runId: record.runId,
			reason: "state commit failed",
		});
		const olderCompletion = envelope(record, 3, {
			type: "run_completed",
			runId: record.runId,
			result: { outcome: "completed" },
		});
		await writeFile(
			record.eventsPath,
			[
				JSON.stringify(finalizationActivity),
				JSON.stringify(terminalFailure),
				JSON.stringify(olderCompletion),
			].join("\n"),
			"utf-8",
		);

		const status = await runStatus(store, ref(record));

		expect(status).toEqual({
			scope: "plan-a",
			runId: "run-status",
			status: "failed",
			statusSource: "event",
			recordStatus: "completed",
			eventStatus: "failed",
			updatedAt: "2026-06-03T00:00:05.000Z",
			diagnostics: [
				{
					code: "drive_finalization_evidence",
					message:
						"Adjacent activity event contains Drive finalization evidence for the terminal run failure.",
					details: {
						terminalSeq: 5,
						activitySeq: 4,
						activity: finalizationDetails,
					},
				},
			],
		});
		expect((status as { status?: string } | undefined)?.status).not.toBe(
			"finalization_failed",
		);
		for (const key of [
			"finalizationPhase",
			"finalizationReason",
			"finalizationTaskId",
			"finalizationCommitSha",
		]) {
			expect(status).not.toHaveProperty(key);
		}
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

function envelope(
	record: RunRecord,
	seq: number,
	event: OrchestrationEvent,
): StoredOrchestrationEvent {
	return {
		seq,
		timestamp: `2026-06-03T00:00:0${seq}.000Z`,
		runId: record.runId,
		event,
	};
}
