import { appendFileSync } from "node:fs";
import { EventLogWriteError } from "./event-stream.ts";
import { type RunOneTaskCtx, runOneTask } from "./run-one-task.ts";
import {
	pendingFinalizationPath,
	writePendingFinalization,
	writeRunCompletion,
} from "./run-state.ts";
import { commitFinalState, skipStateCommit } from "./state-commit.ts";
import type { DriverEvent, DriverResult, DriverRunSpec } from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";

export interface RunRunLoopCtx extends RunOneTaskCtx {
	mode?: "inline" | "detached";
}

interface FinalizationFailureState {
	finalizationPhase: "commit" | "task_status" | "state_commit";
	finalizationReason: string;
	finalizationTaskId?: string;
	finalizationCommitSha?: string;
	pendingFinalizationPath: string;
}

interface PlanCompletionCandidate {
	planSlug: string;
	taskCount: number;
}

interface LoopState {
	done: number;
	blocked: number;
	outcome: DriverResult["outcome"];
	blockedTaskId?: string;
	blockedReason?: string;
	finalization?: FinalizationFailureState;
	stateCommitSha?: string;
	planCompletionCandidate?: PlanCompletionCandidate;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

const PARTIAL_STOP_REASON = "partial: stopping per partialMode";

export async function runRunLoop(
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
): Promise<DriverResult> {
	const state: LoopState = {
		done: 0,
		blocked: 0,
		outcome: "completed",
	};

	try {
		await emit(spec, ctx, {
			type: "run_started",
			planSlug: spec.planSlug,
			backend: spec.backendName,
			mode: ctx.mode ?? "inline",
		});

		for (const taskId of spec.taskIds) {
			const outcome = await runOneTask(spec, ctx, taskId);

			if (outcome.status === "done") {
				state.done += 1;
				continue;
			}

			if (outcome.status === "finalization_failed") {
				state.outcome = "finalization_failed";
				state.finalization = {
					finalizationPhase: outcome.finalizationPhase,
					finalizationReason: outcome.finalizationReason,
					finalizationTaskId: outcome.finalizationTaskId ?? taskId,
					finalizationCommitSha: outcome.finalizationCommitSha,
					pendingFinalizationPath: outcome.pendingFinalizationPath,
				};
				await emit(spec, ctx, {
					type: "run_finalization_failed",
					phase: outcome.finalizationPhase,
					reason: outcome.finalizationReason,
					taskId: outcome.finalizationTaskId ?? taskId,
					commitSha: outcome.finalizationCommitSha,
				});
				break;
			}

			state.blocked += 1;
			state.blockedTaskId = taskId;

			if (outcome.status === "blocked") {
				state.outcome = "blocked";
				state.blockedReason = outcome.reason ?? "task blocked";
				await emit(spec, ctx, {
					type: "run_aborted",
					reason: state.blockedReason,
				});
				break;
			}

			if (spec.partialMode !== "continue") {
				state.outcome = "aborted";
				state.blockedReason = PARTIAL_STOP_REASON;
				await emit(spec, ctx, {
					type: "run_aborted",
					reason: PARTIAL_STOP_REASON,
				});
				break;
			}
		}

		if (state.outcome === "completed") {
			await finalizeRunState(spec, ctx, state);
		}

		if (state.outcome === "completed") {
			await emitPlanCompletionCandidate(spec, ctx, state);
		}

		if (state.outcome === "completed") {
			await emit(spec, ctx, {
				type: "run_completed",
				summary: {
					total: spec.taskIds.length,
					done: state.done,
					blocked: state.blocked,
				},
			});
		}

		const result = toDriverResult(spec, state);
		if (result.outcome === "finalization_failed") {
			await writeRunCompletion(spec.workdir, result);
		}
		return result;
	} catch (error) {
		if (error instanceof EventLogWriteError) {
			writeLogFailureAbort(error.logPath, spec);
			return {
				runId: spec.runId,
				outcome: "aborted",
				tasksDone: state.done,
				tasksBlocked: state.blocked,
				blockedReason: "log write failed",
			};
		}

		await emitRunAborted(spec, ctx, formatError(error));
		throw error;
	}
}

async function finalizeRunState(
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
	state: LoopState,
): Promise<void> {
	if (state.blocked > 0) {
		await skipStateCommit(spec, ctx, "not_all_tasks_done");
		return;
	}

	if (resolveStateCommitPolicy(spec) === "none") {
		await skipStateCommit(spec, ctx, "policy_none");
		return;
	}

	const result = await commitFinalState(spec, ctx, spec.taskIds);
	if (result.status === "committed") {
		state.stateCommitSha = result.sha;
		return;
	}

	if (result.status !== "failed") {
		return;
	}

	await writePendingFinalization(spec.workdir, {
		runId: spec.runId,
		planSlug: spec.planSlug,
		createdAt: new Date().toISOString(),
		commitPolicy: spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(spec),
		reason: result.reason,
		phase: "state_commit",
		taskIds: spec.taskIds,
		headBeforeFinalization: result.headBeforeFinalization,
	});
	state.outcome = "finalization_failed";
	state.finalization = {
		finalizationPhase: "state_commit",
		finalizationReason: result.reason,
		pendingFinalizationPath: pendingFinalizationPath(spec.workdir),
	};
	await emit(spec, ctx, {
		type: "run_finalization_failed",
		phase: "state_commit",
		reason: result.reason,
	});
}

async function emitPlanCompletionCandidate(
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
	state: LoopState,
): Promise<void> {
	if (state.blocked > 0) {
		return;
	}

	const planTasks = await ctx.taskManager.listTasks({
		label: `plan:${spec.planSlug}`,
	});
	if (planTasks.length === 0) {
		return;
	}
	if (!planTasks.every((task) => task.status === "Done")) {
		return;
	}

	const candidate = {
		planSlug: spec.planSlug,
		taskCount: planTasks.length,
	};
	state.planCompletionCandidate = candidate;
	await emit(spec, ctx, {
		type: "plan_completion_candidate",
		...candidate,
		reason: "all_plan_tasks_done",
	});
}

async function emitRunAborted(
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
	reason: string,
): Promise<void> {
	try {
		await emit(spec, ctx, { type: "run_aborted", reason });
	} catch {
		// The event log is unwritable; nothing more we can do here. The
		// original error still propagates to the caller.
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function emit(
	spec: DriverRunSpec,
	ctx: RunRunLoopCtx,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

function writeLogFailureAbort(logPath: string, spec: DriverRunSpec): void {
	try {
		appendFileSync(
			logPath,
			`${JSON.stringify({
				type: "run_aborted",
				reason: "log write failed",
				runId: spec.runId,
				parentSessionId: spec.parentSessionId,
				timestamp: new Date().toISOString(),
			} satisfies Extract<DriverEvent, { type: "run_aborted" }>)}\n`,
			"utf-8",
		);
	} catch {
		return;
	}
}

function toDriverResult(spec: DriverRunSpec, state: LoopState): DriverResult {
	const base = {
		runId: spec.runId,
		tasksDone: state.done,
		tasksBlocked: state.blocked,
	};

	if (state.outcome === "completed") {
		return {
			...base,
			outcome: "completed",
			...(state.blockedTaskId ? { blockedTaskId: state.blockedTaskId } : {}),
			...(state.blockedReason ? { blockedReason: state.blockedReason } : {}),
			...(state.stateCommitSha ? { stateCommitSha: state.stateCommitSha } : {}),
			...(state.planCompletionCandidate
				? { planCompletionCandidate: state.planCompletionCandidate }
				: {}),
		};
	}

	if (state.outcome === "finalization_failed") {
		if (!state.finalization) {
			throw new Error("Missing finalization failure details");
		}
		return {
			...base,
			outcome: "finalization_failed",
			...state.finalization,
		};
	}

	return {
		...base,
		outcome: state.outcome,
		...(state.blockedTaskId ? { blockedTaskId: state.blockedTaskId } : {}),
		...(state.blockedReason ? { blockedReason: state.blockedReason } : {}),
	};
}
