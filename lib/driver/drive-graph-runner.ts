import { join } from "node:path";
import {
	FileRunStore,
	type RunGraphSchedulerResult,
	type RunRecord,
	type RunRef,
	type RunStore,
	type RuntimeDiagnostic,
	runStart,
	type SchedulerStepInput,
	type StepRecord,
} from "../durable-runtime/index.ts";
import {
	isDoneTaskStatusStep,
	isPartialTaskStatusStep,
	readRetryableDriveFinalizerFailure,
} from "./drive-finalization.ts";
import { compileDriveRunStart } from "./drive-graph-compiler.ts";
import { createDriveSchedulerBackendMap } from "./drive-scheduler-backend.ts";
import { EventLogWriteError } from "./event-stream.ts";
import type { RunRunLoopCtx } from "./run-run-loop.ts";
import { writeInlineRunState, writeRunCompletion } from "./run-state.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunAbortDetails,
	DriverRunSpec,
} from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";
import { writeDriverWorkdirInputs } from "./workdir-inputs.ts";

export interface RunDriveOnGraphCtx extends RunRunLoopCtx {
	mode?: "inline" | "detached";
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface GraphRunState {
	run?: RunRecord;
}

const SCHEDULER_DRAIN_LIMIT = 10_000;

export async function runDriveOnGraph(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
): Promise<DriverResult> {
	const store = new FileRunStore({
		rootDir: join(spec.projectRoot, "missions", "sessions"),
	});
	const ref = { scope: spec.planSlug, runId: spec.runId };
	const mode = ctx.mode ?? "inline";

	try {
		await prepareCompatibilityWorkdir(spec, mode);
		const graphRun = await loadGraphRun({ spec, store, ref });
		const runSpec = graphRun.run
			? withAuthoritativeTaskIds(spec, graphRun.run)
			: spec;
		await prepareCompatibilityWorkdir(runSpec, mode);
		await emit(runSpec, ctx, {
			type: "run_started",
			planSlug: runSpec.planSlug,
			backend: runSpec.backendName,
			mode,
		});
		const compiled = compileDriveRunStart(runSpec);

		const backends = createDriveSchedulerBackendMap({
			spec: runSpec,
			taskManager: ctx.taskManager,
			backend: ctx.backend,
			eventSink: ctx.eventSink,
		});
		const schedulerStore = withSafeSchedulerEventWrites(store);
		let finalizerFailure: Awaited<
			ReturnType<typeof readRetryableDriveFinalizerFailure>
		>;

		const schedulerResult = await runStart({
			store,
			schedulerStore,
			ref,
			graph: compiled.graph,
			initialSteps: compiled.initialSteps,
			createRun: compiled.createRun,
			backends,
			holderId: `${spec.runId}:${process.pid}`,
			inputForStep,
			signal: ctx.abortSignal,
			maxPasses: SCHEDULER_DRAIN_LIMIT,
			stopPolicy: {
				async beforePass(state) {
					finalizerFailure = await readRetryableDriveFinalizerFailure({
						store,
						ref,
						workdir: runSpec.workdir,
					});
					if (!finalizerFailure) {
						return undefined;
					}
					return {
						reason: "drive_finalization_failed",
						exitReason: "interrupted",
						run: state.run,
						steps: state.steps,
					};
				},
				async afterPass(state) {
					finalizerFailure = await readRetryableDriveFinalizerFailure({
						store,
						ref,
						workdir: runSpec.workdir,
					});
					if (!finalizerFailure) {
						return undefined;
					}
					return {
						reason: "drive_finalization_failed",
						exitReason: "interrupted",
						run: state.run,
						steps: state.steps,
					};
				},
				shouldStop(pass) {
					return (
						(pass.exitReason === "drained" &&
							!hasPendingStepReadyOnNextPass(pass.steps)) ||
						allStepsTerminal(pass.steps)
					);
				},
			},
		});

		if (finalizerFailure) {
			const result = finalizationFailureResult(
				runSpec,
				finalizerFailure,
				schedulerResult.steps,
			);
			await emitRunFinalizationFailed(runSpec, ctx, result);
			await writeRunCompletion(runSpec.workdir, result);
			return result;
		}

		if (schedulerResult.type === "interrupted") {
			throw new Error(
				`Drive graph run interrupted: ${schedulerResult.interruption.reason}`,
			);
		}

		if (!schedulerResult) {
			throw new Error("Drive graph scheduler did not produce a result.");
		}

		const result = await toDriverResult(
			runSpec,
			ctx,
			store,
			ref,
			schedulerResult,
		);
		await emitTerminalLegacyEvent(runSpec, ctx, result);
		await writeRunCompletion(runSpec.workdir, result);
		return result;
	} catch (error) {
		if (error instanceof EventLogWriteError) {
			const result: DriverResult = {
				runId: spec.runId,
				outcome: "aborted",
				tasksDone: 0,
				tasksBlocked: 0,
				blockedReason: "log write failed",
			};
			await writeRunCompletion(spec.workdir, result);
			return result;
		}
		const details = await exceptionAbortDetails({
			spec,
			store,
			ref,
			error,
			phase: "scheduler",
		});
		await emitDriverDiagnostic(spec, ctx, {
			level: "error",
			code: "drive_scheduler_exception",
			message: formatError(error),
			phase:
				details.cause.type === "exception" ? details.cause.phase : undefined,
			taskId:
				details.cause.type === "exception" ? details.cause.taskId : undefined,
			details: {
				pendingTasks: details.pendingTasks,
			},
		});
		await emitRunAborted(spec, ctx, formatError(error), details);
		throw error;
	}
}

async function prepareCompatibilityWorkdir(
	spec: DriverRunSpec,
	mode: "inline" | "detached",
): Promise<void> {
	await writeDriverWorkdirInputs(spec, compatibilityQueueTaskIds(spec));
	if (mode === "inline") {
		await writeInlineRunState(spec.workdir);
	}
}

async function loadGraphRun({
	spec,
	store,
	ref,
}: {
	spec: DriverRunSpec;
	store: FileRunStore;
	ref: RunRef;
}): Promise<GraphRunState> {
	const run = await store.loadRun(ref);
	if (run) {
		validateDriveTaskIds(run.metadata, spec);
		return { run };
	}
	return {};
}

function withAuthoritativeTaskIds(
	spec: DriverRunSpec,
	run: RunRecord,
): DriverRunSpec {
	const value = run.metadata?.driveTaskIds;
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return { ...spec, taskIds: [...value] };
	}
	return spec;
}

function compatibilityQueueTaskIds(spec: DriverRunSpec): readonly string[] {
	return spec.remainingTaskIds ?? spec.taskIds;
}

function validateDriveTaskIds(
	metadata: Record<string, unknown> | undefined,
	spec: DriverRunSpec,
): void {
	const value = metadata?.driveTaskIds;
	if (value === undefined) {
		return;
	}
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		throw new Error(
			`Run ${spec.planSlug}/${spec.runId} has invalid driveTaskIds metadata.`,
		);
	}
}

function inputForStep(step: StepRecord): SchedulerStepInput {
	return {
		runId: step.runId,
		stepId: step.id,
		inputArtifacts: step.inputArtifacts,
		backendOptions: step.backend.options,
	};
}

async function toDriverResult(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	store: FileRunStore,
	ref: RunRef,
	schedulerResult: RunGraphSchedulerResult,
): Promise<DriverResult> {
	const steps = schedulerResult.steps;
	const taskStatusSteps = steps.filter((step) =>
		step.id.startsWith("finalizer-task-status-"),
	);
	const taskSteps = steps.filter((step) => step.kind === "drive");
	const tasksDone = taskStatusSteps.filter(isDoneTaskStatusStep).length;
	const partialStatusSteps = taskStatusSteps.filter(isPartialTaskStatusStep);
	const blockedStatusStep = taskStatusSteps.find(
		(step) => step.status === "blocked",
	);
	const blockedTaskStep = taskSteps.find((step) => step.status === "blocked");
	const blockedStep = blockedTaskStep ?? blockedStatusStep;
	const tasksBlocked = blockedStep
		? Math.max(1, taskSteps.filter((step) => step.status === "blocked").length)
		: 0;

	const latestRun = (await store.loadRun(ref)) ?? schedulerResult.run;
	if (
		latestRun.status === "completed" ||
		steps.every((step) => step.status === "completed")
	) {
		const partialTaskStep = partialStatusSteps[0];
		return {
			runId: spec.runId,
			outcome: "completed",
			tasksDone,
			tasksBlocked: partialStatusSteps.length,
			...(partialTaskStep
				? { blockedTaskId: taskIdFromStep(partialTaskStep) }
				: {}),
			...(await planCompletionCandidate(spec, ctx)),
			...stateCommitSha(steps),
		};
	}

	if (latestRun.status === "blocked" || blockedStep) {
		return {
			runId: spec.runId,
			outcome: "blocked",
			tasksDone,
			tasksBlocked,
			...(blockedStep ? { blockedTaskId: taskIdFromStep(blockedStep) } : {}),
			...(blockedStep?.result?.summary
				? { blockedReason: blockedStep.result.summary }
				: {}),
			abortDetails: schedulerAbortDetails({
				spec,
				steps,
				diagnostics: schedulerResult.diagnostics,
				exitReason: schedulerResult.exitReason,
			}),
		};
	}

	return {
		runId: spec.runId,
		outcome: "aborted",
		tasksDone,
		tasksBlocked,
		blockedReason:
			latestRun.status === "running" || latestRun.status === "pending"
				? `scheduler ${schedulerResult.exitReason}`
				: `run ${latestRun.status}`,
		abortDetails: schedulerAbortDetails({
			spec,
			steps,
			diagnostics: schedulerResult.diagnostics,
			exitReason: schedulerResult.exitReason,
		}),
	};
}
function finalizationFailureResult(
	spec: DriverRunSpec,
	failure: Awaited<ReturnType<typeof readRetryableDriveFinalizerFailure>>,
	steps: readonly StepRecord[],
): Extract<DriverResult, { outcome: "finalization_failed" }> {
	if (!failure) {
		throw new Error("Missing finalization failure evidence.");
	}
	return {
		runId: spec.runId,
		outcome: "finalization_failed",
		tasksDone: steps.filter(isDoneTaskStatusStep).length,
		tasksBlocked: 0,
		finalizationPhase: failure.finalizationPhase,
		finalizationReason: failure.finalizationReason,
		...(failure.finalizationTaskId
			? { finalizationTaskId: failure.finalizationTaskId }
			: {}),
		...(failure.finalizationCommitSha
			? { finalizationCommitSha: failure.finalizationCommitSha }
			: {}),
		pendingFinalizationPath: failure.pendingFinalizationPath,
	};
}

async function emitTerminalLegacyEvent(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	result: DriverResult,
): Promise<void> {
	if (result.outcome === "completed") {
		if (resolveStateCommitPolicy(spec) === "none") {
			await emit(spec, ctx, {
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "policy_none" },
			});
		}
		if (result.planCompletionCandidate) {
			await emit(spec, ctx, {
				type: "plan_completion_candidate",
				...result.planCompletionCandidate,
				reason: "all_plan_tasks_done",
			});
		}
		await emit(spec, ctx, {
			type: "run_completed",
			summary: {
				total: spec.taskIds.length,
				done: result.tasksDone,
				blocked: result.tasksBlocked,
			},
		});
		return;
	}
	if (result.outcome === "blocked" || result.outcome === "aborted") {
		await emit(spec, ctx, {
			type: "run_aborted",
			reason: result.blockedReason ?? result.outcome,
			details: result.abortDetails,
		});
	}
}

async function emitRunFinalizationFailed(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	result: Extract<DriverResult, { outcome: "finalization_failed" }>,
): Promise<void> {
	await emit(spec, ctx, {
		type: "run_finalization_failed",
		phase: result.finalizationPhase,
		reason: result.finalizationReason,
		taskId: result.finalizationTaskId,
		commitSha: result.finalizationCommitSha,
	});
}

async function emitRunAborted(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	reason: string,
	details?: DriverRunAbortDetails,
): Promise<void> {
	try {
		await emit(spec, ctx, { type: "run_aborted", reason, details });
	} catch {
		return;
	}
}

async function emitDriverDiagnostic(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	event: Omit<
		Extract<DriverEvent, { type: "driver_diagnostic" }>,
		"runId" | "parentSessionId" | "timestamp" | "type"
	>,
): Promise<void> {
	try {
		await emit(spec, ctx, { type: "driver_diagnostic", ...event });
	} catch {
		return;
	}
}

async function emit(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

async function planCompletionCandidate(
	spec: DriverRunSpec,
	ctx: RunDriveOnGraphCtx,
): Promise<
	| { planCompletionCandidate: { planSlug: string; taskCount: number } }
	| Record<string, never>
> {
	const tasks = await ctx.taskManager.listTasks({
		label: `plan:${spec.planSlug}`,
	});
	if (tasks.length === 0 || !tasks.every((task) => task.status === "Done")) {
		return {};
	}
	const candidate = { planSlug: spec.planSlug, taskCount: tasks.length };
	return { planCompletionCandidate: candidate };
}

function stateCommitSha(
	steps: readonly StepRecord[],
): { stateCommitSha: string } | Record<string, never> {
	const stateCommit = steps.find(
		(step) => step.id === "finalizer-state-commit",
	);
	const sha = stateCommit?.result?.commits?.at(-1)?.sha;
	return sha ? { stateCommitSha: sha } : {};
}

function taskIdFromStep(step: StepRecord): string {
	return step.id.startsWith("finalizer-task-status-")
		? step.id.slice("finalizer-task-status-".length)
		: step.id;
}

async function exceptionAbortDetails({
	spec,
	store,
	ref,
	error,
	phase,
}: {
	spec: DriverRunSpec;
	store: RunStore;
	ref: RunRef;
	error: unknown;
	phase: string;
}): Promise<DriverRunAbortDetails> {
	let steps: StepRecord[] = [];
	try {
		steps = await store.listStepRecords(ref);
	} catch {
		steps = [];
	}
	return {
		...pendingTaskSummary(spec, steps),
		cause: {
			type: "exception",
			message: formatError(error),
			phase,
			taskId: offendingTaskId(steps),
		},
	};
}

function schedulerAbortDetails({
	spec,
	steps,
	diagnostics,
	exitReason,
}: {
	spec: DriverRunSpec;
	steps: readonly StepRecord[];
	diagnostics: readonly RuntimeDiagnostic[];
	exitReason: RunGraphSchedulerResult["exitReason"];
}): DriverRunAbortDetails {
	const setupDiagnostic = backendSetupDiagnostic(diagnostics);
	if (setupDiagnostic) {
		return {
			...pendingTaskSummary(spec, steps),
			cause: {
				type: "backend-setup-failure",
				message: setupDiagnostic.message,
				...diagnosticTask(setupDiagnostic),
			},
		};
	}

	const blockingTaskIds = blockingTaskIdsForPendingTasks(spec, steps);
	if (blockingTaskIds.length > 0) {
		return {
			...pendingTaskSummary(spec, steps),
			cause: {
				type: "unmet-dependencies",
				blockingTaskIds,
			},
		};
	}

	return {
		...pendingTaskSummary(spec, steps),
		cause: {
			type: "backend-setup-failure",
			message: `Scheduler ${exitReason} with pending Drive tasks and no runnable work.`,
		},
	};
}

function pendingTaskSummary(
	spec: DriverRunSpec,
	steps: readonly StepRecord[],
): Pick<DriverRunAbortDetails, "pendingTasks"> {
	const completedTaskIds = new Set(
		steps
			.filter((step) => step.kind === "drive" && step.status === "completed")
			.map((step) => step.id),
	);
	const taskIds = spec.taskIds.filter(
		(taskId) => !completedTaskIds.has(taskId),
	);
	return {
		pendingTasks: {
			count: taskIds.length,
			taskIds,
		},
	};
}

function backendSetupDiagnostic(
	diagnostics: readonly RuntimeDiagnostic[],
): RuntimeDiagnostic | undefined {
	return diagnostics.find((diagnostic) =>
		[
			"scheduler_backend_unavailable",
			"missing_step_record",
			"corrupt_step_record",
			"invalid_step_record",
			"invalid_run_graph",
			"invalid_run_graph_step",
			"graph_step_run_mismatch",
			"invalid_run_graph_edge",
			"run_start_graph_mismatch",
		].includes(diagnostic.code),
	);
}

function diagnosticTask(
	diagnostic: RuntimeDiagnostic,
): Pick<
	Extract<DriverRunAbortDetails["cause"], { type: "backend-setup-failure" }>,
	"phase" | "taskId"
> {
	const details =
		typeof diagnostic.details === "object" && diagnostic.details !== null
			? (diagnostic.details as Record<string, unknown>)
			: {};
	const taskId =
		typeof details.taskId === "string"
			? details.taskId
			: typeof details.stepId === "string"
				? taskIdFromStepId(details.stepId)
				: undefined;
	return {
		phase: diagnostic.code,
		taskId,
	};
}

function blockingTaskIdsForPendingTasks(
	spec: DriverRunSpec,
	steps: readonly StepRecord[],
): string[] {
	const completedStepIds = new Set(
		steps.filter((step) => step.status === "completed").map((step) => step.id),
	);
	const stepById = new Map(steps.map((step) => [step.id, step]));
	const taskIds = new Set(spec.taskIds);
	const blocking = new Set<string>();

	for (const step of steps) {
		if (step.kind !== "drive" || step.status === "completed") {
			continue;
		}
		for (const dependencyId of step.dependsOn) {
			if (completedStepIds.has(dependencyId)) {
				continue;
			}
			const dependency = stepById.get(dependencyId);
			const taskId = taskIdFromStepId(dependencyId);
			if (
				taskIds.has(taskId) ||
				dependency?.status === "blocked" ||
				dependency?.status === "failed" ||
				dependency?.status === "cancelled" ||
				dependency?.status === "stale"
			) {
				blocking.add(taskId);
			}
		}
	}

	return [...blocking].sort();
}

function offendingTaskId(steps: readonly StepRecord[]): string | undefined {
	const running = steps.find(
		(step) => step.kind === "drive" && step.status === "running",
	);
	if (running) {
		return running.id;
	}
	const ready = steps.find(
		(step) => step.kind === "drive" && step.status === "ready",
	);
	return ready?.id;
}

function taskIdFromStepId(stepId: string): string {
	if (stepId.startsWith("finalizer-task-status-")) {
		return stepId.slice("finalizer-task-status-".length);
	}
	if (stepId.startsWith("finalizer-source-commit-")) {
		return stepId.slice("finalizer-source-commit-".length);
	}
	return stepId;
}

function allStepsTerminal(steps: readonly StepRecord[]): boolean {
	return (
		steps.length > 0 &&
		steps.every(
			(step) =>
				step.status === "completed" ||
				step.status === "blocked" ||
				step.status === "failed" ||
				step.status === "cancelled" ||
				step.status === "stale",
		)
	);
}

function hasPendingStepReadyOnNextPass(steps: readonly StepRecord[]): boolean {
	const completedStepIds = new Set(
		steps.filter((step) => step.status === "completed").map((step) => step.id),
	);
	return steps.some(
		(step) =>
			step.status === "pending" &&
			step.dependsOn.every((dependencyId) =>
				completedStepIds.has(dependencyId),
			),
	);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function withSafeSchedulerEventWrites(store: FileRunStore): RunStore {
	return new Proxy(store, {
		get(target, property, receiver) {
			if (property === "appendEvent") {
				return async (...args: Parameters<RunStore["appendEvent"]>) => {
					try {
						return await target.appendEvent(...args);
					} catch (error) {
						reportDurableDiagnostic({
							code: "drive_durable_event_append_failed",
							message:
								"Drive graph normalized event append failed; step records remain authoritative.",
							details: { error: formatError(error), event: args[1].type },
						});
						return {
							seq: 0,
							timestamp: new Date().toISOString(),
							runId: args[0].runId,
							event: args[1],
						};
					}
				};
			}
			if (property === "appendDiagnostic") {
				return async (...args: Parameters<RunStore["appendDiagnostic"]>) => {
					try {
						await target.appendDiagnostic(...args);
					} catch (error) {
						reportDurableDiagnostic({
							code: "drive_durable_diagnostic_append_failed",
							message:
								"Drive graph normalized diagnostic append failed; step records remain authoritative.",
							details: { error: formatError(error), diagnostic: args[1].code },
						});
					}
				};
			}
			const value = Reflect.get(target, property, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as RunStore;
}

function reportDurableDiagnostic(diagnostic: {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}): void {
	console.error(
		JSON.stringify({
			type: "drive_durable_event_diagnostic",
			...diagnostic,
		}),
	);
}
