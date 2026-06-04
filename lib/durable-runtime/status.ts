import type { OrchestrationEvent, RunStatus } from "./types.ts";

export function statusFromEvent(
	event: OrchestrationEvent,
): RunStatus | undefined {
	switch (event.type) {
		case "run_completed":
			return "completed";
		case "run_blocked":
			return "blocked";
		case "run_failed":
			return "failed";
		case "run_cancelled":
			return "cancelled";
		case "run_stale":
			return "stale";
		case "run_started":
			return "running";
		default:
			return undefined;
	}
}

export function isTerminalStatus(status: RunStatus): boolean {
	return (
		status === "completed" ||
		status === "blocked" ||
		status === "failed" ||
		status === "cancelled" ||
		status === "stale"
	);
}
