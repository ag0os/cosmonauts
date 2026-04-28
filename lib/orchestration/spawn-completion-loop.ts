import type { SpawnCompletedEvent, SpawnFailedEvent } from "./message-bus.ts";
import type { SpawnTracker } from "./spawn-tracker.ts";

/** Default per-spawn completion wait timeout (5 minutes). */
export const DEFAULT_SPAWN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Format a child completion result as a user message for the parent session.
 * The parent agent uses these messages to track child outcomes.
 */
export function formatSpawnCompletionMessage(
	spawnId: string,
	role: string,
	outcome: "success" | "failed",
	summary: string,
	fullText?: string,
): string {
	const base = `[spawn_completion] spawnId=${spawnId} role=${role} outcome=${outcome} summary=${summary}`;
	const details = fullText?.trim();
	if (!details || details === summary) return base;
	return `${base}\n\n${details}`;
}

/**
 * Wait for the next child spawn completion, with a per-spawn timeout.
 *
 * Returns formatted completion messages. Normally this is one entry, but a
 * timeout can fail several running children at once.
 */
export async function awaitNextCompletionMessages(
	tracker: SpawnTracker,
	timeoutMs = DEFAULT_SPAWN_TIMEOUT_MS,
): Promise<string[]> {
	type Result =
		| { kind: "event"; event: SpawnCompletedEvent | SpawnFailedEvent }
		| { kind: "timeout" };

	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
		timeoutHandle = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
	});

	const result: Result = await Promise.race([
		tracker
			.nextCompletion()
			.then((event) => ({ kind: "event" as const, event })),
		timeoutPromise,
	]);

	clearTimeout(timeoutHandle);

	if (result.kind === "event") {
		const { event } = result;
		const role = tracker.spawnRole(event.spawnId) ?? "unknown";
		const outcome: "success" | "failed" =
			event.type === "spawn_completed" ? "success" : "failed";
		const summary =
			event.type === "spawn_completed"
				? (event.summary ?? `Completed in ${event.durationMs}ms`)
				: event.error;
		const fullText =
			event.type === "spawn_completed" ? event.fullText : undefined;
		return [
			formatSpawnCompletionMessage(
				event.spawnId,
				role,
				outcome,
				summary,
				fullText,
			),
		];
	}

	const running = tracker.runningSpawns();
	if (running.length === 0) return [];

	return running.map(({ spawnId, role }) => {
		tracker.fail(spawnId, `Timed out after ${timeoutMs}ms`);
		return formatSpawnCompletionMessage(
			spawnId,
			role,
			"failed",
			`Timed out after ${timeoutMs}ms`,
		);
	});
}
