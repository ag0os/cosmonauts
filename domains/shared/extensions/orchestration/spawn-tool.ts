import { basename, dirname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	activityBus,
	runSessionCleanup,
} from "../../../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../../../lib/orchestration/message-bus.ts";
import {
	getPlanSlugForSession,
	registerPlanContext,
	removePlanContext,
} from "../../../../lib/orchestration/plan-session-context.ts";
import { createAgentSessionFromDefinition } from "../../../../lib/orchestration/session-factory.ts";
import {
	awaitNextCompletionMessages,
	formatSpawnCompletionMessage,
} from "../../../../lib/orchestration/spawn-completion-loop.ts";
import {
	getOrCreateTracker,
	removeTracker,
} from "../../../../lib/orchestration/spawn-tracker.ts";
import type { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { appendSession } from "../../../../lib/sessions/manifest.ts";
import {
	generateTranscript,
	writeTranscript,
} from "../../../../lib/sessions/session-store.ts";
import type { SessionRecord } from "../../../../lib/sessions/types.ts";
import { isSubagentAllowed } from "./authorization.ts";
import {
	renderTextFallback,
	roleLabel,
	summarizeToolCall,
} from "./rendering.ts";

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
	return formatSpawnCompletionMessage(
		spawnId,
		role,
		outcome,
		summary,
		fullText,
	);
}

function sendSpawnCompletion(pi: ExtensionAPI, message: string): void {
	try {
		pi.sendUserMessage(message, { deliverAs: "followUp" });
	} catch {
		// Detached spawns can finish after the owning Pi extension runtime has
		// been replaced or reloaded. The tracker/lineage already has the result.
	}
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

			// Propagate plan context from parent session so child lineage
			// artifacts land in the same missions/sessions/<planSlug>/ directory.
			const planSlug = getPlanSlugForSession(parentSessionId);

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
				...(planSlug !== undefined && { planSlug }),
			};

			// Launch as a detached background Promise — no await
			void createAgentSessionFromDefinition(
				targetDef,
				spawnConfig,
				runtime.domainsDir,
				runtime.domainResolver,
			)
				// Temporary migration debt: child session lifecycle is handled inline.
				// fallow-ignore-next-line complexity
				.then(async ({ session, sessionFilePath }) => {
					// Register child depth so grandchild spawns can compute their depth
					sessionDepths.set(session.sessionId, childDepth);
					// Spawned sessions can spawn their own children. Those nested
					// completions must be delivered to this session before it is
					// considered finished and disposed.
					const childTracker = getOrCreateTracker(
						session.sessionId,
						undefined,
						{
							deliveryMode: "external",
						},
					);
					// Register plan context so grandchild spawns can also inherit it
					if (planSlug) {
						registerPlanContext(session.sessionId, planSlug);
					}
					// Subscribe to child session events for activity broadcasting
					const unsubActivity = session.subscribe(
						(event: { type: string; [key: string]: unknown }) => {
							const activityBase = {
								type: "spawn_activity" as const,
								spawnId,
								parentSessionId,
								role: params.role,
								taskId: params.runtimeContext?.taskId,
							};
							if (event.type === "tool_execution_start") {
								activityBus.publish({
									...activityBase,
									activity: {
										kind: "tool_start",
										toolName: event.toolName as string,
										summary: summarizeToolCall(
											event.toolName as string,
											event.args,
										),
									},
								} satisfies SpawnActivityEvent);
							} else if (event.type === "tool_execution_end") {
								activityBus.publish({
									...activityBase,
									activity: {
										kind: "tool_end",
										toolName: event.toolName as string,
										isError: event.isError as boolean,
									},
								} satisfies SpawnActivityEvent);
							} else if (event.type === "turn_start") {
								activityBus.publish({
									...activityBase,
									activity: { kind: "turn_start" },
								} satisfies SpawnActivityEvent);
							} else if (event.type === "turn_end") {
								activityBus.publish({
									...activityBase,
									activity: { kind: "turn_end" },
								} satisfies SpawnActivityEvent);
							} else if (event.type === "auto_compaction_start") {
								activityBus.publish({
									...activityBase,
									activity: { kind: "compaction" },
								} satisfies SpawnActivityEvent);
							}
						},
					);

					const startedAt = new Date().toISOString();
					const startMs = Date.now();
					let spawnOutcome: "success" | "failed" = "failed";
					let capturedStats:
						| {
								tokens: { input: number; output: number; total: number };
								cost: number;
								durationMs: number;
								turns: number;
								toolCalls: number;
						  }
						| undefined;
					try {
						await session.prompt(params.prompt);
						while (childTracker.activeCount() > 0) {
							const messages = await awaitNextCompletionMessages(childTracker);
							for (const message of messages) {
								await session.prompt(message);
							}
						}
						const assistantText = extractAssistantText(
							session.messages,
							params.role,
						);
						const summary = extractSummary(assistantText, params.role);
						spawnOutcome = "success";
						// Capture stats before dispose (only needed for lineage)
						if (planSlug && sessionFilePath) {
							const sessionStats = session.getSessionStats();
							const durationMs = Date.now() - startMs;
							capturedStats = {
								tokens: {
									input: sessionStats.tokens.input,
									output: sessionStats.tokens.output,
									total: sessionStats.tokens.total,
								},
								cost: sessionStats.cost,
								durationMs,
								turns: sessionStats.userMessages,
								toolCalls: sessionStats.toolCalls,
							};
						}
						tracker.complete(spawnId, summary, assistantText);
						if (tracker.deliveryMode === "self") {
							sendSpawnCompletion(
								pi,
								formatCompletionMessage(
									spawnId,
									params.role,
									"success",
									summary,
									assistantText,
								),
							);
						}
					} catch (err: unknown) {
						const message = err instanceof Error ? err.message : String(err);
						tracker.fail(spawnId, message);
						if (tracker.deliveryMode === "self") {
							sendSpawnCompletion(
								pi,
								formatCompletionMessage(
									spawnId,
									params.role,
									"failed",
									message,
								),
							);
						}
					} finally {
						unsubActivity();
						removeTracker(session.sessionId);
						sessionDepths.delete(session.sessionId);
						removePlanContext(session.sessionId);
						const finalMessages = [...session.messages];
						// Clean up the child session's activity bus subscription
						// before dispose, since Pi has no dispose-time lifecycle event.
						runSessionCleanup(session.sessionId);
						session.dispose();

						// Persist lineage artifacts when the child session ran under a plan.
						if (planSlug && sessionFilePath) {
							try {
								const planSessionsDir = dirname(sessionFilePath);
								const baseSessionsDir = dirname(planSessionsDir);
								const sessionBasename = basename(sessionFilePath);
								const transcriptBasename = sessionBasename.replace(
									/\.jsonl$/,
									".transcript.md",
								);

								const transcript = generateTranscript(
									finalMessages,
									params.role,
								);
								await writeTranscript(
									planSessionsDir,
									transcriptBasename,
									transcript,
								);

								const record: SessionRecord = {
									sessionId: session.sessionId,
									role: params.role,
									parentSessionId,
									...(params.runtimeContext?.taskId !== undefined && {
										taskId: params.runtimeContext.taskId,
									}),
									startedAt,
									completedAt: new Date().toISOString(),
									outcome: spawnOutcome,
									sessionFile: sessionBasename,
									transcriptFile: transcriptBasename,
									...(capturedStats !== undefined && {
										stats: capturedStats,
									}),
								};
								await appendSession(baseSessionsDir, planSlug, record);
							} catch {
								// Lineage errors must not crash the spawn.
							}
						}
					}
				})
				.catch((err: unknown) => {
					// createAgentSessionFromDefinition() itself failed
					const message = err instanceof Error ? err.message : String(err);
					tracker.fail(spawnId, message);
					if (tracker.deliveryMode === "self") {
						sendSpawnCompletion(
							pi,
							formatCompletionMessage(spawnId, params.role, "failed", message),
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
				text += theme.fg("muted", ` (${args.runtimeContext.taskId})`);
			}
			const truncated =
				args.prompt.length > 100
					? `${args.prompt.slice(0, 97)}...`
					: args.prompt;
			text += `\n${theme.fg("muted", `  ${truncated}`)}`;
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
