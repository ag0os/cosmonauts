import type {
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	SchedulerState,
	StepRecord,
} from "./types.ts";

export interface ReconcileSchedulerStateOptions {
	store: RunStore;
	ref: RunRef;
	now?: () => string;
}

export interface SchedulerStateReconciliation {
	state: SchedulerState;
	steps: StepRecord[];
	diagnostics: RuntimeDiagnostic[];
	readyTransitionStepIds: string[];
	changed: boolean;
}

export async function reconcileSchedulerState({
	store,
	ref,
	now = () => new Date().toISOString(),
}: ReconcileSchedulerStateOptions): Promise<SchedulerStateReconciliation> {
	const [{ graph, diagnostics }, previousState, persistedSteps] =
		await Promise.all([
			store.readRunGraph(ref),
			store.readSchedulerState(ref),
			store.listStepRecords(ref),
		]);
	const stepsById = new Map(persistedSteps.map((step) => [step.id, step]));
	const readyTransitionStepIds: string[] = [];
	const completedStepIds = new Set(
		persistedSteps
			.filter((step) => step.status === "completed")
			.map((step) => step.id),
	);

	for (const graphStep of graph.steps) {
		const step = stepsById.get(graphStep.id);
		if (!step) {
			diagnostics.push({
				code: "missing_step_record",
				message: `Graph step ${graphStep.id} does not have a persisted step record.`,
				details: { stepId: graphStep.id },
			});
			continue;
		}
		if (
			step.status !== "pending" ||
			!dependenciesCompleted(graphStep.dependsOn, completedStepIds)
		) {
			continue;
		}

		const readyStep: StepRecord = { ...step, status: "ready" };
		await store.writeStepRecord(ref, readyStep);
		await store.appendEvent(ref, {
			type: "step_ready",
			runId: ref.runId,
			stepId: step.id,
		});
		stepsById.set(step.id, readyStep);
		readyTransitionStepIds.push(step.id);
	}

	const steps = graph.steps.flatMap((graphStep) => {
		const step = stepsById.get(graphStep.id);
		return step ? [step] : [];
	});
	const readyStepIds = graph.steps.flatMap((graphStep) => {
		const step = stepsById.get(graphStep.id);
		if (
			!step ||
			step.status !== "ready" ||
			!dependenciesCompleted(graphStep.dependsOn, completedStepIds)
		) {
			return [];
		}
		return [step.id];
	});
	const nextState: SchedulerState = {
		...previousState,
		readyStepIds,
		updatedAt:
			readyTransitionStepIds.length > 0 ||
			!sameStringArray(previousState.readyStepIds, readyStepIds)
				? now()
				: previousState.updatedAt,
	};
	const changed =
		readyTransitionStepIds.length > 0 ||
		!sameStringArray(previousState.readyStepIds, readyStepIds);
	if (changed) {
		await store.writeSchedulerState(ref, nextState);
	}

	return {
		state: nextState,
		steps,
		diagnostics,
		readyTransitionStepIds,
		changed,
	};
}

function dependenciesCompleted(
	dependsOn: readonly string[],
	completedStepIds: ReadonlySet<string>,
): boolean {
	return dependsOn.every((stepId) => completedStepIds.has(stepId));
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
