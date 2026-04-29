import { Text } from "@mariozechner/pi-tui";
import { unqualifyRole } from "../../../../lib/agents/qualified-role.ts";
import { formatChainSteps } from "../../../../lib/orchestration/chain-steps.ts";
import type {
	ChainEvent,
	ChainStats,
} from "../../../../lib/orchestration/types.ts";

// ============================================================================
// Rendering Helpers
// ============================================================================

const ROLE_LABELS: Record<string, string> = {
	planner: "Planner",
	"task-manager": "Task Manager",
	coordinator: "Coordinator",
	worker: "Worker",
	"quality-manager": "Quality Manager",
	reviewer: "Reviewer",
	fixer: "Fixer",
	explorer: "Explorer",
	verifier: "Verifier",
};

export function roleLabel(role: string): string {
	return ROLE_LABELS[unqualifyRole(role)] ?? role;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

/**
 * Produce a one-line summary of a tool call for progress display.
 * Extracts the most useful argument (file path, command, pattern) per tool.
 */
export function summarizeToolCall(toolName: string, args?: unknown): string {
	return TOOL_SUMMARY_FORMATTERS[toolName]?.(args) ?? toolName;
}

type ToolCallSummaryFormatter = (args?: unknown) => string;

const TOOL_SUMMARY_FORMATTERS: Record<string, ToolCallSummaryFormatter> = {
	read: (args) => summarizePathToolCall("read", args),
	write: (args) => summarizePathToolCall("write", args),
	edit: (args) => summarizePathToolCall("edit", args),
	bash: summarizeBashToolCall,
	grep: summarizeGrepToolCall,
	spawn_agent: summarizeSpawnAgentToolCall,
};

function summarizePathToolCall(toolName: string, args?: unknown): string {
	const filePath =
		getStringProperty(args, "file_path") ?? getStringProperty(args, "path");
	if (!filePath) {
		return toolName;
	}

	const base = filePath.split("/").pop() ?? filePath;
	return `${toolName} ${base}`;
}

function summarizeBashToolCall(args?: unknown): string {
	const cmd = getStringProperty(args, "command") ?? "";
	return cmd.length > 60 ? `bash ${cmd.slice(0, 57)}...` : `bash ${cmd}`;
}

function summarizeGrepToolCall(args?: unknown): string {
	const pattern = getStringProperty(args, "pattern") ?? "";
	return pattern.length > 50
		? `grep ${pattern.slice(0, 47)}...`
		: `grep ${pattern}`;
}

function summarizeSpawnAgentToolCall(args?: unknown): string {
	const role = getStringProperty(args, "role") ?? "";
	return role ? `spawn ${role}` : "spawn_agent";
}

function getStringProperty(
	value: unknown,
	property: string,
): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const candidate = (value as Record<string, unknown>)[property];
	return typeof candidate === "string" ? candidate : undefined;
}

/** Build a progress line from a chain event for onUpdate streaming. */
export function chainEventToProgressLine(
	event: ChainEvent,
): string | undefined {
	switch (event.type) {
		case "chain_start":
			return `▶ Chain started: ${formatChainSteps(event.steps)}`;
		case "stage_start":
			return `● Starting ${roleLabel(event.stage.name)}${event.stage.loop ? " (loop)" : ""}`;
		case "stage_iteration":
			return `  ↻ ${roleLabel(event.stage.name)} iteration ${event.iteration}`;
		case "agent_spawned":
			return `  ⬆ Spawned ${roleLabel(event.role)}`;
		case "agent_completed":
			return `  ✓ ${roleLabel(event.role)} completed`;
		case "stage_end":
			if (event.result.success) {
				return `● ${roleLabel(event.stage.name)} done (${formatDuration(event.result.durationMs)})`;
			}
			return `✗ ${roleLabel(event.stage.name)} failed: ${event.result.error ?? "unknown error"}`;
		case "error":
			return `✗ Error${event.stage ? ` in ${roleLabel(event.stage.name)}` : ""}: ${event.message}`;
		case "stage_stats":
			return `  💰 ${roleLabel(event.stage.name)}: $${event.stats.cost.toFixed(4)}, ${event.stats.tokens.total} tokens`;
		case "agent_tool_use":
			if (event.event.type === "tool_execution_start") {
				const summary = summarizeToolCall(
					event.event.toolName,
					event.event.args,
				);
				return `  🔧 ${roleLabel(event.role)}: ${summary}`;
			}
			return undefined;
		case "parallel_start":
			return `▶ Parallel ${formatChainSteps([event.step])} starting...`;
		case "parallel_end":
			if (event.success) {
				return `● Parallel ${formatChainSteps([event.step])} done`;
			}
			return `✗ Parallel ${formatChainSteps([event.step])} failed${event.error ? `: ${event.error}` : ""}`;
		case "chain_end":
			return undefined; // Final result handled by execute return
	}
}

/** Build a full summary from accumulated progress lines. */
export function buildProgressText(lines: string[]): string {
	return lines.join("\n");
}

/** Build a cost summary table from ChainStats. Returns empty string if stats unavailable. */
export function buildCostTable(
	stats: ChainStats | undefined,
	theme: {
		fg: (
			color: "accent" | "dim" | "muted" | "toolOutput",
			text: string,
		) => string;
		bold: (text: string) => string;
	},
): string {
	if (!stats?.stages?.length) return "";

	const header = {
		name: "Stage",
		tokens: "Tokens",
		cost: "Cost (USD)",
		duration: "Duration",
	};
	const rows = stats.stages.map((s) => ({
		name: roleLabel(s.stageName),
		tokens: s.stats.tokens.total.toLocaleString(),
		cost: `$${s.stats.cost.toFixed(4)}`,
		duration: formatDuration(s.stats.durationMs),
	}));
	const totals = {
		name: "Total",
		tokens: stats.totalTokens.toLocaleString(),
		cost: `$${stats.totalCost.toFixed(4)}`,
		duration: formatDuration(stats.totalDurationMs),
	};

	// Calculate column widths
	const all = [header, ...rows, totals];
	const w = {
		name: Math.max(...all.map((r) => r.name.length)),
		tokens: Math.max(...all.map((r) => r.tokens.length)),
		cost: Math.max(...all.map((r) => r.cost.length)),
		duration: Math.max(...all.map((r) => r.duration.length)),
	};

	const pad = (s: string, len: number) => s.padEnd(len);
	const padR = (s: string, len: number) => s.padStart(len);
	const sep = `${"─".repeat(w.name + 2)}┼${"─".repeat(w.tokens + 2)}┼${"─".repeat(w.cost + 2)}┼${"─".repeat(w.duration + 2)}`;

	const lines: string[] = [];
	lines.push("");
	lines.push(theme.fg("accent", "💰 Cost Summary"));
	lines.push(
		theme.fg(
			"muted",
			` ${pad(header.name, w.name)} │ ${padR(header.tokens, w.tokens)} │ ${padR(header.cost, w.cost)} │ ${padR(header.duration, w.duration)} `,
		),
	);
	lines.push(theme.fg("muted", `─${sep}─`));
	for (const row of rows) {
		lines.push(
			theme.fg(
				"muted",
				` ${pad(row.name, w.name)} │ ${padR(row.tokens, w.tokens)} │ ${padR(row.cost, w.cost)} │ ${padR(row.duration, w.duration)} `,
			),
		);
	}
	lines.push(theme.fg("muted", `─${sep}─`));
	lines.push(
		theme.fg(
			"toolOutput",
			` ${theme.bold(pad(totals.name, w.name))} │ ${padR(totals.tokens, w.tokens)} │ ${padR(totals.cost, w.cost)} │ ${padR(totals.duration, w.duration)} `,
		),
	);

	return lines.join("\n");
}

export function renderTextFallback(
	result: { content?: Array<{ type: string; text?: string }> },
	theme: { fg: (color: "toolOutput", text: string) => string },
): Text {
	const textItem = result.content?.find((item) => item.type === "text");
	const text = textItem?.text?.trim();
	return new Text(
		theme.fg("toolOutput", text && text.length > 0 ? text : "(no output)"),
		0,
		0,
	);
}
