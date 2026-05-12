import { appendFileSync } from "node:fs";
import { EventLogWriteError } from "./event-stream.ts";
import { type RunOneTaskCtx, runOneTask } from "./run-one-task.ts";
import type { DriverEvent, DriverResult, DriverRunSpec } from "./types.ts";

export interface RunRunLoopCtx extends RunOneTaskCtx {
	mode?: "inline" | "detached";
}

interface LoopState {
	done: number;
	blocked: number;
	outcome: DriverResult["outcome"];
	blockedTaskId?: string;
	blockedReason?: string;
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
			await emit(spec, ctx, {
				type: "run_completed",
				summary: {
					total: spec.taskIds.length,
					done: state.done,
					blocked: state.blocked,
				},
			});
		}

		return toDriverResult(spec, state);
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
	const result: DriverResult = {
		runId: spec.runId,
		outcome: state.outcome,
		tasksDone: state.done,
		tasksBlocked: state.blocked,
	};

	if (state.blockedTaskId) {
		result.blockedTaskId = state.blockedTaskId;
	}
	if (state.blockedReason) {
		result.blockedReason = state.blockedReason;
	}

	return result;
}
