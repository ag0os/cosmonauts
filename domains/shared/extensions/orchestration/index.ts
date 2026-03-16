import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { unqualifyRole } from "../../../../lib/agents/qualified-role.ts";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import type { AgentDefinition } from "../../../../lib/agents/types.ts";
import { createPiSpawner } from "../../../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../../../lib/orchestration/chain-parser.ts";
import {
	injectUserPrompt,
	runChain,
} from "../../../../lib/orchestration/chain-runner.ts";
import type {
	ChainEvent,
	ChainResult,
	ChainStats,
} from "../../../../lib/orchestration/types.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";

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
};

function roleLabel(role: string): string {
	return ROLE_LABELS[unqualifyRole(role)] ?? role;
}

/**
 * Check if a target agent is in the caller's subagents allowlist.
 * Handles both qualified (domain/id) and unqualified ID formats.
 */
function isSubagentAllowed(
	callerDef: AgentDefinition,
	targetDef: AgentDefinition,
): boolean {
	const allowed = callerDef.subagents ?? [];
	// Check unqualified match
	if (allowed.includes(targetDef.id)) return true;
	// Check qualified match
	if (
		targetDef.domain &&
		allowed.includes(`${targetDef.domain}/${targetDef.id}`)
	)
		return true;
	return false;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

/** Build a progress line from a chain event for onUpdate streaming. */
function chainEventToProgressLine(event: ChainEvent): string | undefined {
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
function buildProgressText(lines: string[]): string {
	return lines.join("\n");
}

/** Build a cost summary table from ChainStats. Returns empty string if stats unavailable. */
function buildCostTable(
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

function renderTextFallback(
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

// ============================================================================
// Chain Details Type
// ============================================================================

interface ChainProgressDetails {
	/** Accumulated progress lines */
	lines: string[];
	/** Final chain result (only present when done) */
	result?: ChainResult;
}

// ============================================================================
// Spawn Details Type
// ============================================================================

interface SpawnProgressDetails {
	role: string;
	status: "spawning" | "completed" | "failed" | "denied";
	error?: string;
	taskId?: string;
}

// ============================================================================
// Extension
// ============================================================================

export default function orchestrationExtension(pi: ExtensionAPI) {
	const runtimeCache = new Map<string, Promise<CosmonautsRuntime>>();
	const domainsDir = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		"..",
		"domains",
	);

	function getRuntime(cwd: string): Promise<CosmonautsRuntime> {
		let promise = runtimeCache.get(cwd);
		if (!promise) {
			promise = CosmonautsRuntime.create({
				domainsDir,
				projectRoot: cwd,
			}).catch((error: unknown) => {
				runtimeCache.delete(cwd);
				throw error;
			});
			runtimeCache.set(cwd, promise);
		}
		return promise;
	}

	// chain_run
	pi.registerTool({
		name: "chain_run",
		label: "Run Chain",
		description:
			'Run a chain of agent stages using the chain DSL (e.g. "planner -> task-manager -> coordinator -> quality-manager")',
		parameters: Type.Object({
			expression: Type.String({
				description:
					'Chain DSL expression (e.g. "planner -> task-manager -> coordinator -> quality-manager")',
			}),
			prompt: Type.Optional(
				Type.String({
					description:
						"Optional user objective to inject into the first chain stage",
				}),
			),
			completionLabel: Type.Optional(
				Type.String({
					description:
						"Optional task label scope for completion checks (e.g. plan:my-plan)",
				}),
			),
			thinkingLevel: Type.Optional(
				Type.Union(
					[
						Type.Literal("off"),
						Type.Literal("minimal"),
						Type.Literal("low"),
						Type.Literal("medium"),
						Type.Literal("high"),
						Type.Literal("xhigh"),
					],
					{
						description:
							"Chain-wide default thinking/reasoning level (off, minimal, low, medium, high, xhigh). Applied to all stages unless overridden by agent definitions.",
					},
				),
			),
		}),
		execute: async (_toolCallId, params, _signal, onUpdate, ctx) => {
			const runtime = await getRuntime(ctx.cwd);
			const stages = parseChain(
				params.expression,
				runtime.agentRegistry,
				runtime.domainContext,
			);
			injectUserPrompt(stages, params.prompt);
			const thinking = params.thinkingLevel
				? { default: params.thinkingLevel }
				: undefined;

			const progressLines: string[] = [];

			const result = await runChain({
				stages,
				projectRoot: ctx.cwd,
				projectSkills: runtime.projectSkills,
				skillPaths: [...runtime.skillPaths],
				domainContext: runtime.domainContext,
				completionLabel: params.completionLabel,
				thinking,
				registry: runtime.agentRegistry,
				onEvent: (event: ChainEvent) => {
					const line = chainEventToProgressLine(event);
					if (line) {
						progressLines.push(line);
						onUpdate?.({
							content: [
								{
									type: "text" as const,
									text: buildProgressText(progressLines),
								},
							],
							details: { lines: progressLines } as ChainProgressDetails,
						});
					}
				},
			});

			const stagesSummary = result.stageResults
				.map(
					(s) =>
						`${s.stage.name}: ${s.success ? "ok" : "FAILED"}${s.error ? ` (${s.error})` : ""}`,
				)
				.join(", ");

			// Add final summary line
			const finalLine = result.success
				? `✓ Chain completed (${formatDuration(result.totalDurationMs)})`
				: `✗ Chain failed (${formatDuration(result.totalDurationMs)})`;
			progressLines.push(finalLine);

			return {
				content: [
					{
						type: "text" as const,
						text: `Chain ${result.success ? "completed" : "failed"} (${result.totalDurationMs}ms) — ${stagesSummary}`,
					},
				],
				details: {
					lines: progressLines,
					result,
				} as ChainProgressDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("chain_run "));
			text += theme.fg("muted", args.expression);
			if (args.prompt) {
				const truncated =
					args.prompt.length > 80
						? `${args.prompt.slice(0, 77)}...`
						: args.prompt;
				text += `\n${theme.fg("dim", `  prompt: "${truncated}"`)}`;
			}
			if (args.completionLabel) {
				text += theme.fg("dim", ` [${args.completionLabel}]`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			const details = result.details as ChainProgressDetails | null;
			if (!details?.lines?.length) {
				if (isPartial) {
					return new Text(theme.fg("warning", "⏳ Starting chain..."), 0, 0);
				}
				return renderTextFallback(result, theme);
			}

			const lines = details.lines;
			let rendered = lines
				.map((line) => {
					if (line.startsWith("✗")) return theme.fg("error", line);
					if (line.startsWith("✓")) return theme.fg("success", line);
					if (line.startsWith("●")) return theme.fg("accent", line);
					if (line.startsWith("▶")) return theme.fg("toolTitle", line);
					return theme.fg("dim", line);
				})
				.join("\n");

			// Append cost summary table when chain is complete and stats are available
			if (!isPartial && details.result?.stats) {
				const costTable = buildCostTable(details.result.stats, theme);
				if (costTable) {
					rendered += `\n${costTable}`;
				}
			}

			return new Text(rendered, 0, 0);
		},
	});

	// spawn_agent
	pi.registerTool({
		name: "spawn_agent",
		label: "Spawn Agent",
		description: "Spawn a single agent session with a given role and prompt",
		parameters: Type.Object({
			role: Type.String({
				description:
					"Agent role (planner, task-manager, coordinator, worker, quality-manager, reviewer, fixer)",
			}),
			prompt: Type.String({ description: "The prompt to send to the agent" }),
			model: Type.Optional(Type.String({ description: "Model override" })),
			thinkingLevel: Type.Optional(
				Type.Union(
					[
						Type.Literal("off"),
						Type.Literal("minimal"),
						Type.Literal("low"),
						Type.Literal("medium"),
						Type.Literal("high"),
						Type.Literal("xhigh"),
					],
					{
						description:
							"Thinking/reasoning level override (off, minimal, low, medium, high, xhigh)",
					},
				),
			),
			runtimeContext: Type.Optional(
				Type.Object({
					mode: Type.Union([
						Type.Literal("top-level"),
						Type.Literal("sub-agent"),
					]),
					parentRole: Type.Optional(
						Type.String({ description: "Parent agent role" }),
					),
					objective: Type.Optional(
						Type.String({
							description: "High-level objective for this spawn",
						}),
					),
					taskId: Type.Optional(
						Type.String({ description: "Task ID being worked on" }),
					),
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, onUpdate, ctx) => {
			const runtime = await getRuntime(ctx.cwd);
			const systemPrompt = ctx.getSystemPrompt();
			const callerRole = extractAgentIdFromSystemPrompt(systemPrompt);
			if (!callerRole) {
				return {
					content: [
						{
							type: "text" as const,
							text: "spawn_agent denied: caller role could not be resolved from runtime identity marker",
						},
					],
					details: {
						role: params.role,
						status: "denied",
						error: "caller role unresolved",
					} as SpawnProgressDetails,
				};
			}

			const callerDef = runtime.agentRegistry.get(
				callerRole,
				runtime.domainContext,
			);
			if (!callerDef) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: unknown caller role "${callerRole}"`,
						},
					],
					details: {
						role: params.role,
						status: "denied",
						error: `unknown caller "${callerRole}"`,
					} as SpawnProgressDetails,
				};
			}

			const targetDef = runtime.agentRegistry.get(
				params.role,
				runtime.domainContext,
			);
			if (!targetDef) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: unknown target role "${params.role}"`,
						},
					],
					details: {
						role: params.role,
						status: "denied",
						error: `unknown target "${params.role}"`,
					} as SpawnProgressDetails,
				};
			}

			if (!isSubagentAllowed(callerDef, targetDef)) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: ${callerDef.id} cannot spawn ${targetDef.id}`,
						},
					],
					details: {
						role: params.role,
						status: "denied",
						error: `${callerDef.id} cannot spawn ${targetDef.id}`,
					} as SpawnProgressDetails,
				};
			}

			// Stream "spawning" status
			const taskId = params.runtimeContext?.taskId;
			const spawnLabel = taskId
				? `${roleLabel(params.role)} (${taskId})`
				: roleLabel(params.role);

			onUpdate?.({
				content: [
					{
						type: "text" as const,
						text: `⬆ Spawning ${spawnLabel}...`,
					},
				],
				details: {
					role: params.role,
					status: "spawning",
					taskId,
				} as SpawnProgressDetails,
			});

			const spawner = createPiSpawner(
				runtime.agentRegistry,
				runtime.domainsDir,
			);
			try {
				const result = await spawner.spawn({
					role: params.role,
					domainContext: runtime.domainContext,
					cwd: ctx.cwd,
					prompt: params.prompt,
					model: params.model,
					thinkingLevel: params.thinkingLevel,
					runtimeContext: params.runtimeContext,
					projectSkills: runtime.projectSkills,
					skillPaths: [...runtime.skillPaths],
				});
				return {
					content: [
						{
							type: "text" as const,
							text: `Agent ${params.role} ${result.success ? "completed" : "failed"}${result.error ? `: ${result.error}` : ""}`,
						},
					],
					details: {
						role: params.role,
						status: result.success ? "completed" : "failed",
						error: result.error,
						taskId,
					} as SpawnProgressDetails,
				};
			} finally {
				spawner.dispose();
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("spawn_agent "));
			text += theme.fg("muted", roleLabel(args.role));
			if (args.runtimeContext?.taskId) {
				text += theme.fg("dim", ` (${args.runtimeContext.taskId})`);
			}
			const truncated =
				args.prompt.length > 100
					? `${args.prompt.slice(0, 97)}...`
					: args.prompt;
			text += `\n${theme.fg("dim", `  ${truncated}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as SpawnProgressDetails | null;
			if (!details) return renderTextFallback(result, theme);

			switch (details.status) {
				case "spawning": {
					const label = details.taskId
						? `${roleLabel(details.role)} (${details.taskId})`
						: roleLabel(details.role);
					return new Text(theme.fg("warning", `⬆ Spawning ${label}...`), 0, 0);
				}
				case "completed":
					return new Text(
						theme.fg("success", `✓ ${roleLabel(details.role)} completed`),
						0,
						0,
					);
				case "failed":
					return new Text(
						theme.fg(
							"error",
							`✗ ${roleLabel(details.role)} failed${details.error ? `: ${details.error}` : ""}`,
						),
						0,
						0,
					);
				case "denied":
					return new Text(
						theme.fg(
							"error",
							`⊘ ${roleLabel(details.role)} denied${details.error ? `: ${details.error}` : ""}`,
						),
						0,
						0,
					);
				default:
					return renderTextFallback(result, theme);
			}
		},
	});
}
