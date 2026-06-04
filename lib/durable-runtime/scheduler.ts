import type { RunGraphSchedulerBackend } from "./backends.ts";
import { reconcileSchedulerState } from "./scheduler-state.ts";
import { isTerminalStatus, isTerminalStepStatus } from "./status.ts";
import type {
	BackendName,
	KnownBackendName,
	RunGraphSchedulerResult,
	RunRecord,
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	SchedulerState,
	SchedulerStepInput,
	StepAttemptRecord,
	StepHeartbeat,
	StepLease,
	StepRecord,
	StepResult,
	StepStatus,
} from "./types.ts";
import { KNOWN_BACKEND_NAMES as knownBackendNames } from "./types.ts";

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
	backends,
	holderId,
	inputForStep,
	now,
	signal,
	heartbeatIntervalMs,
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
	const diagnostics = [...reconciliation.diagnostics];
	const staleTransition = await markPersistedStaleRunningSteps({
		store,
		ref,
		run,
		now: now ?? (() => new Date().toISOString()),
		state: reconciliation.state,
		steps: reconciliation.steps,
	});
	if (staleTransition.changed) {
		const finalized = await finalizeRun({
			store,
			ref,
			diagnostics,
		});
		return schedulerResult({
			store,
			ref,
			run: finalized ?? run,
			diagnostics,
			exitReason:
				finalized && isTerminalStatus(finalized.status)
					? "terminal"
					: "drained",
		});
	}

	const renewed = await renewOwnedRunningStep({
		store,
		ref,
		holderId,
		now: now ?? (() => new Date().toISOString()),
		steps: reconciliation.steps,
	});
	if (renewed) {
		return schedulerResult({
			store,
			ref,
			run,
			diagnostics,
			exitReason: "waiting_for_fresh_external_work",
		});
	}

	const runnable = firstRunnableStep({
		steps: reconciliation.steps,
		holderId,
	});
	if (!runnable) {
		return {
			run,
			steps: reconciliation.steps,
			diagnostics,
			exitReason: hasRunningExternalWork(reconciliation.steps, holderId)
				? "waiting_for_fresh_external_work"
				: "drained",
		};
	}

	const backend = backendForStep(runnable, backends);
	if (!backend) {
		diagnostics.push({
			code: "scheduler_backend_unavailable",
			message: `No scheduler backend is registered for ${runnable.backend.name}.`,
			details: { stepId: runnable.id, backend: runnable.backend.name },
		});
		return {
			run,
			steps: reconciliation.steps,
			diagnostics,
			exitReason: "drained",
		};
	}

	await executeStep({
		store,
		ref,
		run,
		step: runnable,
		backend,
		holderId,
		inputForStep,
		now: now ?? (() => new Date().toISOString()),
		signal,
		state: reconciliation.state,
		heartbeatIntervalMs,
	});

	const finalized = await finalizeRun({
		store,
		ref,
		diagnostics: reconciliation.diagnostics,
	});
	return schedulerResult({
		store,
		ref,
		run: finalized ?? run,
		diagnostics,
		exitReason:
			finalized && isTerminalStatus(finalized.status) ? "terminal" : "drained",
	});
}

interface SchedulerResultOptions {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	diagnostics: RuntimeDiagnostic[];
	exitReason: RunGraphSchedulerResult["exitReason"];
}

async function schedulerResult({
	store,
	ref,
	run,
	diagnostics,
	exitReason,
}: SchedulerResultOptions): Promise<RunGraphSchedulerResult> {
	return {
		run: (await store.loadRun(ref)) ?? run,
		steps: await store.listStepRecords(ref),
		diagnostics,
		exitReason,
	};
}

interface RenewOwnedRunningStepOptions {
	store: RunStore;
	ref: RunRef;
	holderId: string;
	now: () => string;
	steps: StepRecord[];
}

async function renewOwnedRunningStep({
	store,
	ref,
	holderId,
	now,
	steps,
}: RenewOwnedRunningStepOptions): Promise<boolean> {
	const step = steps.find(
		(candidate) =>
			candidate.status === "running" &&
			candidate.lease?.holderId === holderId &&
			candidate.lease.renewable,
	);
	if (!step) {
		return false;
	}

	const renewed = await renewPersistedRunningStep({
		store,
		ref,
		stepId: step.id,
		holderId,
		now,
	});
	return renewed !== undefined;
}

interface PersistedHeartbeatRenewalOptions {
	store: RunStore;
	ref: RunRef;
	stepId: string;
	holderId: string;
	now: () => string;
}

interface PersistedHeartbeatRenewal {
	lease: StepLease;
	heartbeat: StepHeartbeat;
}

async function renewPersistedRunningStep({
	store,
	ref,
	stepId,
	holderId,
	now,
}: PersistedHeartbeatRenewalOptions): Promise<
	PersistedHeartbeatRenewal | undefined
> {
	const step = await store.readStepRecord({ ...ref, stepId });
	if (
		!step ||
		step.status !== "running" ||
		step.lease?.holderId !== holderId ||
		!step.lease.renewable
	) {
		return undefined;
	}

	const renewedAt = now();
	const lease = stepLease(holderId, renewedAt);
	const heartbeat: StepHeartbeat = { at: renewedAt, note: "renewed" };
	await store.writeStepHeartbeat({ ...ref, stepId }, heartbeat);
	await store.writeStepRecord(ref, {
		...step,
		lease,
		heartbeat,
	});
	const latestState = await store.readSchedulerState(ref);
	await writeSchedulerState(store, ref, {
		...latestState,
		leasesByStepId: { ...latestState.leasesByStepId, [stepId]: lease },
		heartbeatsByStepId: {
			...latestState.heartbeatsByStepId,
			[stepId]: heartbeat,
		},
		updatedAt: renewedAt,
	});
	await store.appendEvent(ref, {
		type: "step_heartbeat",
		runId: ref.runId,
		stepId,
	});
	return { lease, heartbeat };
}

interface MarkPersistedStaleRunningStepsOptions {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	now: () => string;
	state: SchedulerState;
	steps: StepRecord[];
}

interface StaleTransitionResult {
	changed: boolean;
}

async function markPersistedStaleRunningSteps({
	store,
	ref,
	run,
	now,
	state,
	steps,
}: MarkPersistedStaleRunningStepsOptions): Promise<StaleTransitionResult> {
	const staleHeartbeatMs = explicitStaleHeartbeatMs(run);
	if (staleHeartbeatMs === undefined) {
		return { changed: false };
	}

	const checkedAt = now();
	let nextState = state;
	let changed = false;
	for (const step of steps) {
		if (step.status !== "running") {
			continue;
		}
		const lease = step.lease ?? state.leasesByStepId[step.id];
		if (!lease) {
			continue;
		}
		const heartbeat = await persistedHeartbeatForStep(store, ref, step, state);
		if (
			!heartbeat ||
			!isHeartbeatStale(heartbeat, checkedAt, staleHeartbeatMs)
		) {
			continue;
		}

		const staleStep: StepRecord = {
			...step,
			status: "stale",
			lease: undefined,
			heartbeat,
		};
		await store.writeStepRecord(ref, staleStep);
		const { [step.id]: _releasedLease, ...leasesByStepId } =
			nextState.leasesByStepId;
		nextState = {
			...nextState,
			readyStepIds: nextState.readyStepIds.filter(
				(stepId) => stepId !== step.id,
			),
			leasesByStepId,
			heartbeatsByStepId: {
				...nextState.heartbeatsByStepId,
				[step.id]: heartbeat,
			},
			updatedAt: checkedAt,
		};
		await writeSchedulerState(store, ref, nextState);
		await store.appendEvent(ref, {
			type: "step_stale",
			runId: ref.runId,
			stepId: step.id,
		});
		changed = true;
	}

	return { changed };
}

async function persistedHeartbeatForStep(
	store: RunStore,
	ref: RunRef,
	step: StepRecord,
	state: SchedulerState,
): Promise<StepHeartbeat | undefined> {
	return newestHeartbeat([
		await store.readStepHeartbeat({ ...ref, stepId: step.id }),
		step.heartbeat,
		state.heartbeatsByStepId[step.id],
	]);
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

function explicitStaleHeartbeatMs(run: RunRecord): number | undefined {
	const value = run.policy.staleHeartbeatMs;
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return value;
}

function isHeartbeatStale(
	heartbeat: StepHeartbeat,
	now: string,
	staleHeartbeatMs: number,
): boolean {
	const heartbeatTime = Date.parse(heartbeat.at);
	const nowTime = Date.parse(now);
	if (!Number.isFinite(heartbeatTime) || !Number.isFinite(nowTime)) {
		return false;
	}
	return nowTime - heartbeatTime > staleHeartbeatMs;
}

function firstRunnableStep({
	steps,
	holderId,
}: {
	steps: StepRecord[];
	holderId: string;
}): StepRecord | undefined {
	return steps.find((step) => {
		if (step.status !== "ready") {
			return false;
		}
		if (!step.lease) {
			return true;
		}
		return step.lease.holderId === holderId && step.lease.renewable;
	});
}

function hasRunningExternalWork(
	steps: StepRecord[],
	holderId: string,
): boolean {
	return steps.some(
		(step) => step.status === "running" && step.lease?.holderId !== holderId,
	);
}

function backendForStep(
	step: StepRecord,
	backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>,
): RunGraphSchedulerBackend | undefined {
	if (!isKnownBackendName(step.backend.name)) {
		return undefined;
	}
	return backends.get(step.backend.name);
}

function isKnownBackendName(name: BackendName): name is KnownBackendName {
	return (knownBackendNames as readonly string[]).includes(name);
}

interface ExecuteStepOptions {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	step: StepRecord;
	backend: RunGraphSchedulerBackend;
	holderId: string;
	inputForStep?: RunGraphSchedulerOptions["inputForStep"];
	now: () => string;
	signal?: AbortSignal;
	state: SchedulerState;
	heartbeatIntervalMs?: number;
}

async function executeStep({
	store,
	ref,
	run,
	step,
	backend,
	holderId,
	inputForStep,
	now,
	signal,
	state,
	heartbeatIntervalMs,
}: ExecuteStepOptions): Promise<void> {
	const startedAt = now();
	const attemptId = await nextAttemptId(store, ref, step.id);
	const lease = stepLease(holderId, startedAt);
	const heartbeat: StepHeartbeat = { at: startedAt };
	const openAttempt: StepAttemptRecord = { attemptId, startedAt };
	const runningStep: StepRecord = {
		...step,
		status: "running",
		lease,
		heartbeat,
		latestAttemptId: attemptId,
	};

	await store.writeStepAttemptRecord({ ...ref, stepId: step.id }, openAttempt);
	await store.writeStepHeartbeat({ ...ref, stepId: step.id }, heartbeat);
	await store.writeStepRecord(ref, runningStep);
	await writeSchedulerState(store, ref, {
		...state,
		readyStepIds: state.readyStepIds.filter((stepId) => stepId !== step.id),
		leasesByStepId: { ...state.leasesByStepId, [step.id]: lease },
		heartbeatsByStepId: {
			...state.heartbeatsByStepId,
			[step.id]: heartbeat,
		},
		updatedAt: startedAt,
	});
	await store.appendEvent(ref, {
		type: "step_started",
		runId: ref.runId,
		stepId: step.id,
		backend: backend.name,
	});
	await store.appendEvent(ref, {
		type: "step_heartbeat",
		runId: ref.runId,
		stepId: step.id,
	});

	let latestHeartbeat = heartbeat;
	let heartbeatWrite = Promise.resolve();
	const heartbeatTimer =
		heartbeatIntervalMs === undefined || heartbeatIntervalMs <= 0
			? undefined
			: setInterval(() => {
					heartbeatWrite = heartbeatWrite.then(async () => {
						const renewed = await renewPersistedRunningStep({
							store,
							ref,
							stepId: step.id,
							holderId,
							now,
						});
						if (renewed) {
							latestHeartbeat = renewed.heartbeat;
						}
					});
				}, heartbeatIntervalMs);
	let result: StepResult;
	try {
		const input =
			(await inputForStep?.(step, run)) ?? defaultInputForStep(step, run);
		const prepared = await backend.prepare(runningStep, {
			run,
			step: runningStep,
			attemptId,
			input,
			signal,
			now,
		});
		const handle = await backend.start(prepared);
		result = normalizeStepResult(await handle.result);
	} catch (error) {
		result = {
			outcome: "failed",
			summary: formatError(error),
			artifacts: [],
			nextAction: "abort_run",
		};
	} finally {
		if (heartbeatTimer !== undefined) {
			clearInterval(heartbeatTimer);
		}
		await heartbeatWrite;
	}

	const endedAt = now();
	const terminalAttempt = { ...openAttempt, endedAt, result };
	await store.writeStepAttemptRecord(
		{ ...ref, stepId: step.id },
		terminalAttempt,
	);

	const terminalStatus = stepStatusFromResult(result);
	const terminalStep: StepRecord = {
		...runningStep,
		status: terminalStatus,
		result,
		outputArtifacts: result.artifacts,
		lease: undefined,
		heartbeat: latestHeartbeat,
	};
	await store.writeStepRecord(ref, terminalStep);
	const latestState = await store.readSchedulerState(ref);
	const { [step.id]: _releasedLease, ...leasesByStepId } =
		latestState.leasesByStepId;
	await writeSchedulerState(store, ref, {
		...latestState,
		leasesByStepId,
		heartbeatsByStepId: {
			...latestState.heartbeatsByStepId,
			[step.id]: heartbeat,
		},
		updatedAt: endedAt,
	});
	await appendTerminalStepEvent(store, ref, terminalStep, result);
}

function defaultInputForStep(
	step: StepRecord,
	run: RunRecord,
): SchedulerStepInput {
	return {
		runId: run.runId,
		stepId: step.id,
		inputArtifacts: step.inputArtifacts,
		backendOptions: step.backend.options,
	};
}

function stepLease(holderId: string, at: string): StepLease {
	return {
		holderId,
		acquiredAt: at,
		expiresAt: offsetIso(at, 5 * 60 * 1000),
		renewable: true,
	};
}

function offsetIso(value: string, offsetMs: number): string | undefined {
	const time = Date.parse(value);
	if (!Number.isFinite(time)) {
		return undefined;
	}
	return new Date(time + offsetMs).toISOString();
}

async function nextAttemptId(
	store: RunStore,
	ref: RunRef,
	stepId: string,
): Promise<string> {
	const attempts = await store.listStepAttemptRecords({ ...ref, stepId });
	return `attempt-${String(attempts.length + 1).padStart(3, "0")}`;
}

async function writeSchedulerState(
	store: RunStore,
	ref: RunRef,
	state: SchedulerState,
): Promise<void> {
	await store.writeSchedulerState(ref, state);
}

function normalizeStepResult(value: StepResult): StepResult {
	if (!isStepResult(value)) {
		return {
			outcome: "unknown",
			summary: "Backend returned a malformed scheduler result.",
			artifacts: [],
			nextAction: "wait_for_human",
		};
	}
	return value;
}

function isStepResult(value: unknown): value is StepResult {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<StepResult>;
	return (
		(candidate.outcome === "success" ||
			candidate.outcome === "blocked" ||
			candidate.outcome === "partial" ||
			candidate.outcome === "failed" ||
			candidate.outcome === "unknown" ||
			candidate.outcome === "cancelled") &&
		typeof candidate.summary === "string" &&
		Array.isArray(candidate.artifacts)
	);
}

function stepStatusFromResult(result: StepResult): StepStatus {
	switch (result.outcome) {
		case "success":
			return "completed";
		case "failed":
			return "failed";
		case "cancelled":
			return "cancelled";
		case "blocked":
		case "partial":
		case "unknown":
			return "blocked";
	}
}

async function appendTerminalStepEvent(
	store: RunStore,
	ref: RunRef,
	step: StepRecord,
	result: StepResult,
): Promise<void> {
	switch (step.status) {
		case "completed":
			await store.appendEvent(ref, {
				type: "step_completed",
				runId: ref.runId,
				stepId: step.id,
				result,
			});
			return;
		case "blocked":
			await store.appendEvent(ref, {
				type: "step_blocked",
				runId: ref.runId,
				stepId: step.id,
				reason: result.summary,
			});
			return;
		case "failed":
			await store.appendEvent(ref, {
				type: "step_failed",
				runId: ref.runId,
				stepId: step.id,
				reason: result.summary,
			});
			return;
		case "cancelled":
			await store.appendEvent(ref, {
				type: "step_cancelled",
				runId: ref.runId,
				stepId: step.id,
			});
			return;
		default:
			return;
	}
}

interface FinalizeRunOptions {
	store: RunStore;
	ref: RunRef;
	diagnostics: RuntimeDiagnostic[];
}

async function finalizeRun({
	store,
	ref,
}: FinalizeRunOptions): Promise<RunRecord | undefined> {
	const run = await store.loadRun(ref);
	if (!run || isTerminalStatus(run.status)) {
		return run;
	}

	const steps = await store.listStepRecords(ref);
	if (
		steps.length === 0 ||
		!steps.every((step) => isTerminalStepStatus(step.status))
	) {
		return run;
	}

	if (steps.every((step) => step.status === "completed")) {
		await store.appendEvent(ref, {
			type: "run_completed",
			runId: ref.runId,
			result: {
				outcome: "completed",
				tasksDone: steps.length,
				tasksBlocked: 0,
			},
		});
		return store.loadRun(ref);
	}
	const blocked = steps.find((step) => step.status === "blocked");
	if (blocked) {
		await store.appendEvent(ref, {
			type: "run_blocked",
			runId: ref.runId,
			reason: blocked.result?.summary ?? `${blocked.id} blocked`,
		});
		return store.loadRun(ref);
	}
	const failed = steps.find((step) => step.status === "failed");
	if (failed) {
		await store.appendEvent(ref, {
			type: "run_failed",
			runId: ref.runId,
			reason: failed.result?.summary ?? `${failed.id} failed`,
		});
		return store.loadRun(ref);
	}
	if (steps.some((step) => step.status === "cancelled")) {
		await store.appendEvent(ref, { type: "run_cancelled", runId: ref.runId });
		return store.loadRun(ref);
	}
	if (steps.some((step) => step.status === "stale")) {
		await store.appendEvent(ref, { type: "run_stale", runId: ref.runId });
		return store.loadRun(ref);
	}
	return run;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
