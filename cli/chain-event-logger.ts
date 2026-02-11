/**
 * Chain event logger — formats ChainEvent objects for terminal output.
 * Events are written to stderr so stdout remains clean for final output.
 */

import type { ChainEvent, ChainStage } from "../lib/orchestration/types.ts";

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0
		? `${minutes}m ${remainingSeconds}s`
		: `${minutes}m`;
}

/**
 * Format a chain stage list as a readable pipeline string.
 */
function formatPipeline(stages: ChainStage[]): string {
	return stages.map((s) => s.name).join(" -> ");
}

/**
 * Format a ChainEvent into a terminal-friendly log line.
 */
export function formatChainEvent(event: ChainEvent): string {
	switch (event.type) {
		case "chain_start":
			return `[chain] Starting: ${formatPipeline(event.stages)}`;
		case "chain_end": {
			const status = event.result.success ? "Complete" : "Failed";
			const duration = formatDuration(event.result.totalDurationMs);
			return `[chain] ${status} (${duration})`;
		}
		case "stage_start":
			return `[${event.stage.name}] Starting...`;
		case "stage_end": {
			const status = event.result.success ? "Completed" : "Failed";
			const duration = formatDuration(event.result.durationMs);
			const error = event.result.error ? ` — ${event.result.error}` : "";
			return `[${event.stage.name}] ${status} (${duration})${error}`;
		}
		case "stage_iteration":
			return `[${event.stage.name}] Starting iteration ${event.iteration}...`;
		case "agent_spawned":
			return `[${event.role}] Spawned worker (${event.sessionId})`;
		case "agent_completed":
			return `[${event.role}] Agent completed (${event.sessionId})`;
		case "error": {
			const stage = event.stage ? `[${event.stage.name}] ` : "";
			return `${stage}Error: ${event.message}`;
		}
	}
}

/**
 * Create an onEvent callback that logs formatted events to stderr.
 */
export function createChainEventLogger(): (event: ChainEvent) => void {
	return (event: ChainEvent) => {
		const line = formatChainEvent(event);
		process.stderr.write(`${line}\n`);
	};
}
