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

export const DEFAULT_REAP_TERM_GRACE_MS = 2_000;
export const DEFAULT_REAP_KILL_GRACE_MS = 1_000;
const REAP_POLL_MS = 25;

export interface ReapProcessGroupOptions {
	readonly termGraceMs?: number;
	readonly killGraceMs?: number;
}

export type ReapProcessGroupOutcome =
	/** Nothing was left to reap: the tree had already exited on its own. */
	| { readonly kind: "already-exited" }
	/** Survivors existed and are now gone. `signal` is the one that ended them. */
	| { readonly kind: "reaped"; readonly signal: NodeJS.Signals }
	/** Escalation completed and something is still alive, or signalling failed. */
	| { readonly kind: "survived"; readonly reason: string };

/**
 * Terminates every survivor in a process group on a bounded deadline: SIGTERM,
 * a grace period, then SIGKILL.
 *
 * Bounded by construction (INV-3) — it never waits on a tree that will not die,
 * and reports `survived` instead so the caller can surface it (INV-2) rather
 * than presenting a leak as a clean result. `processGroupId` must be a pid this
 * code spawned `detached`, so the negated address names a group we lead and
 * never one we merely belong to (INV-4).
 */
export async function reapProcessGroup(
	processGroupId: number,
	options: ReapProcessGroupOptions = {},
): Promise<ReapProcessGroupOutcome> {
	if (!processGroupExists(processGroupId)) {
		return { kind: "already-exited" };
	}

	const escalation: readonly {
		signal: NodeJS.Signals;
		graceMs: number;
	}[] = [
		{
			signal: "SIGTERM",
			graceMs: boundedGrace(options.termGraceMs, DEFAULT_REAP_TERM_GRACE_MS),
		},
		{
			signal: "SIGKILL",
			graceMs: boundedGrace(options.killGraceMs, DEFAULT_REAP_KILL_GRACE_MS),
		},
	];

	for (const { signal, graceMs } of escalation) {
		const error = signalPosixProcessGroup(processGroupId, signal);
		if (error) {
			return {
				kind: "survived",
				reason: `failed to send ${signal} to process group ${processGroupId}: ${error.message}`,
			};
		}
		if (await waitForGroupExit(processGroupId, graceMs)) {
			return { kind: "reaped", signal };
		}
	}

	return {
		kind: "survived",
		reason: `process group ${processGroupId} still had live members after SIGTERM and SIGKILL`,
	};
}

/**
 * Keeps "bounded by construction" literally true. `NaN` or `Infinity` would make
 * the deadline comparison never hold, turning the escalation loop into the
 * unbounded wait this helper exists to prevent.
 */
function boundedGrace(graceMs: number | undefined, fallbackMs: number): number {
	if (graceMs === undefined || !Number.isFinite(graceMs) || graceMs < 0) {
		return fallbackMs;
	}
	return graceMs;
}

async function waitForGroupExit(
	processGroupId: number,
	graceMs: number,
): Promise<boolean> {
	const deadline = Date.now() + graceMs;
	while (true) {
		if (!processGroupExists(processGroupId)) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((settle) => setTimeout(settle, REAP_POLL_MS));
	}
}
