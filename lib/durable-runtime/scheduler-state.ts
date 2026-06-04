import { isTerminalStepStatus } from "./status.ts";
import type {
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	SchedulerState,
	StepHeartbeat,
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
	const heartbeatEntries = await Promise.all(
		steps.map(async (step) => [
			step.id,
			newestHeartbeat([
				await store.readStepHeartbeat({ ...ref, stepId: step.id }),
				step.heartbeat,
				previousState.heartbeatsByStepId[step.id],
			]),
		]),
	);
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
	const leasesByStepId = Object.fromEntries(
		steps.flatMap((step) => {
			if (isTerminalStepStatus(step.status)) {
				return [];
			}
			const lease = step.lease ?? previousState.leasesByStepId[step.id];
			return lease ? [[step.id, lease]] : [];
		}),
	);
	const heartbeatsByStepId = Object.fromEntries(
		heartbeatEntries.flatMap(([stepId, heartbeat]) =>
			heartbeat ? [[stepId, heartbeat]] : [],
		),
	);
	const nextState: SchedulerState = {
		...previousState,
		readyStepIds,
		leasesByStepId,
		heartbeatsByStepId,
		updatedAt:
			readyTransitionStepIds.length > 0 ||
			!sameStringArray(previousState.readyStepIds, readyStepIds) ||
			!sameRecord(previousState.leasesByStepId, leasesByStepId) ||
			!sameRecord(previousState.heartbeatsByStepId, heartbeatsByStepId)
				? now()
				: previousState.updatedAt,
	};
	const changed =
		readyTransitionStepIds.length > 0 ||
		!sameStringArray(previousState.readyStepIds, readyStepIds) ||
		!sameRecord(previousState.leasesByStepId, leasesByStepId) ||
		!sameRecord(previousState.heartbeatsByStepId, heartbeatsByStepId);
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

function sameRecord(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): boolean {
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	if (!sameStringArray(leftKeys, rightKeys)) {
		return false;
	}
	return leftKeys.every(
		(key) => stableStringify(left[key]) === stableStringify(right[key]),
	);
}

function newestHeartbeat(
	heartbeats: readonly (StepHeartbeat | undefined)[],
): StepHeartbeat | undefined {
	const present = heartbeats.filter(
		(heartbeat): heartbeat is StepHeartbeat => heartbeat !== undefined,
	);
	if (present.length === 0) {
		return undefined;
	}

	const dated = present
		.map((heartbeat) => ({ heartbeat, time: Date.parse(heartbeat.at) }))
		.filter(({ time }) => Number.isFinite(time));
	if (dated.length === 0) {
		return present[0];
	}

	return dated.reduce((latest, candidate) =>
		candidate.time > latest.time ? candidate : latest,
	).heartbeat;
}

function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, innerValue) => {
		if (
			typeof innerValue !== "object" ||
			innerValue === null ||
			Array.isArray(innerValue)
		) {
			return innerValue as unknown;
		}
		return Object.fromEntries(
			Object.entries(innerValue).sort(([left], [right]) =>
				left.localeCompare(right),
			),
		);
	});
}
