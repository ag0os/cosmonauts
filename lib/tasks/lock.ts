/** Task-specific callers for the shared entity-file lock protocol. */

import { join } from "node:path";
import type { EntityFileLockOptions } from "../entity-file-lock.ts";
import { withEntityFileLock } from "../entity-file-lock.ts";

/**
 * Task-id allocation must never wait forever. A lock whose owning PID is alive
 * but which nobody will release (a stranded release, or a reclamation race) is
 * not reclaimable by PID liveness, so an unbounded wait would hang task
 * creation for the life of that process. Failing loudly beats hanging, and
 * running unlocked is not an option here — it would duplicate task ids.
 */
export const TASK_CREATE_LOCK_WAIT_TIMEOUT_MS = 10_000;

export type { EntityFileLockOptions } from "../entity-file-lock.ts";
export {
	EntityFileLockTimeoutError,
	withEntityFileLock,
} from "../entity-file-lock.ts";

/**
 * Path to the task-create lock file. Lives under `.cosmonauts/` (alongside
 * `driver-commit.lock`) — never under `missions/tasks/`, which is scanned for
 * task files.
 */
export function getTaskCreateLockPath(projectRoot: string): string {
	return join(projectRoot, ".cosmonauts", "task-create.lock");
}

/**
 * Run `fn` while holding the task-create lock. Kept as the compatibility entry
 * point for task ID allocation.
 */
export async function withTaskCreateLock<T>(
	projectRoot: string,
	fn: () => Promise<T>,
	options: EntityFileLockOptions = {},
): Promise<T> {
	return withEntityFileLock(getTaskCreateLockPath(projectRoot), fn, {
		waitTimeoutMs: TASK_CREATE_LOCK_WAIT_TIMEOUT_MS,
		...options,
	});
}
