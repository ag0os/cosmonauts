import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	FileRunStore,
	type RunGraphSchedulerResult,
	type RunRecord,
	type RunRef,
	type RunStore,
	runDurableGraphScheduler,
	type SchedulerStepInput,
	type StepRecord,
} from "../durable-runtime/index.ts";
import {
	isDoneTaskStatusStep,
	isPartialTaskStatusStep,
	readRetryableDriveFinalizerFailure,
} from "./drive-finalization.ts";
import { compileDriveRunToGraph } from "./drive-graph-compiler.ts";
import { createDriveSchedulerBackendMap } from "./drive-scheduler-backend.ts";
import { EventLogWriteError } from "./event-stream.ts";
import type { RunRunLoopCtx } from "./run-run-loop.ts";
import { writeInlineRunState, writeRunCompletion } from "./run-state.ts";
import type { DriverEvent, DriverResult, DriverRunSpec } from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";

export interface RunDriveOnGraphCtx extends RunRunLoopCtx {
	mode?: "inline" | "detached";
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface GraphRunState {
	store: FileRunStore;
	ref: RunRef;
	run: RunRecord;
	isNewRun: boolean;
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
		const graphRun = await loadOrCreateGraphRun({ spec, store, ref });
		const runSpec = withAuthoritativeTaskIds(spec, graphRun.run);
		if (graphRun.isNewRun) {
			await store.appendEvent(ref, { type: "run_started", runId: spec.runId });
		}
		await prepareCompatibilityWorkdir(runSpec, mode);
		await emit(runSpec, ctx, {
			type: "run_started",
			planSlug: runSpec.planSlug,
			backend: runSpec.backendName,
			mode,
		});

		const backends = createDriveSchedulerBackendMap({
			spec: runSpec,
			taskManager: ctx.taskManager,
			backend: ctx.backend,
			eventSink: ctx.eventSink,
		});
		const schedulerStore = withSafeSchedulerEventWrites(store);

		let schedulerResult: RunGraphSchedulerResult | undefined;
		for (let drains = 0; drains < SCHEDULER_DRAIN_LIMIT; drains++) {
			const finalizerFailure = await readRetryableDriveFinalizerFailure({
				store,
				ref,
				workdir: spec.workdir,
			});
			if (finalizerFailure) {
				const result = finalizationFailureResult(
					runSpec,
					finalizerFailure,
					await store.listStepRecords(ref),
				);
				await emitRunFinalizationFailed(runSpec, ctx, result);
				await writeRunCompletion(runSpec.workdir, result);
				return result;
			}

			schedulerResult = await runDurableGraphScheduler({
				store: schedulerStore,
				ref,
				backends,
				holderId: `${spec.runId}:${process.pid}`,
				inputForStep,
				signal: ctx.abortSignal,
			});

			const failureAfterDrain = await readRetryableDriveFinalizerFailure({
				store,
				ref,
				workdir: spec.workdir,
			});
			if (failureAfterDrain) {
				const result = finalizationFailureResult(
					runSpec,
					failureAfterDrain,
					schedulerResult.steps,
				);
				await emitRunFinalizationFailed(runSpec, ctx, result);
				await writeRunCompletion(runSpec.workdir, result);
				return result;
			}

			if (
				schedulerResult.exitReason === "terminal" ||
				schedulerResult.exitReason === "blocked" ||
				schedulerResult.exitReason === "cancelled" ||
				schedulerResult.exitReason === "waiting_for_fresh_external_work" ||
				allStepsTerminal(schedulerResult.steps)
			) {
				break;
			}
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
		await emitRunAborted(spec, ctx, formatError(error));
		throw error;
	}
}

async function prepareCompatibilityWorkdir(
	spec: DriverRunSpec,
	mode: "inline" | "detached",
): Promise<void> {
	await mkdir(spec.workdir, { recursive: true });
	await mkdir(dirname(spec.eventLogPath), { recursive: true });
	await writeFile(
		join(spec.workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(
		join(spec.workdir, "task-queue.txt"),
		`${compatibilityQueueTaskIds(spec).join("\n")}\n`,
		"utf-8",
	);
	if (mode === "inline") {
		await writeInlineRunState(spec.workdir);
	}
}

async function loadOrCreateGraphRun({
	spec,
	store,
	ref,
}: {
	spec: DriverRunSpec;
	store: FileRunStore;
	ref: RunRef;
}): Promise<GraphRunState> {
	const existing = await store.loadRun(ref);
	if (!existing) {
		const compiled = await compileDriveRunToGraph({ spec, store });
		return { store, ref, run: compiled.run, isNewRun: true };
	}

	const graph = await store.readRunGraph(ref);
	const steps = await store.listStepRecords(ref);
	if (graph.graph.steps.length === 0 && steps.length === 0) {
		validateDriveTaskIds(existing.metadata, spec);
		const compiled = await compileDriveRunToGraph({
			spec: withAuthoritativeTaskIds(spec, existing),
			store,
		});
		return { store, ref, run: compiled.run, isNewRun: true };
	}

	validateDriveTaskIds(existing.metadata, spec);
	return { store, ref, run: existing, isNewRun: false };
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
): Promise<void> {
	try {
		await emit(spec, ctx, { type: "run_aborted", reason });
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
