/** Task-specific callers for the shared entity-file lock protocol. */

import { join } from "node:path";
import { withEntityFileLock } from "../entity-file-lock.ts";

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
): Promise<T> {
	return withEntityFileLock(getTaskCreateLockPath(projectRoot), fn);
}
