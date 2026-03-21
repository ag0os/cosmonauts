/**
 * Agent spawner for chain orchestration.
 * Creates and runs Pi agent sessions for chain stages.
 *
 * Agent identity is loaded from prompt files via DefaultResourceLoader's
 * systemPrompt override, replacing Pi's default prompt with Cosmonauts'
 * composed prompt layers while keeping Pi's auto-injected context
 * (skills, AGENTS.md, date/time, cwd).
 */

import type { AgentRegistry } from "../agents/index.ts";
import {
	FALLBACK_MODEL,
	getModelForRole,
	getThinkingForRole,
	resolveModel,
} from "./model-resolution.ts";
import { createAgentSessionFromDefinition } from "./session-factory.ts";
import type {
	AgentSpawner,
	SpawnConfig,
	SpawnEvent,
	SpawnResult,
	SpawnStats,
} from "./types.ts";

// Re-export definition-resolution symbols for backwards compatibility.
export {
	isDirectory,
	type ResolveExtensionOptions,
	resolveExtensionPaths,
	resolveTools,
} from "./definition-resolution.ts";

// Re-export model-resolution symbols for backwards compatibility.
export { FALLBACK_MODEL, getModelForRole, getThinkingForRole, resolveModel };

// Re-export session-factory symbol.
export { createAgentSessionFromDefinition } from "./session-factory.ts";

// ============================================================================
// Agent Spawner Factory
// ============================================================================

/**
 * Create an AgentSpawner backed by the Pi coding agent SDK.
 *
 * Each `spawn()` call creates an ephemeral in-memory session, sends the
 * user prompt, waits for completion, then disposes the session.
 *
 * Agent identity is injected via the system prompt using prompt files
 * loaded from the agent definition's `prompts` array.
 */
export function createPiSpawner(
	registry: AgentRegistry,
	domainsDir: string,
): AgentSpawner {
	return {
		async spawn(config: SpawnConfig): Promise<SpawnResult> {
			// Respect abort signal before doing any work
			if (config.signal?.aborted) {
				return {
					success: false,
					sessionId: "",
					messages: [],
					error: "Aborted before spawn",
				};
			}

			try {
				// Resolve full agent definition (unknown roles are rejected).
				const def = registry.get(config.role, config.domainContext);
				if (!def) {
					throw new Error(
						`Unknown agent role "${config.role}". Available agents: ${registry.listIds().join(", ")}`,
					);
				}

				const session = await createAgentSessionFromDefinition(
					def,
					config,
					domainsDir,
				);

				let unsubscribe: (() => void) | undefined;
				try {
					// Subscribe to session events before prompt for progress streaming
					unsubscribe = config.onEvent
						? session.subscribe((event) => {
								const mapped = mapSessionEvent(event);
								if (mapped) {
									try {
										config.onEvent?.(
											attachSessionId(mapped, session.sessionId),
										);
									} catch {
										// Listeners must not break the spawner.
									}
								}
							})
						: undefined;

					// Send the user prompt clean — identity is in the system prompt
					const startMs = Date.now();
					await session.prompt(config.prompt);
					const durationMs = Date.now() - startMs;

					// Extract session stats before dispose
					const sessionStats = session.getSessionStats();
					const stats: SpawnStats = {
						tokens: { ...sessionStats.tokens },
						cost: sessionStats.cost,
						durationMs,
						turns: sessionStats.userMessages,
						toolCalls: sessionStats.toolCalls,
					};

					return {
						success: true,
						sessionId: session.sessionId,
						messages: [...session.messages],
						stats,
					};
				} finally {
					unsubscribe?.();
					session.dispose();
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					success: false,
					sessionId: "",
					messages: [],
					error: message,
				};
			}
		},

		dispose(): void {
			// No-op for now; interface-required placeholder.
		},
	};
}

// ============================================================================
// Helpers
// ============================================================================

type SpawnEventPayload =
	| { type: "turn_start" }
	| { type: "turn_end" }
	| { type: "tool_execution_start"; toolName: string; toolCallId: string }
	| {
			type: "tool_execution_end";
			toolName: string;
			toolCallId: string;
			isError: boolean;
	  }
	| { type: "auto_compaction_start"; reason: "threshold" | "overflow" }
	| { type: "auto_compaction_end"; aborted: boolean };

function attachSessionId(
	event: SpawnEventPayload,
	sessionId: string,
): SpawnEvent {
	return { ...event, sessionId } as SpawnEvent;
}

/**
 * Map a Pi AgentSessionEvent to a SpawnEvent payload, or return undefined for
 * events we don't forward.
 */
function mapSessionEvent(event: {
	type: string;
	[key: string]: unknown;
}): SpawnEventPayload | undefined {
	switch (event.type) {
		case "turn_start":
			return { type: "turn_start" };
		case "turn_end":
			return { type: "turn_end" };
		case "tool_execution_start":
			return {
				type: "tool_execution_start",
				toolName: event.toolName as string,
				toolCallId: event.toolCallId as string,
			};
		case "tool_execution_end":
			return {
				type: "tool_execution_end",
				toolName: event.toolName as string,
				toolCallId: event.toolCallId as string,
				isError: event.isError as boolean,
			};
		case "auto_compaction_start":
			return {
				type: "auto_compaction_start",
				reason: event.reason as "threshold" | "overflow",
			};
		case "auto_compaction_end":
			return {
				type: "auto_compaction_end",
				aborted: event.aborted as boolean,
			};
		default:
			return undefined;
	}
}
