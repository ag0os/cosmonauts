/**
 * POSIX process-group primitives shared by every place that spawns a child it
 * must be able to reap along with the child's own descendants.
 *
 * Both consumers spawn `detached` so the child leads its own group, which makes
 * the negated pid a safe address: it names a group this code created rather than
 * one the signalling process happens to belong to. Never negate a pid that was
 * not spawned detached here.
 */

/** True while any member of the group is still alive. */
export function processGroupExists(processGroupId: number): boolean {
	try {
		process.kill(-processGroupId, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

/**
 * Signals every member of the group. An already-gone group is success, not a
 * failure — the caller's goal is that nothing survives, and nothing does.
 * Any other error is returned so the caller can surface it rather than treating
 * an unreaped tree as clean.
 */
export function signalPosixProcessGroup(
	processGroupId: number,
	signal: NodeJS.Signals,
): Error | undefined {
	try {
		process.kill(-processGroupId, signal);
		return undefined;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") {
			return undefined;
		}
		return error instanceof Error ? error : new Error(String(error));
	}
}
