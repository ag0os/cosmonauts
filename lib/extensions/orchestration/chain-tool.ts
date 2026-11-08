import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../agents/runtime-identity.ts";
import type { MemoryWarning } from "../../memory/types.ts";
import { runConfiguredChain } from "../../orchestration/chain-dispatch.ts";
import {
	normalizeChain,
	refuseNormalization,
} from "../../orchestration/chain-normalization.ts";
import { selectChain } from "../../orchestration/chain-selection.ts";
import { injectUserPrompt } from "../../orchestration/chain-steps.ts";
import type { ChainEvent, ChainResult } from "../../orchestration/types.ts";
import type { CosmonautsRuntime } from "../../runtime.ts";
import { authorizeAgentStart } from "./authorization.ts";
import {
	buildCostTable,
	buildProgressText,
	chainEventToProgressLine,
	formatDuration,
	renderTextFallback,
} from "./rendering.ts";
import { thinkingLevelSchema } from "./schema.ts";

// ============================================================================
// Chain Details Type
// ============================================================================

interface ChainProgressDetails {
	/** Accumulated progress lines */
	lines: string[];
	/** Durable run identity for graph-backed chains; undefined for inline chains. */
	run?: ChainResult["run"];
	/** Final chain result (only present when done) */
	result?: ChainResult;
}

// ============================================================================
// Result Text
// ============================================================================

/**
 * Build the text the calling agent sees when the chain finishes — a header plus
 * one line per stage carrying its outcome and a condensed summary of the stage
 * agent's final message. This is what ran, not the work product itself.
 */
function buildChainResultText(
	result: ChainResult,
	episodeWarnings: readonly string[],
): string {
	const header = `Chain ${result.success ? "completed" : "failed"} (${formatDuration(result.totalDurationMs)}) · ${result.stageResults.length} stage${result.stageResults.length === 1 ? "" : "s"}`;

	const stageLines = result.stageResults.map((s) => {
		const status = s.success ? "ok" : "FAILED";
		const notes = s.success
			? [s.summary]
			: [s.error, s.summary === s.error ? undefined : s.summary];
		const note = notes
			.filter((value): value is string => Boolean(value))
			.join(" — ");
		return `- ${s.stage.name}: ${status}${note ? ` — ${note}` : ""}`;
	});

	return [
		header,
		...stageLines,
		"",
		"Stage lines are the agents' final messages, not the changes — check task_list and git log for the actual state.",
		...(episodeWarnings.length > 0 ? ["", ...episodeWarnings] : []),
	].join("\n");
}

function formatEpisodeWarning(warning: MemoryWarning): string {
	const location = warning.path ? `${warning.path}: ` : "";
	return `Non-fatal episode warning: ${location}${warning.message}`;
}

function chainDenial(
	steps: import("../../orchestration/types.ts").ChainStep[],
	callerRole: string,
	runtime: CosmonautsRuntime,
): string | undefined {
	for (const step of steps) {
		const stages = "kind" in step ? step.stages : [step];
		for (const stage of stages) {
			const denial = authorizeAgentStart({
				registry: runtime.agentRegistry,
				domainContext: runtime.domainContext,
				callerRole,
				targetRole: stage.name,
				targetReference: stage.agentReference,
			});
			if (denial) return denial;
		}
	}
	return undefined;
}

function deniedChainResult(message: string) {
	return {
		content: [{ type: "text" as const, text: `chain_run denied: ${message}` }],
		details: { lines: [] } as ChainProgressDetails,
	};
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
			'Run a chain of agent stages using the chain DSL. Supports sequential ("author -> executor"), bracket-group ("author -> [editor, inspector] -> executor"), and fan-out ("executor -> inspector[3]") syntax.',
		parameters: Type.Object({
			expression: Type.String({
				description:
					'Chain DSL expression. Examples: "author -> editor -> executor" (sequential), "author -> [editor, inspector] -> executor" (bracket group), "executor -> inspector[3]" (fan-out)',
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
			timeoutMs: Type.Optional(
				Type.Number({
					description:
						"Optional global chain timeout in milliseconds. Default: 1800000ms (30 minutes).",
				}),
			),
			spawnTimeoutMs: Type.Optional(
				Type.Number({
					description:
						"Optional per-stage child spawn completion wait timeout in milliseconds. Default: 300000ms (5 minutes).",
				}),
			),
			thinkingLevel: thinkingLevelSchema(
				"Chain-wide default thinking/reasoning level (off, minimal, low, medium, high, xhigh). Applied to all stages unless overridden by agent definitions.",
			),
		}),
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const runtime = await getRuntime(ctx.cwd);
			const callerRole = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
			if (!callerRole)
				return deniedChainResult(
					"caller role could not be resolved from runtime identity marker",
				);
			const callerDef = runtime.agentRegistry.get(
				callerRole,
				runtime.domainContext,
			);
			const { steps, episodes } = selectChain(
				params.expression,
				runtime.chains,
				runtime.chainAdapter?.defaultEpisodes,
			);
			injectUserPrompt(steps, params.prompt);
			const thinking = params.thinkingLevel
				? { default: params.thinkingLevel }
				: undefined;

			const progressLines: string[] = [];
			const episodeWarnings = new Set<string>();

			const chainConfig = {
				signal,
				episodes,
				runtime,
				chainAdapter: runtime.chainAdapter,
				sessionPolicies: runtime.sessionPolicies,
				defaultModel: runtime.defaultModel,
				requesterDomain: callerDef?.domain,
				steps,
				projectRoot: ctx.cwd,
				projectSkills: runtime.projectSkills,
				skillPaths: [...runtime.skillPaths],
				domainContext: runtime.domainContext,
				completionLabel: params.completionLabel,
				timeoutMs: params.timeoutMs,
				spawnTimeoutMs: params.spawnTimeoutMs,
				thinking,
				registry: runtime.agentRegistry,
				domainsDir: runtime.domainsDir,
				resolver: runtime.domainResolver,
				reportEpisodeWarning: async (warning: MemoryWarning) => {
					episodeWarnings.add(formatEpisodeWarning(warning));
				},
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
			};

			const normalized = normalizeChain(chainConfig);
			const denial = chainDenial(
				normalized.ok ? normalized.stages : steps,
				callerRole,
				runtime,
			);
			if (denial) return deniedChainResult(denial);
			const result = normalized.ok
				? await runConfiguredChain({ ...chainConfig, steps: normalized.stages })
				: await refuseNormalization(chainConfig, normalized.errors);

			// Add final summary line
			const finalLine = result.success
				? `✓ Chain completed (${formatDuration(result.totalDurationMs)})`
				: `✗ Chain failed (${formatDuration(result.totalDurationMs)})`;
			progressLines.push(finalLine);

			return {
				content: [
					{
						type: "text" as const,
						text: buildChainResultText(result, [...episodeWarnings]),
					},
				],
				details: {
					lines: progressLines,
					run: result.run,
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
				text += `\n${theme.fg("muted", `  prompt: "${truncated}"`)}`;
			}
			if (args.completionLabel) {
				text += theme.fg("muted", ` [${args.completionLabel}]`);
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
					return theme.fg("muted", line);
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
