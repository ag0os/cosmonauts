import { Text } from "@mariozechner/pi-tui";
import { unqualifyRole } from "../../../../lib/agents/qualified-role.ts";
import type {
	ChainEvent,
	ChainStats,
} from "../../../../lib/orchestration/types.ts";

// ============================================================================
// Rendering Helpers
// ============================================================================

export const ROLE_LABELS: Record<string, string> = {
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

/** Build a progress line from a chain event for onUpdate streaming. */
export function chainEventToProgressLine(
	event: ChainEvent,
): string | undefined {
	switch (event.type) {
		case "chain_start":
			return `▶ Chain started: ${event.stages.map((s) => roleLabel(s.name)).join(" → ")}`;
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
		fg: (color: "accent" | "dim" | "toolOutput", text: string) => string;
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
			"dim",
			` ${pad(header.name, w.name)} │ ${padR(header.tokens, w.tokens)} │ ${padR(header.cost, w.cost)} │ ${padR(header.duration, w.duration)} `,
		),
	);
	lines.push(theme.fg("dim", `─${sep}─`));
	for (const row of rows) {
		lines.push(
			theme.fg(
				"dim",
				` ${pad(row.name, w.name)} │ ${padR(row.tokens, w.tokens)} │ ${padR(row.cost, w.cost)} │ ${padR(row.duration, w.duration)} `,
			),
		);
	}
	lines.push(theme.fg("dim", `─${sep}─`));
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
