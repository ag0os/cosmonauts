import {
	commitDriveFinalState,
	type StateCommitCtx,
	type StateCommitResult,
	skipDriveStateCommit,
} from "./drive-finalization.ts";
import type { DriverRunSpec } from "./types.ts";

export type { StateCommitCtx, StateCommitResult };

export function skipStateCommit(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	reason: "policy_none" | "not_all_tasks_done",
): Promise<StateCommitResult> {
	return skipDriveStateCommit(spec, ctx, reason);
}

export function commitFinalState(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	taskIds: readonly string[],
): Promise<StateCommitResult> {
	return commitDriveFinalState(spec, ctx, taskIds);
}
