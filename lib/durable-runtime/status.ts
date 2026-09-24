import type { OrchestrationEvent, RunStatus, StepStatus } from "./types.ts";

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
		case "run_activity": {
			const details = event.details;
			if (typeof details !== "object" || details === null) return undefined;
			const activity = details as Record<string, unknown>;
			if (
				activity.source !== "quality-review" ||
				!["finalized", "retained"].includes(String(activity.phase))
			)
				return undefined;
			return ["completed", "blocked", "failed", "cancelled"].includes(
				String(activity.status),
			)
				? (activity.status as RunStatus)
				: undefined;
		}
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

export function isTerminalStepStatus(status: StepStatus): boolean {
	return (
		status === "completed" ||
		status === "blocked" ||
		status === "failed" ||
		status === "cancelled" ||
		status === "stale"
	);
}
