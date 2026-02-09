import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";

export default function orchestrationExtension(pi: ExtensionAPI) {
	// chain_run
	pi.registerTool({
		name: "chain_run",
		label: "Run Chain",
		description:
			"Run a chain of agent stages using the chain DSL (e.g. \"planner -> task-manager -> coordinator\")",
		parameters: Type.Object({
			expression: Type.String({
				description:
					"Chain DSL expression (e.g. \"planner -> task-manager -> coordinator\")",
			}),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const stages = parseChain(params.expression);
			const result = await runChain({
				stages,
				projectRoot: ctx.cwd,
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
					"Agent role (planner, task-manager, coordinator, worker)",
			}),
			prompt: Type.String({ description: "The prompt to send to the agent" }),
			model: Type.Optional(
				Type.String({ description: "Model override" }),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const spawner = createPiSpawner();
			try {
				const result = await spawner.spawn({
					role: params.role,
					cwd: ctx.cwd,
					prompt: params.prompt,
					model: params.model,
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
