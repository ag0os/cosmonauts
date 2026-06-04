import type { BackendHandle, RunGraphSchedulerBackend } from "./backends.ts";
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

	let reconciliation = await reconcileSchedulerState({ store, ref, now });
	const diagnostics = [...reconciliation.diagnostics];
	const terminalAttemptPromotion = await promotePersistedTerminalAttempts({
		store,
		ref,
		run,
		now: now ?? (() => new Date().toISOString()),
		state: reconciliation.state,
		steps: reconciliation.steps,
	});
	if (terminalAttemptPromotion.changed) {
		reconciliation = await reconcileSchedulerState({ store, ref, now });
		diagnostics.push(...reconciliation.diagnostics);
		const finalized = await finalizeRun({
			store,
			ref,
			diagnostics,
		});
		if (finalized && isTerminalStatus(finalized.status)) {
			return schedulerResult({
				store,
				ref,
				run: finalized,
				diagnostics,
				exitReason: "terminal",
			});
		}
	}
	if (hasBlockingPersistedStateDiagnostics(reconciliation.diagnostics)) {
		return {
			run,
			steps: reconciliation.steps,
			diagnostics,
			exitReason: "blocked",
		};
	}
	const committedWorkBlock = await blockPotentiallyCommittedRunningSteps({
		store,
		ref,
		run,
		backends,
		now: now ?? (() => new Date().toISOString()),
		state: reconciliation.state,
		steps: reconciliation.steps,
	});
	if (committedWorkBlock.changed) {
		diagnostics.push(...committedWorkBlock.diagnostics);
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
					: "blocked",
		});
	}
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

	const alreadyFinalized = await finalizeRun({
		store,
		ref,
		diagnostics,
	});
	if (alreadyFinalized && isTerminalStatus(alreadyFinalized.status)) {
		return schedulerResult({
			store,
			ref,
			run: alreadyFinalized,
			diagnostics,
			exitReason: "terminal",
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

	const runnablePlan = planRunnableSteps({
		run,
		steps: reconciliation.steps,
		backends,
		holderId,
	});
	diagnostics.push(...runnablePlan.diagnostics);
	const runningCount = reconciliation.steps.filter(
		(step) => step.status === "running",
	).length;
	const availableSlots = Math.max(
		0,
		runnablePlan.effectiveLimit - runningCount,
	);
	if (availableSlots === 0) {
		return schedulerResult({
			store,
			ref,
			run,
			diagnostics,
			exitReason: "waiting_for_fresh_external_work",
		});
	}

	const executions: StartedStepExecution[] = [];
	for (const runnableStep of runnablePlan.steps.slice(0, availableSlots)) {
		executions.push(
			await startStepExecution({
				store,
				ref,
				run,
				step: runnableStep.step,
				backend: runnableStep.backend,
				holderId,
				inputForStep,
				now: now ?? (() => new Date().toISOString()),
				signal,
				heartbeatIntervalMs,
			}),
		);
	}

	for (const execution of executions) {
		await finishStepExecution({
			store,
			ref,
			run,
			execution,
			now: now ?? (() => new Date().toISOString()),
		});
	}

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

interface PromotePersistedTerminalAttemptsOptions {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	now: () => string;
	state: SchedulerState;
	steps: StepRecord[];
}

interface TerminalAttemptPromotionResult {
	changed: boolean;
}

async function promotePersistedTerminalAttempts({
	store,
	ref,
	run,
	now,
	state,
	steps,
}: PromotePersistedTerminalAttemptsOptions): Promise<TerminalAttemptPromotionResult> {
	let nextState = state;
	let changed = false;
	for (const step of steps) {
		if (isTerminalStepStatus(step.status)) {
			continue;
		}

		const attempts = await store.listStepAttemptRecords({
			...ref,
			stepId: step.id,
		});
		const terminalAttempt = terminalAttemptForStep(step, attempts);
		if (!terminalAttempt) {
			continue;
		}

		const attemptNumber = attemptNumberForAttempt(
			attempts,
			terminalAttempt.attemptId,
		);
		const transition = stepTransitionFromResult({
			result: terminalAttempt.result,
			attemptNumber,
			maxAttempts: effectiveMaxAttempts(step, run),
		});
		const heartbeat = await persistedHeartbeatForStep(
			store,
			ref,
			step,
			nextState,
		);
		const recoveredStep: StepRecord = {
			...step,
			status: transition.status,
			result: transition.stepResult,
			outputArtifacts: transition.stepResult.artifacts,
			latestAttemptId: terminalAttempt.attemptId,
			lease: undefined,
			heartbeat,
		};
		await store.writeStepRecord(ref, recoveredStep);
		const { [step.id]: _releasedLease, ...leasesByStepId } =
			nextState.leasesByStepId;
		nextState = {
			...nextState,
			readyStepIds: transition.retry
				? [
						...nextState.readyStepIds.filter((stepId) => stepId !== step.id),
						step.id,
					]
				: nextState.readyStepIds.filter((stepId) => stepId !== step.id),
			leasesByStepId,
			heartbeatsByStepId: heartbeat
				? { ...nextState.heartbeatsByStepId, [step.id]: heartbeat }
				: nextState.heartbeatsByStepId,
			updatedAt: terminalAttempt.endedAt ?? now(),
		};
		await writeSchedulerState(store, ref, nextState);
		if (transition.retry) {
			await store.appendEvent(ref, {
				type: "step_ready",
				runId: ref.runId,
				stepId: step.id,
			});
		} else {
			await appendTerminalStepEvent(
				store,
				ref,
				recoveredStep,
				transition.stepResult,
			);
		}
		changed = true;
	}

	return { changed };
}

function hasBlockingPersistedStateDiagnostics(
	diagnostics: readonly RuntimeDiagnostic[],
): boolean {
	return diagnostics.some(
		(diagnostic) =>
			diagnostic.code === "missing_step_record" ||
			diagnostic.code === "corrupt_step_record" ||
			diagnostic.code === "invalid_step_record",
	);
}

function terminalAttemptForStep(
	step: StepRecord,
	attempts: StepAttemptRecord[],
): (StepAttemptRecord & { endedAt: string; result: StepResult }) | undefined {
	const candidates = attempts.filter(hasTerminalAttemptResult);
	if (candidates.length === 0) {
		return undefined;
	}
	if (step.latestAttemptId) {
		return candidates.find(
			(attempt) => attempt.attemptId === step.latestAttemptId,
		);
	}
	return candidates.at(-1);
}

function hasTerminalAttemptResult(
	attempt: StepAttemptRecord,
): attempt is StepAttemptRecord & { endedAt: string; result: StepResult } {
	return attempt.endedAt !== undefined && attempt.result !== undefined;
}

function attemptNumberForAttempt(
	attempts: StepAttemptRecord[],
	attemptId: string,
): number {
	const index = attempts.findIndex(
		(attempt) => attempt.attemptId === attemptId,
	);
	return index >= 0 ? index + 1 : attempts.length;
}

interface BlockPotentiallyCommittedRunningStepsOptions {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
	now: () => string;
	state: SchedulerState;
	steps: StepRecord[];
}

interface CommittedWorkBlockResult {
	changed: boolean;
	diagnostics: RuntimeDiagnostic[];
}

async function blockPotentiallyCommittedRunningSteps({
	store,
	ref,
	run,
	backends,
	now,
	state,
	steps,
}: BlockPotentiallyCommittedRunningStepsOptions): Promise<CommittedWorkBlockResult> {
	if (run.policy.retryPotentiallyCommittedSteps === true) {
		return { changed: false, diagnostics: [] };
	}

	const diagnostics: RuntimeDiagnostic[] = [];
	const staleHeartbeatMs = explicitStaleHeartbeatMs(run);
	const checkedAt = now();
	let nextState = state;
	let changed = false;
	for (const step of steps) {
		if (step.status !== "running") {
			continue;
		}
		const backend = backendForStep(step, backends);
		if (!backend?.capabilities.canCommit) {
			continue;
		}
		const attempts = await store.listStepAttemptRecords({
			...ref,
			stepId: step.id,
		});
		if (terminalAttemptForStep(step, attempts)) {
			continue;
		}

		const heartbeat = await persistedHeartbeatForStep(store, ref, step, state);
		if (
			heartbeat &&
			(staleHeartbeatMs === undefined ||
				!isHeartbeatStale(heartbeat, checkedAt, staleHeartbeatMs))
		) {
			continue;
		}

		const result: StepResult = {
			outcome: "blocked",
			summary:
				"Running work may have committed changes before scheduler restart; manual recovery is required before retrying.",
			artifacts: [],
			nextAction: "wait_for_human",
		};
		const blockedStep: StepRecord = {
			...step,
			status: "blocked",
			result,
			outputArtifacts: result.artifacts,
			lease: undefined,
			heartbeat,
		};
		await store.writeStepRecord(ref, blockedStep);
		const { [step.id]: _releasedLease, ...leasesByStepId } =
			nextState.leasesByStepId;
		nextState = {
			...nextState,
			readyStepIds: nextState.readyStepIds.filter(
				(stepId) => stepId !== step.id,
			),
			leasesByStepId,
			heartbeatsByStepId: heartbeat
				? { ...nextState.heartbeatsByStepId, [step.id]: heartbeat }
				: nextState.heartbeatsByStepId,
			updatedAt: checkedAt,
		};
		await writeSchedulerState(store, ref, nextState);
		await appendTerminalStepEvent(store, ref, blockedStep, result);
		diagnostics.push({
			code: "potentially_committed_step_blocked",
			message:
				"Commit-capable running step has no terminal attempt evidence after restart.",
			details: {
				stepId: step.id,
				backend: backend.name,
				latestAttemptId: step.latestAttemptId,
			},
		});
		changed = true;
	}

	return { changed, diagnostics };
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

interface PlannedRunnableStep {
	step: StepRecord;
	backend: RunGraphSchedulerBackend;
}

interface RunnableStepPlan {
	steps: PlannedRunnableStep[];
	effectiveLimit: number;
	diagnostics: RuntimeDiagnostic[];
}

function planRunnableSteps({
	run,
	steps,
	backends,
	holderId,
}: {
	run: RunRecord;
	steps: StepRecord[];
	backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
	holderId: string;
}): RunnableStepPlan {
	const runnableSteps = steps.filter((step) => isRunnableStep(step, holderId));
	const plannedSteps = runnableSteps.flatMap((step) => {
		const backend = backendForStep(step, backends);
		return backend ? [{ step, backend }] : [];
	});
	const requestedLimit = effectiveMaxParallelSteps(run);
	const diagnostics: RuntimeDiagnostic[] = [];
	let effectiveLimit = requestedLimit;
	const unsafeSharedStep = plannedSteps.find(
		({ backend }) =>
			requestedLimit > 1 &&
			run.policy.worktree.mode === "shared" &&
			!isSafeForSharedWorktreeConcurrency(backend),
	);
	if (unsafeSharedStep) {
		effectiveLimit = 1;
		diagnostics.push({
			code: "shared_worktree_mutable_concurrency_capped",
			message:
				"Shared-worktree backend concurrency was capped to one because at least one runnable backend may mutate host source.",
			details: {
				requestedMaxParallelSteps: requestedLimit,
				effectiveMaxParallelSteps: effectiveLimit,
				worktreeMode: run.policy.worktree.mode,
				stepId: unsafeSharedStep.step.id,
				backend: unsafeSharedStep.backend.name,
				capabilities: unsafeSharedStep.backend.capabilities,
			},
		});
	}

	return { steps: plannedSteps, effectiveLimit, diagnostics };
}

function isRunnableStep(step: StepRecord, holderId: string): boolean {
	if (step.status !== "ready") {
		return false;
	}
	if (!step.lease) {
		return true;
	}
	return step.lease.holderId === holderId && step.lease.renewable;
}

function effectiveMaxParallelSteps(run: RunRecord): number {
	return positiveInteger(run.policy.maxParallelSteps) ?? 1;
}

function isSafeForSharedWorktreeConcurrency(
	backend: RunGraphSchedulerBackend,
): boolean {
	return (
		backend.capabilities.isolatedFromHostSource &&
		!backend.capabilities.canCommit
	);
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
	heartbeatIntervalMs?: number;
}

interface HeartbeatWriteState {
	latestHeartbeat: StepHeartbeat;
	write: Promise<void>;
}

interface StartedStepExecution {
	runningStep: StepRecord;
	attemptNumber: number;
	openAttempt: StepAttemptRecord;
	handle?: BackendHandle<StepResult>;
	startError?: unknown;
	heartbeatState: HeartbeatWriteState;
	heartbeatTimer?: ReturnType<typeof setInterval>;
}

async function startStepExecution({
	store,
	ref,
	run,
	step,
	backend,
	holderId,
	inputForStep,
	now,
	signal,
	heartbeatIntervalMs,
}: ExecuteStepOptions): Promise<StartedStepExecution> {
	const startedAt = now();
	const priorAttempts = await store.listStepAttemptRecords({
		...ref,
		stepId: step.id,
	});
	const attemptNumber = priorAttempts.length + 1;
	const attemptId = attemptIdForNumber(attemptNumber);
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
	const latestState = await store.readSchedulerState(ref);
	await writeSchedulerState(store, ref, {
		...latestState,
		readyStepIds: latestState.readyStepIds.filter(
			(stepId) => stepId !== step.id,
		),
		leasesByStepId: { ...latestState.leasesByStepId, [step.id]: lease },
		heartbeatsByStepId: {
			...latestState.heartbeatsByStepId,
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

	const heartbeatState: HeartbeatWriteState = {
		latestHeartbeat: heartbeat,
		write: Promise.resolve(),
	};
	const heartbeatTimer =
		heartbeatIntervalMs === undefined || heartbeatIntervalMs <= 0
			? undefined
			: setInterval(() => {
					heartbeatState.write = heartbeatState.write.then(async () => {
						const renewed = await renewPersistedRunningStep({
							store,
							ref,
							stepId: step.id,
							holderId,
							now,
						});
						if (renewed) {
							heartbeatState.latestHeartbeat = renewed.heartbeat;
						}
					});
				}, heartbeatIntervalMs);
	let handle: BackendHandle<StepResult> | undefined;
	let startError: unknown;
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
		handle = await backend.start(prepared);
	} catch (error) {
		startError = error;
	}

	return {
		runningStep,
		attemptNumber,
		openAttempt,
		handle,
		startError,
		heartbeatState,
		heartbeatTimer,
	};
}

async function finishStepExecution({
	store,
	ref,
	run,
	execution,
	now,
}: {
	store: RunStore;
	ref: RunRef;
	run: RunRecord;
	execution: StartedStepExecution;
	now: () => string;
}): Promise<void> {
	let result: StepResult;
	try {
		if (execution.startError) {
			throw execution.startError;
		}
		if (!execution.handle) {
			throw new Error("Backend did not return a scheduler handle.");
		}
		result = normalizeStepResult(await execution.handle.result);
	} catch (error) {
		result = {
			outcome: "failed",
			summary: formatError(error),
			artifacts: [],
			nextAction: "abort_run",
		};
	} finally {
		if (execution.heartbeatTimer !== undefined) {
			clearInterval(execution.heartbeatTimer);
		}
		await execution.heartbeatState.write;
	}

	const endedAt = now();
	const terminalAttempt = { ...execution.openAttempt, endedAt, result };
	await store.writeStepAttemptRecord(
		{ ...ref, stepId: execution.runningStep.id },
		terminalAttempt,
	);

	const transition = stepTransitionFromResult({
		result,
		attemptNumber: execution.attemptNumber,
		maxAttempts: effectiveMaxAttempts(execution.runningStep, run),
	});
	const terminalStep: StepRecord = {
		...execution.runningStep,
		status: transition.status,
		result: transition.stepResult,
		outputArtifacts: transition.stepResult.artifacts,
		lease: undefined,
		heartbeat: execution.heartbeatState.latestHeartbeat,
	};
	await store.writeStepRecord(ref, terminalStep);
	const latestState = await store.readSchedulerState(ref);
	const { [execution.runningStep.id]: _releasedLease, ...leasesByStepId } =
		latestState.leasesByStepId;
	await writeSchedulerState(store, ref, {
		...latestState,
		readyStepIds: transition.retry
			? [
					...latestState.readyStepIds.filter(
						(stepId) => stepId !== execution.runningStep.id,
					),
					execution.runningStep.id,
				]
			: latestState.readyStepIds.filter(
					(stepId) => stepId !== execution.runningStep.id,
				),
		leasesByStepId,
		heartbeatsByStepId: {
			...latestState.heartbeatsByStepId,
			[execution.runningStep.id]: execution.heartbeatState.latestHeartbeat,
		},
		updatedAt: endedAt,
	});
	if (transition.retry) {
		await store.appendEvent(ref, {
			type: "step_ready",
			runId: ref.runId,
			stepId: execution.runningStep.id,
		});
	} else {
		await appendTerminalStepEvent(
			store,
			ref,
			terminalStep,
			transition.stepResult,
		);
	}
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

function attemptIdForNumber(attemptNumber: number): string {
	return `attempt-${String(attemptNumber).padStart(3, "0")}`;
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

interface StepTransition {
	status: StepStatus;
	stepResult: StepResult;
	retry: boolean;
}

function stepTransitionFromResult({
	result,
	attemptNumber,
	maxAttempts,
}: {
	result: StepResult;
	attemptNumber: number;
	maxAttempts: number;
}): StepTransition {
	if (result.nextAction === "retry") {
		if (attemptNumber < maxAttempts) {
			return { status: "ready", stepResult: result, retry: true };
		}
		return {
			status: "blocked",
			stepResult: blockedStepResult(
				result,
				`Retry attempts exhausted after ${formatAttemptCount(attemptNumber)}.`,
			),
			retry: false,
		};
	}

	if (
		result.outcome === "unknown" ||
		result.outcome === "partial" ||
		result.nextAction === "wait_for_human"
	) {
		return {
			status: "blocked",
			stepResult: blockedStepResult(result, result.summary),
			retry: false,
		};
	}

	return {
		status: stepStatusFromResult(result),
		stepResult: result,
		retry: false,
	};
}

function blockedStepResult(result: StepResult, summary: string): StepResult {
	return {
		...result,
		outcome: "blocked",
		summary,
		nextAction: "wait_for_human",
	};
}

function formatAttemptCount(attemptNumber: number): string {
	return attemptNumber === 1 ? "1 attempt" : `${attemptNumber} attempts`;
}

function effectiveMaxAttempts(step: StepRecord, run: RunRecord): number {
	const stepMaxAttempts = positiveInteger(step.retryPolicy?.maxAttempts);
	if (stepMaxAttempts !== undefined) {
		return stepMaxAttempts;
	}
	const retryLimit = nonNegativeInteger(run.policy.retryLimit);
	if (retryLimit !== undefined) {
		return retryLimit + 1;
	}
	return 1;
}

function positiveInteger(value: number | undefined): number | undefined {
	if (value === undefined || !Number.isFinite(value) || value < 1) {
		return undefined;
	}
	return Math.floor(value);
}

function nonNegativeInteger(value: number | undefined): number | undefined {
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.floor(value);
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
		(!steps.every((step) => isTerminalStepStatus(step.status)) &&
			!hasBlockedOutcomeWithNoRunnableWork(steps))
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

function hasBlockedOutcomeWithNoRunnableWork(
	steps: readonly StepRecord[],
): boolean {
	return (
		steps.some((step) => step.status === "blocked") &&
		steps.every((step) => step.status !== "ready" && step.status !== "running")
	);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
