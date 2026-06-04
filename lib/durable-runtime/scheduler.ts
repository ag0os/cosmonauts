import type { RunGraphSchedulerBackend } from "./backends.ts";
import { reconcileSchedulerState } from "./scheduler-state.ts";
import { isTerminalStatus } from "./status.ts";
import type {
	KnownBackendName,
	RunGraphSchedulerResult,
	RunRecord,
	RunRef,
	RunStore,
	SchedulerStepInput,
	StepRecord,
} from "./types.ts";

export interface RunGraphSchedulerOptions {
	store: RunStore;
	ref: RunRef;
	backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
	holderId: string;
	inputForStep?: (
		step: StepRecord,
		run: RunRecord,
	) => SchedulerStepInput | Promise<SchedulerStepInput>;
	now?: () => string;
	signal?: AbortSignal;
	heartbeatIntervalMs?: number;
}

export async function runDurableGraphScheduler({
	store,
	ref,
	now,
}: RunGraphSchedulerOptions): Promise<RunGraphSchedulerResult> {
	const run = await store.loadRun(ref);
	if (!run) {
		throw new Error(`Run ${ref.scope}/${ref.runId} does not exist.`);
	}
	if (isTerminalStatus(run.status)) {
		return {
			run,
			steps: await store.listStepRecords(ref),
			diagnostics: [],
			exitReason: "terminal",
		};
	}

	const reconciliation = await reconcileSchedulerState({ store, ref, now });

	return {
		run,
		steps: reconciliation.steps,
		diagnostics: reconciliation.diagnostics,
		exitReason: "drained",
	};
}
