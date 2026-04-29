/**
 * Chain event logger — formats ChainEvent objects for terminal output.
 * Events are written to stderr so stdout remains clean for final output.
 */

import { formatChainSteps } from "../lib/orchestration/chain-steps.ts";
import { formatDuration } from "../lib/orchestration/duration.ts";
import type { ChainEvent } from "../lib/orchestration/types.ts";

export { formatDuration } from "../lib/orchestration/duration.ts";

/**
 * Format a ChainEvent into a terminal-friendly log line.
 */
type ChainEventFormatter<K extends ChainEvent["type"]> = (
	event: Extract<ChainEvent, { type: K }>,
) => string;

const CHAIN_EVENT_FORMATTERS: {
	[K in ChainEvent["type"]]: ChainEventFormatter<K>;
} = {
	chain_start: (event) => `[chain] Starting: ${formatChainSteps(event.steps)}`,
	chain_end: (event) => {
		const status = event.result.success ? "Complete" : "Failed";
		const duration = formatDuration(event.result.totalDurationMs);
		return `[chain] ${status} (${duration})`;
	},
	stage_start: (event) => `[${event.stage.name}] Starting...`,
	stage_end: (event) => {
		const status = event.result.success ? "Completed" : "Failed";
		const duration = formatDuration(event.result.durationMs);
		const error = event.result.error ? ` — ${event.result.error}` : "";
		return `[${event.stage.name}] ${status} (${duration})${error}`;
	},
	stage_stats: (event) => {
		const cost = event.stats.cost.toFixed(4);
		const tokens = event.stats.tokens.total;
		return `[${event.stage.name}] Stats: $${cost}, ${tokens} tokens`;
	},
	stage_iteration: (event) =>
		`[${event.stage.name}] Starting iteration ${event.iteration}...`,
	parallel_start: (event) => {
		const groupLabel = formatChainSteps([event.step]);
		return `[chain] Parallel ${groupLabel} starting...`;
	},
	parallel_end: (event) => {
		const groupLabel = formatChainSteps([event.step]);
		const status = event.success ? "Completed" : "Failed";
		const error = event.error ? ` — ${event.error}` : "";
		return `[chain] Parallel ${groupLabel} ${status}${error}`;
	},
	agent_spawned: (event) =>
		`[${event.role}] Spawned worker (${event.sessionId})`,
	agent_completed: (event) =>
		`[${event.role}] Agent completed (${event.sessionId})`,
	agent_turn: (event) => `[${event.role}] Turn event: ${event.event.type}`,
	agent_tool_use: (event) =>
		`[${event.role}] Tool event: ${event.event.type}${formatToolName(event.event)}`,
	error: (event) => {
		const stage = event.stage ? `[${event.stage.name}] ` : "";
		return `${stage}Error: ${event.message}`;
	},
	spawn_completion: (event) => {
		const status = event.outcome === "success" ? "Completed" : "Failed";
		return `[${event.role}] Spawn ${event.spawnId} ${status}: ${event.summary}`;
	},
};

function formatToolName(
	event: Extract<ChainEvent, { type: "agent_tool_use" }>["event"],
): string {
	return event.type === "tool_execution_start" ||
		event.type === "tool_execution_end"
		? ` (${event.toolName})`
		: "";
}

function formatTypedChainEvent<K extends ChainEvent["type"]>(
	event: Extract<ChainEvent, { type: K }>,
): string {
	return CHAIN_EVENT_FORMATTERS[event.type](event);
}

export function formatChainEvent(event: ChainEvent): string {
	return formatTypedChainEvent(event);
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
