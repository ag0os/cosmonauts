import {
	commitDriveFinalState,
	type StateCommitCtx,
	type StateCommitResult,
} from "./drive-finalization.ts";
import type { DriverRunSpec } from "./types.ts";

export function commitFinalState(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	taskIds: readonly string[],
): Promise<StateCommitResult> {
	return commitDriveFinalState(spec, ctx, taskIds);
}
