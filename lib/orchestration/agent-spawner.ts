/**
 * Agent spawner for chain orchestration.
 * Creates and runs Pi agent sessions for chain stages.
 *
 * Agent identity is loaded from prompt files via DefaultResourceLoader's
 * systemPrompt override, replacing Pi's default prompt with Cosmonauts'
 * composed prompt layers while keeping Pi's auto-injected context
 * (skills, AGENTS.md, date/time, cwd).
 */

import { basename, dirname } from "node:path";
import type { AgentRegistry } from "../agents/index.ts";
import { appendSession } from "../sessions/manifest.ts";
import {
	generateTranscript,
	writeTranscript,
} from "../sessions/session-store.ts";
import type { SessionRecord } from "../sessions/types.ts";
import { MessageBus } from "./message-bus.ts";
import {
	FALLBACK_MODEL,
	getModelForRole,
	getThinkingForRole,
	resolveModel,
} from "./model-resolution.ts";
import {
	registerPlanContext,
	removePlanContext,
} from "./plan-session-context.ts";
import { createAgentSessionFromDefinition } from "./session-factory.ts";
import {
	awaitNextCompletionMessages,
	DEFAULT_SPAWN_TIMEOUT_MS,
} from "./spawn-completion-loop.ts";
import { getOrCreateTracker, removeTracker } from "./spawn-tracker.ts";
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

/** Options for {@link createPiSpawner}. */
export interface PiSpawnerOptions {
	/** Shared message bus for parallel spawn coordination. */
	bus?: MessageBus;
	/** Per-spawn completion wait timeout in ms (default: 5 minutes). */
	spawnTimeoutMs?: number;
}

/**
 * Create an AgentSpawner backed by the Pi coding agent SDK.
 *
 * Each `spawn()` call creates an ephemeral in-memory session, sends the
 * user prompt, waits for completion, then disposes the session.
 *
 * When child agents are spawned during the session (via the spawn tool),
 * a multi-turn completion loop delivers each child's result back to the
 * parent session until all children have finished.
 *
 * Agent identity is injected via the system prompt using prompt files
 * loaded from the agent definition's `prompts` array.
 */
export function createPiSpawner(
	registry: AgentRegistry,
	domainsDir: string,
	options?: PiSpawnerOptions & {
		resolver?: import("../domains/resolver.ts").DomainResolver;
	},
): AgentSpawner {
	const bus = options?.bus ?? new MessageBus();
	const spawnTimeoutMs = options?.spawnTimeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;

	return {
		// Temporary migration debt: spawn lifecycle persists lineage and child coordination.
		// fallow-ignore-next-line complexity
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

				const { session, sessionFilePath } =
					await createAgentSessionFromDefinition(
						def,
						config,
						domainsDir,
						options?.resolver,
					);

				// Create tracker before prompt so the spawn tool can register
				// children as soon as the first tool call fires.
				const tracker = getOrCreateTracker(session.sessionId, bus, {
					deliveryMode: "external",
				});

				// Register plan context so child spawns (via spawn_agent) can
				// inherit the planSlug and persist their own lineage artifacts.
				if (config.planSlug) {
					registerPlanContext(session.sessionId, config.planSlug);
				}

				let unsubscribe: (() => void) | undefined;
				const startedAt = new Date().toISOString();
				let spawnOutcome: "success" | "failed" = "failed";
				let capturedStats: SpawnStats | undefined;
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

					// Multi-turn completion loop: deliver child results back to the
					// parent until all spawned children have finished.  Sessions that
					// spawn no children skip this loop entirely (activeCount() == 0).
					while (tracker.activeCount() > 0) {
						const messages = await awaitNextCompletionMessages(
							tracker,
							spawnTimeoutMs,
						);
						for (const message of messages) {
							await session.prompt(message);
						}
					}

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

					spawnOutcome = "success";
					capturedStats = stats;

					return {
						success: true,
						sessionId: session.sessionId,
						messages: [...session.messages],
						stats,
					};
				} finally {
					unsubscribe?.();
					removeTracker(session.sessionId);
					removePlanContext(session.sessionId);
					const finalMessages = [...session.messages];
					session.dispose();

					if (config.planSlug && sessionFilePath) {
						try {
							const planSessionsDir = dirname(sessionFilePath);
							const baseSessionsDir = dirname(planSessionsDir);
							const sessionBasename = basename(sessionFilePath);
							const transcriptBasename = sessionBasename.replace(
								/\.jsonl$/,
								".transcript.md",
							);

							const transcript = generateTranscript(finalMessages, config.role);
							await writeTranscript(
								planSessionsDir,
								transcriptBasename,
								transcript,
							);

							const record: SessionRecord = {
								sessionId: session.sessionId,
								role: config.role,
								...(config.parentSessionId !== undefined && {
									parentSessionId: config.parentSessionId,
								}),
								...(config.runtimeContext?.taskId !== undefined && {
									taskId: config.runtimeContext.taskId,
								}),
								startedAt,
								completedAt: new Date().toISOString(),
								outcome: spawnOutcome,
								sessionFile: sessionBasename,
								transcriptFile: transcriptBasename,
								...(capturedStats !== undefined && {
									stats: {
										tokens: {
											input: capturedStats.tokens.input,
											output: capturedStats.tokens.output,
											total: capturedStats.tokens.total,
										},
										cost: capturedStats.cost,
										durationMs: capturedStats.durationMs,
										turns: capturedStats.turns,
										toolCalls: capturedStats.toolCalls,
									},
								}),
							};
							await appendSession(baseSessionsDir, config.planSlug, record);
						} catch {
							// Lineage recording must not crash the spawn.
						}
					}
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
	| {
			type: "tool_execution_start";
			toolName: string;
			toolCallId: string;
			args?: unknown;
	  }
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
				...(event.args !== undefined && { args: event.args }),
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
