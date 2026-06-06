import type { RunGraphSchedulerBackend } from "./backends.ts";
import {
	type RunGraphSchedulerOptions,
	runDurableGraphScheduler,
} from "./scheduler.ts";
import type {
	CreateRunInput,
	KnownBackendName,
	RunGraph,
	RunGraphSchedulerResult,
	RunRecord,
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	StepRecord,
} from "./types.ts";

export interface RunStartOptions {
	store: RunStore;
	schedulerStore?: RunStore;
	ref: RunRef;
	graph: RunGraph;
	createRun?: Omit<CreateRunInput, "scope" | "runId">;
	initialSteps?: readonly StepRecord[];
	backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
	holderId: string;
	inputForStep?: RunGraphSchedulerOptions["inputForStep"];
	signal?: AbortSignal;
	heartbeatIntervalMs?: number;
	maxPasses?: number;
	stopPolicy?: RunStartStopPolicy;
}

export interface RunStartState {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	graph: RunGraph;
	steps: readonly StepRecord[];
	createdRun: boolean;
	passes: number;
}

export interface RunStartInterruption {
	reason: string;
	exitReason: "interrupted";
	run?: RunRecord;
	steps?: readonly StepRecord[];
	diagnostics?: readonly RuntimeDiagnostic[];
	details?: unknown;
}

export interface RunStartStopPolicy {
	beforePass?(state: RunStartState): Promise<RunStartInterruption | undefined>;
	afterPass?(
		state: RunStartState,
		pass: RunGraphSchedulerResult,
	): Promise<RunStartInterruption | undefined>;
	shouldStop?(pass: RunGraphSchedulerResult): boolean;
}

export interface RunStartSchedulerResult extends RunGraphSchedulerResult {
	type: "scheduler";
	ref: RunRef;
	createdRun: boolean;
	passes: number;
	interruption?: never;
}

export interface RunStartInterruptedResult {
	type: "interrupted";
	ref: RunRef;
	createdRun: boolean;
	passes: number;
	run: RunRecord;
	steps: readonly StepRecord[];
	diagnostics: readonly RuntimeDiagnostic[];
	interruption: RunStartInterruption;
}

export type RunStartResult =
	| RunStartSchedulerResult
	| RunStartInterruptedResult;

interface InitializedRun {
	run: RunRecord;
	graph: RunGraph;
	steps: StepRecord[];
	diagnostics: RuntimeDiagnostic[];
	createdRun: boolean;
	interruption?: RunStartInterruption;
}

const DEFAULT_MAX_PASSES = 10_000;

export async function runStart(
	options: RunStartOptions,
): Promise<RunStartResult> {
	const initialized = await ensureRunInitialized(options);
	let passes = 0;
	let run = initialized.run;
	let steps = initialized.steps;
	let diagnostics = [...initialized.diagnostics];

	if (initialized.interruption) {
		return interruptedResult({
			ref: options.ref,
			createdRun: initialized.createdRun,
			passes,
			run,
			steps,
			diagnostics,
			interruption: initialized.interruption,
		});
	}

	const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
	const schedulerStore = schedulerWriteWrapper(
		options.store,
		options.schedulerStore,
	);
	let lastPass: RunGraphSchedulerResult | undefined;

	while (passes < maxPasses) {
		const state = await runStartState({
			store: options.store,
			ref: options.ref,
			run,
			createdRun: initialized.createdRun,
			passes,
		});
		run = state.run;
		steps = [...state.steps];

		const before = await options.stopPolicy?.beforePass?.(state);
		if (before) {
			return interruptedResult({
				ref: options.ref,
				createdRun: initialized.createdRun,
				passes,
				run,
				steps,
				diagnostics,
				interruption: before,
			});
		}

		const pass = await runDurableGraphScheduler({
			store: schedulerStore,
			ref: options.ref,
			backends: options.backends,
			holderId: options.holderId,
			inputForStep: options.inputForStep,
			signal: options.signal,
			heartbeatIntervalMs: options.heartbeatIntervalMs,
		});
		passes += 1;
		lastPass = pass;
		run = pass.run;
		steps = pass.steps;
		diagnostics = [...diagnostics, ...pass.diagnostics];

		const afterState = await runStartState({
			store: options.store,
			ref: options.ref,
			run,
			createdRun: initialized.createdRun,
			passes,
		});
		const after = await options.stopPolicy?.afterPass?.(afterState, pass);
		if (after) {
			return interruptedResult({
				ref: options.ref,
				createdRun: initialized.createdRun,
				passes,
				run: afterState.run,
				steps: afterState.steps,
				diagnostics,
				interruption: after,
			});
		}

		if (options.stopPolicy?.shouldStop?.(pass) || shouldStopByDefault(pass)) {
			return {
				...pass,
				diagnostics,
				type: "scheduler",
				ref: options.ref,
				createdRun: initialized.createdRun,
				passes,
			};
		}

		if (options.signal?.aborted) {
			return {
				...pass,
				diagnostics,
				type: "scheduler",
				ref: options.ref,
				createdRun: initialized.createdRun,
				passes,
			};
		}
	}

	if (lastPass) {
		return {
			...lastPass,
			diagnostics,
			type: "scheduler",
			ref: options.ref,
			createdRun: initialized.createdRun,
			passes,
		};
	}

	return {
		run,
		steps,
		diagnostics,
		exitReason: "drained",
		type: "scheduler",
		ref: options.ref,
		createdRun: initialized.createdRun,
		passes,
	};
}

async function ensureRunInitialized(
	options: RunStartOptions,
): Promise<InitializedRun> {
	return await options.store.withRunInitializationLock(
		options.ref,
		async () => {
			const existing = await options.store.loadRun(options.ref);
			const createdRun = !existing;
			const run =
				existing ??
				(await options.store.createRun({
					...options.ref,
					...options.createRun,
				}));
			const { graph: persistedGraph, diagnostics } =
				await options.store.readRunGraph(options.ref);
			const persistedSteps = await options.store.listStepRecords(options.ref);

			if (!existing || isEmptyGraph(persistedGraph)) {
				if (persistedSteps.length > 0) {
					return await graphMismatchInterruption({
						store: options.store,
						ref: options.ref,
						run,
						graph: persistedGraph,
						steps: persistedSteps,
						diagnostics,
						details: { reason: "empty persisted graph has step records" },
						createdRun,
					});
				}
				await options.store.writeRunGraph(options.ref, options.graph);
				const steps = await seedMissingStepRecords({
					store: options.store,
					ref: options.ref,
					graph: options.graph,
					existingSteps: [],
					initialSteps: options.initialSteps,
				});
				await appendRunStartedOnce(options.store, options.ref);
				return {
					run,
					graph: options.graph,
					steps,
					diagnostics,
					createdRun,
				};
			}

			if (!graphsMatch(persistedGraph, options.graph)) {
				return await graphMismatchInterruption({
					store: options.store,
					ref: options.ref,
					run,
					graph: persistedGraph,
					steps: persistedSteps,
					diagnostics,
					details: {
						persistedGraph: graphSignature(persistedGraph),
						compiledGraph: graphSignature(options.graph),
					},
					createdRun,
				});
			}

			const steps = await seedMissingStepRecords({
				store: options.store,
				ref: options.ref,
				graph: persistedGraph,
				existingSteps: persistedSteps,
				initialSteps: options.initialSteps,
			});
			await appendRunStartedOnce(options.store, options.ref);
			return {
				run,
				graph: persistedGraph,
				steps,
				diagnostics,
				createdRun,
			};
		},
	);
}

async function seedMissingStepRecords(options: {
	store: RunStore;
	ref: RunRef;
	graph: RunGraph;
	existingSteps: readonly StepRecord[];
	initialSteps: readonly StepRecord[] | undefined;
}): Promise<StepRecord[]> {
	const stepsById = new Map(
		options.existingSteps.map((step) => [step.id, step]),
	);
	const initialById = new Map(
		(options.initialSteps ?? []).map((step) => [step.id, step]),
	);

	for (const graphStep of options.graph.steps) {
		if (stepsById.has(graphStep.id)) {
			continue;
		}
		const step = initialById.get(graphStep.id) ?? {
			...graphStep,
			status: "pending",
			outputArtifacts: [],
		};
		const written = await options.store.writeStepRecord(options.ref, step);
		stepsById.set(written.id, written);
	}

	return [...stepsById.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
}

async function appendRunStartedOnce(
	store: RunStore,
	ref: RunRef,
): Promise<void> {
	const events = await store.readEvents(ref);
	if (events.events.some((stored) => stored.event.type === "run_started")) {
		return;
	}
	await store.appendEvent(ref, { type: "run_started", runId: ref.runId });
}

async function graphMismatchInterruption(options: {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	graph: RunGraph;
	steps: readonly StepRecord[];
	diagnostics: readonly RuntimeDiagnostic[];
	details: unknown;
	createdRun: boolean;
}): Promise<InitializedRun> {
	const diagnostic: RuntimeDiagnostic = {
		code: "run_start_graph_mismatch",
		message:
			"Persisted run graph does not match the graph supplied to runStart; persisted state was not overwritten.",
		path: options.run.graphPath,
		details: options.details,
	};
	await options.store.appendDiagnostic(options.ref, diagnostic);
	await options.store.appendEvent(options.ref, {
		type: "run_blocked",
		runId: options.ref.runId,
		reason: diagnostic.message,
	});
	return {
		run: (await options.store.loadRun(options.ref)) ?? options.run,
		graph: options.graph,
		steps: [...options.steps],
		diagnostics: [...options.diagnostics, diagnostic],
		createdRun: options.createdRun,
		interruption: {
			reason: diagnostic.code,
			exitReason: "interrupted",
			run: options.run,
			steps: options.steps,
			diagnostics: [diagnostic],
		},
	};
}

async function runStartState(options: {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	createdRun: boolean;
	passes: number;
}): Promise<RunStartState> {
	const [run, graph, steps] = await Promise.all([
		options.store.loadRun(options.ref),
		options.store.readRunGraph(options.ref),
		options.store.listStepRecords(options.ref),
	]);
	return {
		store: options.store,
		ref: options.ref,
		run: run ?? options.run,
		graph: graph.graph,
		steps,
		createdRun: options.createdRun,
		passes: options.passes,
	};
}

function schedulerWriteWrapper(
	store: RunStore,
	schedulerStore: RunStore | undefined,
): RunStore {
	if (!schedulerStore) {
		return store;
	}
	return {
		withRunInitializationLock: store.withRunInitializationLock.bind(store),
		createRun: store.createRun.bind(store),
		loadRun: store.loadRun.bind(store),
		updateRun: store.updateRun.bind(store),
		readRunGraph: store.readRunGraph.bind(store),
		writeRunGraph: store.writeRunGraph.bind(store),
		readSchedulerState: store.readSchedulerState.bind(store),
		writeSchedulerState: store.writeSchedulerState.bind(store),
		appendEvent: schedulerStore.appendEvent.bind(schedulerStore),
		readEvents: store.readEvents.bind(store),
		appendDiagnostic: schedulerStore.appendDiagnostic.bind(schedulerStore),
		writeStepRecord: store.writeStepRecord.bind(store),
		readStepRecord: store.readStepRecord.bind(store),
		listStepRecords: store.listStepRecords.bind(store),
		writeStepHeartbeat: store.writeStepHeartbeat.bind(store),
		readStepHeartbeat: store.readStepHeartbeat.bind(store),
		writeStepAttemptRecord: store.writeStepAttemptRecord.bind(store),
		readStepAttemptRecord: store.readStepAttemptRecord.bind(store),
		listStepAttemptRecords: store.listStepAttemptRecords.bind(store),
		listRecentRuns: store.listRecentRuns.bind(store),
		readStatus: store.readStatus.bind(store),
	};
}

function interruptedResult(options: {
	ref: RunRef;
	createdRun: boolean;
	passes: number;
	run: RunRecord;
	steps: readonly StepRecord[];
	diagnostics: readonly RuntimeDiagnostic[];
	interruption: RunStartInterruption;
}): RunStartInterruptedResult {
	return {
		type: "interrupted",
		ref: options.ref,
		createdRun: options.createdRun,
		passes: options.passes,
		run: options.interruption.run ?? options.run,
		steps: options.interruption.steps ?? options.steps,
		diagnostics: options.interruption.diagnostics ?? options.diagnostics,
		interruption: options.interruption,
	};
}

function shouldStopByDefault(pass: RunGraphSchedulerResult): boolean {
	return (
		pass.exitReason === "terminal" ||
		pass.exitReason === "blocked" ||
		pass.exitReason === "cancelled" ||
		pass.exitReason === "waiting_for_fresh_external_work"
	);
}

function isEmptyGraph(graph: RunGraph): boolean {
	return graph.steps.length === 0 && graph.edges.length === 0;
}

function graphsMatch(left: RunGraph, right: RunGraph): boolean {
	return graphSignature(left) === graphSignature(right);
}

function graphSignature(graph: RunGraph): string {
	return JSON.stringify({
		steps: graph.steps
			.map((step) => ({
				id: step.id,
				runId: step.runId,
				title: step.title,
				kind: step.kind,
				backend: step.backend,
				dependsOn: [...step.dependsOn].sort(),
				inputArtifacts: step.inputArtifacts,
			}))
			.sort((left, right) => left.id.localeCompare(right.id)),
		edges: graph.edges
			.map((edge) => ({ from: edge.from, to: edge.to }))
			.sort((left, right) =>
				`${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`),
			),
	});
}
