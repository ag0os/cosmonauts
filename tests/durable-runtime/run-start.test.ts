import { describe, expect, test } from "vitest";
import {
	FileRunStore,
	type RunGraph,
	type RunRef,
	runStart,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-start-");

describe("runStart initialization contract", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-001
	test("creates or adopts a graph run exactly once across concurrent starters", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-race" };
		const graph = graphFor(ref, ["build"]);
		const firstStore = new FileRunStore({ rootDir: temp.path });
		const secondStore = new FileRunStore({ rootDir: temp.path });

		const [first, second] = await Promise.all([
			runStart({
				store: firstStore,
				ref,
				graph,
				initialSteps: [stepRecord(graph, "build", { status: "pending" })],
				createRun: { status: "pending", metadata: { starter: "first" } },
				backends: new Map(),
				holderId: "holder-a",
				stopPolicy: {
					beforePass: async () => ({
						reason: "characterization stop",
						exitReason: "interrupted",
					}),
				},
			}),
			runStart({
				store: secondStore,
				ref,
				graph,
				createRun: { status: "pending", metadata: { starter: "second" } },
				backends: new Map(),
				holderId: "holder-b",
				stopPolicy: {
					beforePass: async () => ({
						reason: "characterization stop",
						exitReason: "interrupted",
					}),
				},
			}),
		]);

		expect([first.createdRun, second.createdRun].sort()).toEqual([false, true]);
		expect(first.type).toBe("interrupted");
		expect(second.type).toBe("interrupted");
		expect("exitReason" in first).toBe(false);
		expect("exitReason" in second).toBe(false);

		const reopened = new FileRunStore({ rootDir: temp.path });
		const run = await reopened.loadRun(ref);
		const events = await reopened.readEvents(ref);
		const steps = await reopened.listStepRecords(ref);
		const persistedGraph = await reopened.readRunGraph(ref);

		expect(run?.metadata).toEqual(
			expect.objectContaining({
				starter: expect.stringMatching(/first|second/),
			}),
		);
		expect(events.events.map((stored) => stored.event.type)).toEqual([
			"run_started",
		]);
		expect(steps).toEqual([stepRecord(graph, "build", { status: "pending" })]);
		expect(persistedGraph.graph).toEqual(graph);
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-001
	test("adopts an empty existing run and appends run_started only once", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-adopt-empty" };
		const store = new FileRunStore({ rootDir: temp.path });
		const graph = graphFor(ref, ["build", "verify"]);
		await store.createRun({
			...ref,
			status: "pending",
			metadata: { authoritative: true },
		});

		for (let index = 0; index < 2; index++) {
			const result = await runStart({
				store,
				ref,
				graph,
				createRun: { metadata: { shouldNotOverwrite: true } },
				backends: new Map(),
				holderId: `holder-${index}`,
				stopPolicy: {
					beforePass: async () => ({
						reason: "pause after initialization",
						exitReason: "interrupted",
					}),
				},
			});
			expect(result).toMatchObject({
				type: "interrupted",
				createdRun: false,
				passes: 0,
			});
		}

		const run = await store.loadRun(ref);
		const events = await store.readEvents(ref);
		const steps = await store.listStepRecords(ref);
		expect(run?.metadata).toEqual({ authoritative: true });
		expect(events.events.map((stored) => stored.event.type)).toEqual([
			"run_started",
		]);
		expect(steps.map((step) => [step.id, step.status])).toEqual([
			["build", "pending"],
			["verify", "pending"],
		]);
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-001
	test("keeps scheduler interruptions separate from scheduler results", async () => {
		const ref: RunRef = { scope: "plan-a", runId: "run-interrupt" };
		const store = new FileRunStore({ rootDir: temp.path });
		const graph = graphFor(ref, ["build"]);

		const result = await runStart({
			store,
			ref,
			graph,
			backends: new Map(),
			holderId: "holder-a",
			stopPolicy: {
				beforePass: async (state) => ({
					reason: "human pause",
					exitReason: "interrupted",
					run: state.run,
					steps: state.steps,
					diagnostics: [{ code: "pause", message: "Paused by policy." }],
				}),
			},
		});

		expect(result).toEqual(
			expect.objectContaining({
				type: "interrupted",
				interruption: expect.objectContaining({
					exitReason: "interrupted",
					reason: "human pause",
				}),
			}),
		);
		expect("exitReason" in result).toBe(false);
	});
});

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
