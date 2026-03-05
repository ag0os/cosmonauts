import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createDefaultRegistry } from "../../lib/agents/index.ts";
import { extractAgentIdFromSystemPrompt } from "../../lib/agents/runtime-identity.ts";
import { loadProjectConfig } from "../../lib/config/index.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import {
	injectUserPrompt,
	runChain,
} from "../../lib/orchestration/chain-runner.ts";

const DEFAULT_REGISTRY = createDefaultRegistry();

export default function orchestrationExtension(pi: ExtensionAPI) {
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
				Type.String({
					description:
						'Chain-wide default thinking/reasoning level (off, minimal, low, medium, high, xhigh). Applied to all stages unless overridden by agent definitions.',
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const stages = parseChain(params.expression);
			injectUserPrompt(stages, params.prompt);
			const projectConfig = await loadProjectConfig(ctx.cwd);
			const thinking = params.thinkingLevel
				? { default: params.thinkingLevel as ThinkingLevel }
				: undefined;
			const result = await runChain({
				stages,
				projectRoot: ctx.cwd,
				projectSkills: projectConfig.skills,
				completionLabel: params.completionLabel,
				thinking,
			});
			const stagesSummary = result.stageResults
				.map(
					(s) =>
						`${s.stage.name}: ${s.success ? "ok" : "FAILED"}${s.error ? ` (${s.error})` : ""}`,
				)
				.join(", ");
			return {
				content: [
					{
						type: "text" as const,
						text: `Chain ${result.success ? "completed" : "failed"} (${result.totalDurationMs}ms) — ${stagesSummary}`,
					},
				],
				details: result,
			};
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
				Type.String({
					description:
						'Thinking/reasoning level override (off, minimal, low, medium, high, xhigh)',
				}),
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
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
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
					details: null,
				};
			}

			const callerDef = DEFAULT_REGISTRY.get(callerRole);
			if (!callerDef) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: unknown caller role "${callerRole}"`,
						},
					],
					details: null,
				};
			}

			const targetDef = DEFAULT_REGISTRY.get(params.role);
			if (!targetDef) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: unknown target role "${params.role}"`,
						},
					],
					details: null,
				};
			}

			if (!(callerDef.subagents ?? []).includes(targetDef.id)) {
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent denied: ${callerDef.id} cannot spawn ${targetDef.id}`,
						},
					],
					details: null,
				};
			}

			const spawner = createPiSpawner();
			const projectConfig = await loadProjectConfig(ctx.cwd);
			try {
				const result = await spawner.spawn({
					role: params.role,
					cwd: ctx.cwd,
					prompt: params.prompt,
					model: params.model,
					thinkingLevel: params.thinkingLevel as
						| import("@mariozechner/pi-agent-core").ThinkingLevel
						| undefined,
					runtimeContext: params.runtimeContext,
					projectSkills: projectConfig.skills,
				});
				return {
					content: [
						{
							type: "text" as const,
							text: `Agent ${params.role} ${result.success ? "completed" : "failed"}${result.error ? `: ${result.error}` : ""}`,
						},
					],
					details: result,
				};
			} finally {
				spawner.dispose();
			}
		},
	});
}
