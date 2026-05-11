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
import type {
	AgentSession,
	AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { AgentRegistry } from "../agents/index.ts";
import type { DomainResolver } from "../domains/resolver.ts";
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
import {
	getOrCreateTracker,
	removeTracker,
	type SpawnTracker,
} from "./spawn-tracker.ts";
import type {
	AgentSpawner,
	CompactionReason,
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

interface PreparedSpawnSession {
	session: AgentSession;
	sessionFilePath: string | undefined;
	tracker: SpawnTracker;
	startedAt: string;
	unsubscribe?: () => void;
}

interface SpawnExecutionResult {
	outcome: "success" | "failed";
	stats?: SpawnStats;
}

interface CompletedSpawnExecution extends SpawnExecutionResult {
	result: SpawnResult;
}

type FinalMessages = unknown[];

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
		async spawn(config: SpawnConfig): Promise<SpawnResult> {
			if (config.signal?.aborted) {
				return toSpawnFailure(new Error("Aborted before spawn"));
			}

			let prepared: PreparedSpawnSession | undefined;
			let execution: SpawnExecutionResult = { outcome: "failed" };

			try {
				prepared = await prepareSpawnSession(
					registry,
					config,
					domainsDir,
					options?.resolver,
					bus,
				);

				try {
					const completed = await runSpawnSession(
						prepared,
						config,
						spawnTimeoutMs,
					);
					execution = completed;
					return completed.result;
				} finally {
					const finalMessages = cleanupSpawnSession(prepared, config);
					await persistPlanLinkedSpawn(
						prepared,
						execution,
						finalMessages,
						config,
					);
				}
			} catch (err: unknown) {
				return toSpawnFailure(err);
			}
		},

		dispose(): void {
			// No-op for now; interface-required placeholder.
		},
	};
}

async function prepareSpawnSession(
	registry: AgentRegistry,
	config: SpawnConfig,
	domainsDir: string,
	resolver: DomainResolver | undefined,
	bus: MessageBus,
): Promise<PreparedSpawnSession> {
	const def = registry.get(config.role, config.domainContext);
	if (!def) {
		throw new Error(
			`Unknown agent role "${config.role}". Available agents: ${registry.listIds().join(", ")}`,
		);
	}

	const { session, sessionFilePath } = await createAgentSessionFromDefinition(
		def,
		config,
		domainsDir,
		resolver,
	);

	// Create the tracker before prompt so spawn_agent tool calls can register
	// children as soon as the first turn starts.
	const tracker = getOrCreateTracker(session.sessionId, bus, {
		deliveryMode: "external",
	});

	if (config.planSlug) {
		registerPlanContext(session.sessionId, config.planSlug);
	}

	return {
		session,
		sessionFilePath,
		tracker,
		startedAt: new Date().toISOString(),
	};
}

async function runSpawnSession(
	prepared: PreparedSpawnSession,
	config: SpawnConfig,
	spawnTimeoutMs: number,
): Promise<CompletedSpawnExecution> {
	const { session, tracker } = prepared;

	prepared.unsubscribe = subscribeToSpawnEvents(session, config);

	const startMs = Date.now();
	await session.prompt(config.prompt);

	while (tracker.activeCount() > 0) {
		const messages = await awaitNextCompletionMessages(tracker, spawnTimeoutMs);
		for (const message of messages) {
			await session.prompt(message);
		}
	}

	const stats = captureSpawnStats(session, Date.now() - startMs);

	return {
		outcome: "success",
		stats,
		result: {
			success: true,
			sessionId: session.sessionId,
			messages: [...session.messages],
			stats,
		},
	};
}

function cleanupSpawnSession(
	prepared: PreparedSpawnSession,
	config: SpawnConfig,
): FinalMessages {
	const { session } = prepared;

	prepared.unsubscribe?.();
	removeTracker(session.sessionId);
	if (config.planSlug) {
		removePlanContext(session.sessionId);
	}
	const finalMessages = [...session.messages];
	session.dispose();

	return finalMessages;
}

async function persistPlanLinkedSpawn(
	prepared: PreparedSpawnSession,
	execution: SpawnExecutionResult,
	finalMessages: FinalMessages,
	config: SpawnConfig,
): Promise<void> {
	if (!config.planSlug || !prepared.sessionFilePath) {
		return;
	}

	try {
		const planSessionsDir = dirname(prepared.sessionFilePath);
		const baseSessionsDir = dirname(planSessionsDir);
		const sessionBasename = basename(prepared.sessionFilePath);
		const transcriptBasename = sessionBasename.replace(
			/\.jsonl$/,
			".transcript.md",
		);

		const transcript = generateTranscript(finalMessages, config.role);
		await writeTranscript(planSessionsDir, transcriptBasename, transcript);

		const record: SessionRecord = {
			sessionId: prepared.session.sessionId,
			role: config.role,
			...(config.parentSessionId !== undefined && {
				parentSessionId: config.parentSessionId,
			}),
			...(config.runtimeContext?.taskId !== undefined && {
				taskId: config.runtimeContext.taskId,
			}),
			startedAt: prepared.startedAt,
			completedAt: new Date().toISOString(),
			outcome: execution.outcome,
			sessionFile: sessionBasename,
			transcriptFile: transcriptBasename,
			...(execution.stats !== undefined && {
				stats: {
					tokens: {
						input: execution.stats.tokens.input,
						output: execution.stats.tokens.output,
						total: execution.stats.tokens.total,
					},
					cost: execution.stats.cost,
					durationMs: execution.stats.durationMs,
					turns: execution.stats.turns,
					toolCalls: execution.stats.toolCalls,
				},
			}),
		};
		await appendSession(baseSessionsDir, config.planSlug, record);
	} catch {
		// Lineage recording must not crash the spawn.
	}
}

function toSpawnFailure(err: unknown): SpawnResult {
	return {
		success: false,
		sessionId: "",
		messages: [],
		error: err instanceof Error ? err.message : String(err),
	};
}

function subscribeToSpawnEvents(
	session: AgentSession,
	config: SpawnConfig,
): (() => void) | undefined {
	if (!config.onEvent) {
		return undefined;
	}

	return session.subscribe((event) => {
		const mapped = mapSessionEvent(event);
		if (!mapped) {
			return;
		}

		try {
			config.onEvent?.(attachSessionId(mapped, session.sessionId));
		} catch {
			// Listeners must not break the spawner.
		}
	});
}

function captureSpawnStats(
	session: AgentSession,
	durationMs: number,
): SpawnStats {
	const sessionStats = session.getSessionStats();

	return {
		tokens: { ...sessionStats.tokens },
		cost: sessionStats.cost,
		durationMs,
		turns: sessionStats.userMessages,
		toolCalls: sessionStats.toolCalls,
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
	| { type: "compaction_start"; reason: CompactionReason }
	| {
			type: "compaction_end";
			reason: CompactionReason;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  };

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
function mapSessionEvent(
	event: AgentSessionEvent,
): SpawnEventPayload | undefined {
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
		case "compaction_start":
			return {
				type: "compaction_start",
				reason: event.reason,
			};
		case "compaction_end":
			return {
				type: "compaction_end",
				reason: event.reason,
				aborted: event.aborted,
				willRetry: event.willRetry,
				...(event.errorMessage !== undefined && {
					errorMessage: event.errorMessage,
				}),
			};
		default:
			return undefined;
	}
}
