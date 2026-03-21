import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import { createPiSpawner } from "../../../../lib/orchestration/agent-spawner.ts";
import type { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { isSubagentAllowed } from "./authorization.ts";
import { renderTextFallback, roleLabel } from "./rendering.ts";

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
// Tool Registration
// ============================================================================

export function registerSpawnTool(
	pi: ExtensionAPI,
	getRuntime: (cwd: string) => Promise<CosmonautsRuntime>,
): void {
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
