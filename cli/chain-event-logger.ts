/**
 * Chain event logger — formats ChainEvent objects for terminal output.
 * Events are written to stderr so stdout remains clean for final output.
 */

import { formatChainSteps } from "../lib/orchestration/chain-steps.ts";
import type { ChainEvent } from "../lib/orchestration/types.ts";

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
 * Format a ChainEvent into a terminal-friendly log line.
 */
// Temporary migration debt: event formatting switch stays local until renderer extraction.
// fallow-ignore-next-line complexity
export function formatChainEvent(event: ChainEvent): string {
	switch (event.type) {
		case "chain_start":
			return `[chain] Starting: ${formatChainSteps(event.steps)}`;
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
		case "stage_stats": {
			const cost = event.stats.cost.toFixed(4);
			const tokens = event.stats.tokens.total;
			return `[${event.stage.name}] Stats: $${cost}, ${tokens} tokens`;
		}
		case "stage_iteration":
			return `[${event.stage.name}] Starting iteration ${event.iteration}...`;
		case "agent_spawned":
			return `[${event.role}] Spawned worker (${event.sessionId})`;
		case "agent_completed":
			return `[${event.role}] Agent completed (${event.sessionId})`;
		case "agent_turn":
			return `[${event.role}] Turn event: ${event.event.type}`;
		case "agent_tool_use":
			return `[${event.role}] Tool event: ${event.event.type}${event.event.type === "tool_execution_start" || event.event.type === "tool_execution_end" ? ` (${event.event.toolName})` : ""}`;
		case "error": {
			const stage = event.stage ? `[${event.stage.name}] ` : "";
			return `${stage}Error: ${event.message}`;
		}
		case "parallel_start": {
			const groupLabel = formatChainSteps([event.step]);
			return `[chain] Parallel ${groupLabel} starting...`;
		}
		case "parallel_end": {
			const groupLabel = formatChainSteps([event.step]);
			const status = event.success ? "Completed" : "Failed";
			const error = event.error ? ` — ${event.error}` : "";
			return `[chain] Parallel ${groupLabel} ${status}${error}`;
		}
		case "spawn_completion": {
			const status = event.outcome === "success" ? "Completed" : "Failed";
			return `[${event.role}] Spawn ${event.spawnId} ${status}: ${event.summary}`;
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
