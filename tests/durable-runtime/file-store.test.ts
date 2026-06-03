import { access, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type OrchestrationEvent,
	type RunRecord,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("durable-file-store-");

describe("FileRunStore", () => {
	// @cosmo-behavior plan:durable-run-store-events#B-001
	test("creates an inspectable run layout and reloads run metadata", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const older = await store.createRun({
			scope: "plan-a",
			runId: "run-old",
			status: "running",
		});
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-new",
			status: "pending",
			graphPath: "graph.json",
			eventsPath: "events.jsonl",
			artifactsDir: "artifacts",
			schedulerStatePath: "scheduler.json",
		});

		expect(record.runDir).toBe(join(temp.path, "plan-a", "runs", "run-new"));
		expect(record.graphPath).toBe(join(record.runDir, "graph.json"));
		expect(record.eventsPath).toBe(join(record.runDir, "events.jsonl"));
		expect(record.artifactsDir).toBe(join(record.runDir, "artifacts"));
		expect(record.schedulerStatePath).toBe(
			join(record.runDir, "scheduler.json"),
		);
		expect(record.stepsDir).toBe(join(record.runDir, "steps"));
		for (const runOwnedPath of [
			record.graphPath,
			record.eventsPath,
			record.artifactsDir,
			record.schedulerStatePath,
			record.stepsDir,
		]) {
			expect(relative(record.runDir, runOwnedPath)).not.toMatch(/^\.\./);
		}

		await expect(
			access(join(record.runDir, "run.json")),
		).resolves.toBeUndefined();
		await expect(access(record.graphPath)).resolves.toBeUndefined();
		await expect(access(record.schedulerStatePath)).resolves.toBeUndefined();
		await expect(access(record.eventsPath)).resolves.toBeUndefined();
		await expect(access(record.artifactsDir)).resolves.toBeUndefined();
		await expect(access(record.stepsDir)).resolves.toBeUndefined();

		const loaded = await store.loadRun({ scope: "plan-a", runId: "run-new" });
		expect(loaded).toEqual(record);

		await store.updateRun({ ...older, updatedAt: "2026-01-01T00:00:00.000Z" });
		await store.updateRun({ ...record, updatedAt: "2026-01-02T00:00:00.000Z" });
		const recent = await store.listRecentRuns({ scope: "plan-a" });
		expect(recent.map((run) => run.runId)).toEqual(["run-new", "run-old"]);

		const status = await store.readStatus({
			scope: "plan-a",
			runId: "run-new",
		});
		expect(status).toMatchObject({
			scope: "plan-a",
			runId: "run-new",
			status: "pending",
			statusSource: "record",
		});
	});

	// @cosmo-behavior plan:durable-run-store-events#B-002
	test("continues event sequences after reopening the file store", async () => {
		const firstStore = new FileRunStore({ rootDir: temp.path });
		const record = await firstStore.createRun({
			scope: "plan-a",
			runId: "run-events",
		});

		const first = await firstStore.appendEvent(
			ref(record),
			runEvent("run_started", record),
		);
		const second = await firstStore.appendEvent(
			ref(record),
			stepEvent("step_ready", record, "TASK-1"),
		);
		await writeFile(record.eventsPath, "not-json\n", { flag: "a" });

		const reopenedStore = new FileRunStore({ rootDir: temp.path });
		const third = await reopenedStore.appendEvent(
			ref(record),
			stepEvent("step_started", record, "TASK-1", { backend: "codex" }),
		);

		expect(first.seq).toBe(1);
		expect(second.seq).toBe(2);
		expect(third.seq).toBe(3);
		for (const stored of [first, second, third]) {
			expect(stored.runId).toBe(record.runId);
			expect(stored.event.runId).toBe(record.runId);
			expect(new Date(stored.timestamp).toISOString()).toBe(stored.timestamp);
		}

		const read = await reopenedStore.readEvents(ref(record));
		expect(read.cursor).toBe(3);
		expect(read.events.map((event) => event.seq)).toEqual([1, 2, 3]);
		expect(read.events.map((event) => event.event.type)).toEqual([
			"run_started",
			"step_ready",
			"step_started",
		]);

		const afterFirst = await reopenedStore.readEvents(ref(record), {
			sinceSeq: 1,
		});
		expect(afterFirst.cursor).toBe(3);
		expect(afterFirst.events.map((event) => event.seq)).toEqual([2, 3]);
	});

	// @cosmo-behavior plan:durable-run-store-events#B-003
	test("persists step records and rejects path traversal identifiers", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-steps",
		});
		const step: StepRecord = {
			id: "TASK-1",
			runId: record.runId,
			title: "Implement store",
			kind: "task",
			dependsOn: [],
			status: "ready",
			inputArtifacts: [],
			outputArtifacts: [],
		};

		await expect(store.writeStepRecord(ref(record), step)).resolves.toEqual(
			step,
		);
		const stepPath = join(record.stepsDir, step.id, "step.json");
		await expect(access(stepPath)).resolves.toBeUndefined();
		await expect(
			store.readStepRecord({ ...ref(record), stepId: step.id }),
		).resolves.toEqual(step);

		await expect(
			store.createRun({ scope: "../escape", runId: "run-bad" }),
		).rejects.toThrow(/unsafe scope/i);
		await expect(
			store.createRun({ scope: "plan-a", runId: "../escape" }),
		).rejects.toThrow(/unsafe runId/i);
		await expect(
			store.writeStepRecord(ref(record), { ...step, id: "../escape" }),
		).rejects.toThrow(/unsafe stepId/i);
		await expect(
			store.readStepRecord({ ...ref(record), stepId: "../escape" }),
		).rejects.toThrow(/unsafe stepId/i);
		await expect(access(join(temp.path, "escape"))).rejects.toThrow();
	});
});

function ref(record: RunRecord): { scope: string; runId: string } {
	return { scope: record.scope, runId: record.runId };
}

function runEvent(
	type: "run_started",
	record: RunRecord,
): Extract<OrchestrationEvent, { type: "run_started" }> {
	return { type, runId: record.runId };
}

function stepEvent<T extends "step_ready" | "step_started">(
	type: T,
	record: RunRecord,
	stepId: string,
	extra?: T extends "step_started" ? { backend: string } : never,
): Extract<OrchestrationEvent, { type: T }> {
	return { type, runId: record.runId, stepId, ...extra } as Extract<
		OrchestrationEvent,
		{ type: T }
	>;
}
