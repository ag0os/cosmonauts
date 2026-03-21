import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { parseChain } from "../../../../lib/orchestration/chain-parser.ts";
import {
	injectUserPrompt,
	runChain,
} from "../../../../lib/orchestration/chain-runner.ts";
import type {
	ChainEvent,
	ChainResult,
} from "../../../../lib/orchestration/types.ts";
import type { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import {
	buildCostTable,
	buildProgressText,
	chainEventToProgressLine,
	formatDuration,
	renderTextFallback,
} from "./rendering.ts";

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
// Tool Registration
// ============================================================================

export function registerChainTool(
	pi: ExtensionAPI,
	getRuntime: (cwd: string) => Promise<CosmonautsRuntime>,
): void {
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
}
