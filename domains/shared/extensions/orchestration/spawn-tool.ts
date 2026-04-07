import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import { createAgentSessionFromDefinition } from "../../../../lib/orchestration/session-factory.ts";
import { getOrCreateTracker } from "../../../../lib/orchestration/spawn-tracker.ts";
import type { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { isSubagentAllowed } from "./authorization.ts";
import { renderTextFallback, roleLabel } from "./rendering.ts";

// ============================================================================
// Module-level per-session state (shared across all spawn tool invocations)
// ============================================================================

/**
 * Tracks the nesting depth of each active session by sessionId.
 * Top-level sessions are absent (treated as depth 0).
 * Populated when a child session is created; cleaned up on completion.
 */
const sessionDepths = new Map<string, number>();

// ============================================================================
// Spawn Details Type
// ============================================================================

interface SpawnProgressDetails {
	role: string;
	status:
		| "spawning"
		| "accepted"
		| "completed"
		| "failed"
		| "denied"
		| "rejected";
	spawnId?: string;
	error?: string;
	reason?: string;
	taskId?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the text content from the last assistant message in a completed
 * session. Falls back to "<role> completed" if no text content is found.
 */
function extractAssistantText(messages: unknown[], role: string): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as { role?: string; content?: unknown };
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			const textBlocks: string[] = [];
			for (const block of msg.content) {
				const b = block as { type?: string; text?: string };
				if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
					textBlocks.push(b.text.trim());
				}
			}
			if (textBlocks.length > 0) {
				return textBlocks.join("\n\n");
			}
		}
	}
	return `${role} completed`;
}

function extractSummary(text: string, role: string): string {
	const trimmed = text.trim();
	if (trimmed.length === 0) return `${role} completed`;
	return trimmed.slice(0, 200);
}

function formatCompletionMessage(
	spawnId: string,
	role: string,
	outcome: "success" | "failed",
	summary: string,
	fullText?: string,
): string {
	const base = `[spawn_completion] spawnId=${spawnId} role=${role} outcome=${outcome} summary=${summary}`;
	const details = fullText?.trim();
	if (!details || details === summary) return base;
	return `${base}\n\n${details}`;
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

			// Determine nesting depth: parent depth + 1
			const parentSessionId = ctx.sessionManager.getSessionId();
			const parentDepth = sessionDepths.get(parentSessionId) ?? 0;
			const childDepth = parentDepth + 1;

			// Get or create the tracker for this parent session
			const tracker = getOrCreateTracker(parentSessionId);

			// Precheck before acquiring semaphore slot
			if (!tracker.canSpawn(childDepth)) {
				return {
					content: [
						{
							type: "text" as const,
							text: "spawn_agent rejected: depth or concurrency limit reached",
						},
					],
					details: {
						role: params.role,
						status: "rejected",
						reason: "depth or concurrency limit reached",
					} as SpawnProgressDetails,
				};
			}

			// Generate a unique identifier for this spawn
			const spawnId = crypto.randomUUID();

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

			// Register before launching — acquires semaphore slot synchronously
			try {
				tracker.register(spawnId, params.role, childDepth);
			} catch (err: unknown) {
				const reason = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `spawn_agent rejected: ${reason}`,
						},
					],
					details: {
						role: params.role,
						status: "rejected",
						reason,
					} as SpawnProgressDetails,
				};
			}

			const spawnConfig = {
				role: params.role,
				domainContext: runtime.domainContext,
				cwd: ctx.cwd,
				prompt: params.prompt,
				model: params.model,
				thinkingLevel: params.thinkingLevel,
				runtimeContext: params.runtimeContext,
				projectSkills: runtime.projectSkills,
				skillPaths: [...runtime.skillPaths],
				spawnDepth: childDepth,
				parentSessionId,
			};

			// Launch as a detached background Promise — no await
			void createAgentSessionFromDefinition(
				targetDef,
				spawnConfig,
				runtime.domainsDir,
				runtime.domainResolver,
			)
				.then(async ({ session }) => {
					// Register child depth so grandchild spawns can compute their depth
					sessionDepths.set(session.sessionId, childDepth);
					try {
						await session.prompt(params.prompt);
						const assistantText = extractAssistantText(
							session.messages,
							params.role,
						);
						const summary = extractSummary(assistantText, params.role);
						tracker.complete(spawnId, summary);
						if (tracker.deliveryMode === "self") {
							pi.sendUserMessage(
								formatCompletionMessage(
									spawnId,
									params.role,
									"success",
									summary,
									params.role === "verifier" ? assistantText : undefined,
								),
								{ deliverAs: "followUp" },
							);
						}
					} catch (err: unknown) {
						const message = err instanceof Error ? err.message : String(err);
						tracker.fail(spawnId, message);
						if (tracker.deliveryMode === "self") {
							pi.sendUserMessage(
								formatCompletionMessage(
									spawnId,
									params.role,
									"failed",
									message,
								),
								{ deliverAs: "followUp" },
							);
						}
					} finally {
						sessionDepths.delete(session.sessionId);
						session.dispose();
					}
				})
				.catch((err: unknown) => {
					// createAgentSessionFromDefinition() itself failed
					const message = err instanceof Error ? err.message : String(err);
					tracker.fail(spawnId, message);
					if (tracker.deliveryMode === "self") {
						pi.sendUserMessage(
							formatCompletionMessage(spawnId, params.role, "failed", message),
							{ deliverAs: "followUp" },
						);
					}
				});

			return {
				content: [
					{
						type: "text" as const,
						text: `Accepted spawn of ${params.role} (spawnId: ${spawnId})`,
					},
				],
				details: {
					role: params.role,
					status: "accepted",
					spawnId,
					taskId,
				} as SpawnProgressDetails,
			};
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
				case "accepted": {
					const label = details.taskId
						? `${roleLabel(details.role)} (${details.taskId})`
						: roleLabel(details.role);
					return new Text(
						theme.fg("success", `⬆ ${label} accepted (${details.spawnId})`),
						0,
						0,
					);
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
				case "rejected":
					return new Text(
						theme.fg(
							"error",
							`⊘ ${roleLabel(details.role)} rejected${details.reason ? `: ${details.reason}` : ""}`,
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
