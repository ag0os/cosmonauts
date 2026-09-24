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
} from "@earendil-works/pi-coding-agent";
import type { AgentRegistry } from "../agents/index.ts";
import type { AnalysisFinding } from "../analysis/types.ts";
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
import {
	registerQualityReviewSession,
	removeQualityReviewSession,
} from "./quality-review-context.ts";
import { createAgentSessionFromDefinition } from "./session-factory.ts";
import {
	awaitNextCompletionMessages,
	DEFAULT_SPAWN_TIMEOUT_MS,
} from "./spawn-completion-loop.ts";
import { resolveSpawnAgent } from "./spawn-resolution.ts";
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
	const resolution = resolveSpawnAgent(registry, config);
	if (!resolution) {
		throw new Error(
			`Unknown agent role "${config.role}". Available agents: ${registry.listIds().join(", ")}`,
		);
	}
	const def = resolution.definition;

	const { session, sessionFilePath } = await createAgentSessionFromDefinition(
		def,
		config,
		domainsDir,
		resolver,
	);
	if (config.qualityReviewContext)
		registerQualityReviewSession(
			session.sessionId,
			config.qualityReviewContext,
		);
	emitSpawnEvent(config, {
		type: "agent_resolved",
		sessionId: session.sessionId,
		requestedRole: config.role,
		resolvedAgentId: resolution.qualifiedId,
	});

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
	const cancellation = createSessionCancellation(session, config.signal);

	prepared.unsubscribe = subscribeToSpawnEvents(session, config);

	try {
		const startMs = Date.now();
		await cancellation.waitFor(session.prompt(config.prompt));

		while (tracker.hasUndeliveredWork()) {
			const messages = await cancellation.waitFor(
				awaitNextCompletionMessages(tracker, spawnTimeoutMs),
			);
			if (
				config.qualityReviewContext &&
				messages.some((message) =>
					message.includes(`Timed out after ${spawnTimeoutMs}ms`),
				)
			)
				config.qualityReviewContext.integrityFailures.push(
					`Panel completion timed out after ${spawnTimeoutMs}ms`,
				);
			for (const message of messages) {
				await cancellation.waitFor(session.prompt(message));
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
	} finally {
		await cancellation.finish();
	}
}

interface SessionCancellation {
	waitFor<T>(operation: Promise<T>): Promise<T>;
	finish(): Promise<void>;
}

function createSessionCancellation(
	session: AgentSession,
	signal: AbortSignal | undefined,
): SessionCancellation {
	if (!signal) {
		return {
			waitFor: async <T>(operation: Promise<T>) => operation,
			finish: async () => undefined,
		};
	}

	let abortPromise: Promise<void> | undefined;
	let rejectCancellation: ((error: Error) => void) | undefined;
	const cancelled = new Promise<never>((_resolve, reject) => {
		rejectCancellation = reject;
	});
	const abort = () => {
		abortPromise ??= session.abort();
		void abortPromise.then(
			() => rejectCancellation?.(new Error("Spawn aborted")),
			(error: unknown) =>
				rejectCancellation?.(
					error instanceof Error ? error : new Error(String(error)),
				),
		);
	};
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();

	return {
		waitFor: async <T>(operation: Promise<T>) =>
			Promise.race([operation, cancelled]),
		async finish() {
			signal.removeEventListener("abort", abort);
			await abortPromise;
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
	removeQualityReviewSession(session.sessionId);
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
		if (config.qualityReviewContext && prepared.sessionFilePath) {
			const directory = dirname(prepared.sessionFilePath);
			const name = basename(prepared.sessionFilePath).replace(
				/\.jsonl$/,
				".transcript.md",
			);
			await writeTranscript(
				directory,
				name,
				generateTranscript(finalMessages, config.role),
			);
		}
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

		const record = buildSpawnSessionRecord(
			prepared,
			execution,
			config,
			sessionBasename,
			transcriptBasename,
		);
		await appendSession(baseSessionsDir, config.planSlug, record);
	} catch {
		// Lineage recording must not crash the spawn.
	}
}

function buildSpawnSessionRecord(
	prepared: PreparedSpawnSession,
	execution: SpawnExecutionResult,
	config: SpawnConfig,
	sessionBasename: string,
	transcriptBasename: string,
): SessionRecord {
	return {
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
}

function toSpawnFailure(err: unknown): SpawnResult {
	return {
		success: false,
		sessionId: "",
		messages: [],
		error: err instanceof Error ? err.message : String(err),
	};
}

function emitSpawnEvent(config: SpawnConfig, event: SpawnEvent): void {
	try {
		config.onEvent?.(event);
	} catch {
		// Listeners must not break the spawner.
	}
}

function subscribeToSpawnEvents(
	session: AgentSession,
	config: SpawnConfig,
): (() => void) | undefined {
	if (!config.onEvent) {
		return undefined;
	}

	return session.subscribe((event) => {
		const mapped = mapSessionEvent(
			event,
			config.qualityReviewContext !== undefined,
		);
		if (!mapped) {
			return;
		}

		emitSpawnEvent(config, attachSessionId(mapped, session.sessionId));
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
			result?: unknown;
	  }
	| { type: "compaction_start"; reason: CompactionReason }
	| {
			type: "compaction_end";
			reason: CompactionReason;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  };

function analysisGateObservation(toolName: string, result: unknown): unknown {
	if (toolName !== "analysis_status" && toolName !== "analysis_audit")
		return undefined;
	const details =
		typeof result === "object" && result !== null && "details" in result
			? result.details
			: undefined;
	if (typeof details !== "object" || details === null) return { details: {} };
	if (toolName === "analysis_status") return analysisStatusObservation(details);
	return analysisAuditObservation(details);
}

function analysisStatusObservation(details: object): unknown {
	const bindings =
		"capabilities" in details && Array.isArray(details.capabilities)
			? details.capabilities.filter(
					(binding: unknown) =>
						typeof binding === "object" &&
						binding !== null &&
						"capability" in binding &&
						binding.capability === "changed-scope-audit",
				)
			: [];
	return {
		details: {
			capabilities: bindings.map((binding: { state?: unknown }) => ({
				capability: "changed-scope-audit",
				state: binding.state,
			})),
		},
	};
}

function analysisAuditObservation(details: object): unknown {
	const scope =
		"scope" in details &&
		typeof details.scope === "object" &&
		details.scope !== null
			? details.scope
			: undefined;
	return {
		details: {
			kind: "kind" in details ? details.kind : undefined,
			capability: "capability" in details ? details.capability : undefined,
			scope: { base: scope && "base" in scope ? scope.base : undefined },
			verdict: "verdict" in details ? details.verdict : undefined,
			...auditFindingsObservation(details),
		},
	};
}

function auditFindingsObservation(details: object): {
	findings?: AnalysisFinding[];
} {
	return "findings" in details && Array.isArray(details.findings)
		? { findings: details.findings.map(auditFindingObservation) }
		: {};
}

/** The fields host report lines cite; provider details stay in the QM session. */
function auditFindingObservation(finding: AnalysisFinding): AnalysisFinding {
	return {
		id: finding.id,
		category: finding.category,
		severity: finding.severity,
		message: finding.message,
		locations: finding.locations.map(({ path, line }) => ({ path, line })),
		actions: finding.actions.map(({ description }) => ({ description })),
	};
}

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
	captureAnalysisResults: boolean,
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
			return mapToolEndEvent(event, captureAnalysisResults);
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

function mapToolEndEvent(
	event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
	captureAnalysisResults: boolean,
): SpawnEventPayload {
	const observation = captureAnalysisResults
		? analysisGateObservation(event.toolName as string, event.result)
		: undefined;
	return {
		type: "tool_execution_end",
		toolName: event.toolName as string,
		toolCallId: event.toolCallId as string,
		isError: event.isError as boolean,
		...(observation === undefined ? {} : { result: observation }),
	};
}
