import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type RunGraph,
	type RunRef,
	type RunStore,
	runStart,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-start-resume-");

describe("runStart resume and rehydration", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-004
	test("repairs partial initial step seeding before scheduling a resumed run", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-partial-repair" };
		const store = new FileRunStore({ rootDir: temp.path });
		const graph = graphFor(ref, ["build", "verify"]);
		await store.createRun({
			...ref,
			status: "running",
			metadata: { keep: "authoritative" },
		});
		await store.writeRunGraph(ref, graph);
		const completedBuild = stepRecord(graph, "build", {
			status: "completed",
			result: {
				outcome: "success",
				summary: "persisted result wins",
				artifacts: [{ id: "build-log", path: "artifacts/build.log" }],
			},
			latestAttemptId: "attempt-001",
			outputArtifacts: [{ id: "build-log", path: "artifacts/build.log" }],
		});
		await store.writeStepRecord(ref, completedBuild);
		const persistedHeartbeat = {
			at: "2026-06-05T00:01:00.000Z",
			note: "persisted",
		};
		await store.writeStepAttemptRecord(
			{ ...ref, stepId: "build" },
			{
				attemptId: "attempt-001",
				startedAt: "2026-06-05T00:00:00.000Z",
				endedAt: "2026-06-05T00:01:00.000Z",
				result: completedBuild.result,
			},
		);
		await store.writeStepHeartbeat(
			{ ...ref, stepId: "build" },
			persistedHeartbeat,
		);

		const result = await runStart({
			store,
			ref,
			graph,
			initialSteps: [
				stepRecord(graph, "build", { status: "pending" }),
				stepRecord(graph, "verify", { status: "pending" }),
			],
			createRun: { metadata: { keep: "new input must not win" } },
			backends: new Map(),
			holderId: "holder-a",
			stopPolicy: {
				beforePass: async () => ({
					reason: "pause after repair",
					exitReason: "interrupted",
				}),
			},
		});
		const second = await runStart({
			store,
			ref,
			graph,
			backends: new Map(),
			holderId: "holder-b",
			stopPolicy: {
				beforePass: async () => ({
					reason: "pause after idempotent repair",
					exitReason: "interrupted",
				}),
			},
		});

		expect(result).toMatchObject({ type: "interrupted", createdRun: false });
		expect(second).toMatchObject({ type: "interrupted", createdRun: false });
		await expect(store.loadRun(ref)).resolves.toEqual(
			expect.objectContaining({ metadata: { keep: "authoritative" } }),
		);
		await expect(
			store.readStepRecord({ ...ref, stepId: "build" }),
		).resolves.toEqual({ ...completedBuild, heartbeat: persistedHeartbeat });
		await expect(
			store.readStepHeartbeat({ ...ref, stepId: "build" }),
		).resolves.toEqual(persistedHeartbeat);
		await expect(
			store.listStepAttemptRecords({ ...ref, stepId: "build" }),
		).resolves.toHaveLength(1);
		await expect(
			store.readStepRecord({ ...ref, stepId: "verify" }),
		).resolves.toEqual(stepRecord(graph, "verify", { status: "pending" }));
		expect((await store.readEvents(ref)).events).toHaveLength(1);
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-004
	test("repairs zero initial step records when the persisted graph matches", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-zero-repair" };
		const store = new FileRunStore({ rootDir: temp.path });
		const graph = graphFor(ref, ["build", "verify", "publish"]);
		await store.createRun({ ...ref, status: "running" });
		await store.writeRunGraph(ref, graph);

		const result = await runStart({
			store,
			ref,
			graph,
			backends: new Map(),
			holderId: "holder-a",
			stopPolicy: {
				beforePass: async () => ({
					reason: "pause after zero-record repair",
					exitReason: "interrupted",
				}),
			},
		});

		expect(result).toMatchObject({ type: "interrupted", createdRun: false });
		expect((await store.listStepRecords(ref)).map((step) => step.id)).toEqual([
			"build",
			"publish",
			"verify",
		]);
		expect(
			(await store.listStepRecords(ref)).every(
				(step) => step.status === "pending",
			),
		).toBe(true);
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-004
	test("interrupts and blocks instead of overwriting a conflicting persisted graph", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-graph-mismatch" };
		const store = new FileRunStore({ rootDir: temp.path });
		const persistedGraph = graphFor(ref, ["build"]);
		const compiledGraph = graphFor(ref, ["other"]);
		await store.createRun({ ...ref, status: "running" });
		await store.writeRunGraph(ref, persistedGraph);
		await store.writeStepRecord(ref, stepRecord(persistedGraph, "build"));

		const result = await runStart({
			store,
			ref,
			graph: compiledGraph,
			backends: new Map(),
			holderId: "holder-a",
		});

		expect(result).toMatchObject({
			type: "interrupted",
			interruption: {
				reason: "run_start_graph_mismatch",
				exitReason: "interrupted",
			},
		});
		expect((await store.readRunGraph(ref)).graph).toEqual(persistedGraph);
		expect((await store.listStepRecords(ref)).map((step) => step.id)).toEqual([
			"build",
		]);
		await expect(store.loadRun(ref)).resolves.toEqual(
			expect.objectContaining({ status: "blocked" }),
		);
		const eventPage = await store.readEvents(ref);
		expect(eventPage.diagnostics).toEqual([
			expect.objectContaining({ code: "run_start_graph_mismatch" }),
		]);
		expect(eventPage.events.map((stored) => stored.event.type)).toEqual([
			"run_blocked",
		]);
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-001
	test("uses canonical store initialization and reconciliation reads with a scheduler append wrapper", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-safe-wrapper" };
		const store = new FileRunStore({ rootDir: temp.path });
		const graph = graphFor(ref, ["build"]);
		const schedulerStore = appendOnlySchedulerWrapper(store);

		const result = await runStart({
			store,
			schedulerStore,
			ref,
			graph,
			backends: new Map(),
			holderId: "holder-a",
			maxPasses: 1,
		});

		expect(result).toMatchObject({
			type: "scheduler",
			createdRun: true,
			passes: 1,
		});
		await expect(
			store.readStepRecord({ ...ref, stepId: "build" }),
		).resolves.toEqual(expect.objectContaining({ status: "ready" }));
		expect(
			(await store.readEvents(ref)).events.map((stored) => stored.event.type),
		).toEqual(["run_started", "step_ready"]);
	});
});

function appendOnlySchedulerWrapper(store: FileRunStore): RunStore {
	return new Proxy(store, {
		get(target, property, receiver) {
			if (property === "appendEvent" || property === "appendDiagnostic") {
				const value = Reflect.get(target, property, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			}
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function") {
				return value;
			}
			return async () => {
				throw new Error(
					`scheduler wrapper ${String(property)} must not be used for reconciliation`,
				);
			};
		},
	}) as RunStore;
}

function graphFor(ref: RunRef, stepIds: string[]): RunGraph {
	return {
		steps: stepIds.map((stepId, index) => ({
			id: stepId,
			runId: ref.runId,
			title: `Step ${stepId}`,
			kind: "command",
			backend: { name: "shell-command" },
			dependsOn: index === 0 ? [] : [stepIds[index - 1] as string],
			inputArtifacts: [],
		})),
		edges: stepIds.slice(1).map((stepId, index) => ({
			from: stepIds[index] as string,
			to: stepId,
		})),
	};
}

function stepRecord(
	graph: RunGraph,
	stepId: string,
	overrides: Partial<StepRecord> = {},
): StepRecord {
	const step = graph.steps.find((candidate) => candidate.id === stepId);
	if (!step) {
		throw new Error(`Missing graph step ${stepId}.`);
	}
	return {
		...step,
		status: "pending",
		outputArtifacts: [],
		...overrides,
	};
}
