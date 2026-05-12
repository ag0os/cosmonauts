import { basename, dirname } from "node:path";
import type {
	AgentSession,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	activityBus,
	runSessionCleanup,
} from "../../../../lib/orchestration/activity-bus.ts";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "../../../../lib/orchestration/assistant-text.ts";
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
import type { SpawnTracker } from "../../../../lib/orchestration/spawn-tracker.ts";
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
import { thinkingLevelSchema } from "./schema.ts";

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

interface ChildActivityBase {
	spawnId: string;
	parentSessionId: string;
	role: string;
	taskId?: string;
}

interface DetachedChildSessionParams extends ChildActivityBase {
	session: AgentSession;
	sessionFilePath: string | undefined;
	childDepth: number;
	prompt: string;
	planSlug: string | undefined;
	tracker: SpawnTracker;
	pi: ExtensionAPI;
}

interface ChildPromptRequest {
	text: string;
	role: string;
}

interface ChildPromptResult {
	role: string;
	startedAt: string;
	outcome: "success" | "failed";
	summary: string;
	fullText?: string;
	stats?: SessionRecord["stats"];
}

interface ChildSessionEvent {
	type: string;
	[key: string]: unknown;
}

// ============================================================================
// Helpers
// ============================================================================

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

async function runDetachedChildSession(
	params: DetachedChildSessionParams,
): Promise<void> {
	const { session, childDepth, planSlug } = params;
	sessionDepths.set(session.sessionId, childDepth);
	const childTracker = getOrCreateTracker(session.sessionId, undefined, {
		deliveryMode: "external",
	});
	if (planSlug) {
		registerPlanContext(session.sessionId, planSlug);
	}

	const startedAt = new Date().toISOString();
	const startMs = Date.now();
	let unsubscribeActivity: (() => void) | undefined;
	let result: ChildPromptResult | undefined;

	try {
		unsubscribeActivity = subscribeChildActivity(
			session,
			params.spawnId,
			params,
		);
		result = await executeChildPromptLoop(session, childTracker, {
			text: params.prompt,
			role: params.role,
		});
		result = {
			...result,
			stats: captureLineageStats(params, startMs),
		};
		settleSpawnTracker(params.tracker, params.spawnId, result, params.pi);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		result = {
			role: params.role,
			startedAt,
			outcome: "failed",
			summary: message,
		};
		settleSpawnTracker(params.tracker, params.spawnId, result, params.pi);
	} finally {
		unsubscribeActivity?.();
		removeTracker(session.sessionId);
		sessionDepths.delete(session.sessionId);
		removePlanContext(session.sessionId);
		const finalMessages = [...session.messages];
		runSessionCleanup(session.sessionId);
		session.dispose();
		if (result) {
			await persistChildLineage(params, result, finalMessages);
		}
	}
}

function subscribeChildActivity(
	session: AgentSession,
	spawnId: string,
	params: ChildActivityBase,
): () => void {
	return session.subscribe((event: ChildSessionEvent) => {
		const activityEvent = mapChildActivityEvent(event, {
			spawnId,
			parentSessionId: params.parentSessionId,
			role: params.role,
			taskId: params.taskId,
		});
		if (activityEvent) {
			activityBus.publish(activityEvent);
		}
	});
}

function mapChildActivityEvent(
	event: ChildSessionEvent,
	base: ChildActivityBase,
): SpawnActivityEvent | undefined {
	if (event.type === "tool_execution_start") {
		const toolName = String(event.toolName);
		return {
			...base,
			type: "spawn_activity",
			activity: {
				kind: "tool_start",
				toolName,
				summary: summarizeToolCall(toolName, event.args),
			},
		};
	}
	if (event.type === "tool_execution_end") {
		return {
			...base,
			type: "spawn_activity",
			activity: {
				kind: "tool_end",
				toolName: String(event.toolName),
				isError: event.isError === true,
			},
		};
	}
	if (event.type === "turn_start") {
		return {
			...base,
			type: "spawn_activity",
			activity: { kind: "turn_start" },
		};
	}
	if (event.type === "turn_end") {
		return {
			...base,
			type: "spawn_activity",
			activity: { kind: "turn_end" },
		};
	}
	if (event.type === "compaction_start") {
		return {
			...base,
			type: "spawn_activity",
			activity: { kind: "compaction" },
		};
	}
	return undefined;
}

async function executeChildPromptLoop(
	session: AgentSession,
	childTracker: SpawnTracker,
	prompt: ChildPromptRequest,
): Promise<ChildPromptResult> {
	const startedAt = new Date().toISOString();
	await session.prompt(prompt.text);
	while (childTracker.activeCount() > 0) {
		const messages = await awaitNextCompletionMessages(childTracker);
		for (const message of messages) {
			await session.prompt(message);
		}
	}
	const fullText = extractAssistantText(session.messages, prompt.role);
	return {
		role: prompt.role,
		startedAt,
		outcome: "success",
		summary: summarizeAssistantText(fullText, prompt.role),
		fullText,
	};
}

function settleSpawnTracker(
	tracker: SpawnTracker,
	spawnId: string,
	result: ChildPromptResult,
	pi: ExtensionAPI,
): void {
	if (result.outcome === "success") {
		tracker.complete(spawnId, result.summary, result.fullText);
		if (tracker.deliveryMode === "self") {
			sendSpawnCompletion(
				pi,
				formatCompletionMessage(
					spawnId,
					result.role,
					"success",
					result.summary,
					result.fullText,
				),
			);
		}
		return;
	}

	tracker.fail(spawnId, result.summary);
	if (tracker.deliveryMode === "self") {
		sendSpawnCompletion(
			pi,
			formatCompletionMessage(spawnId, result.role, "failed", result.summary),
		);
	}
}

async function persistChildLineage(
	params: DetachedChildSessionParams,
	result: ChildPromptResult,
	finalMessages: unknown[],
): Promise<void> {
	if (!params.planSlug || !params.sessionFilePath) {
		return;
	}

	try {
		const planSessionsDir = dirname(params.sessionFilePath);
		const baseSessionsDir = dirname(planSessionsDir);
		const sessionBasename = basename(params.sessionFilePath);
		const transcriptBasename = sessionBasename.replace(
			/\.jsonl$/,
			".transcript.md",
		);

		const transcript = generateTranscript(finalMessages, params.role);
		await writeTranscript(planSessionsDir, transcriptBasename, transcript);

		const record: SessionRecord = {
			sessionId: params.session.sessionId,
			role: params.role,
			parentSessionId: params.parentSessionId,
			...(params.taskId !== undefined && { taskId: params.taskId }),
			startedAt: result.startedAt,
			completedAt: new Date().toISOString(),
			outcome: result.outcome,
			sessionFile: sessionBasename,
			transcriptFile: transcriptBasename,
			...(result.stats !== undefined && { stats: result.stats }),
		};
		await appendSession(baseSessionsDir, params.planSlug, record);
	} catch {
		// Lineage errors must not crash the spawn.
	}
}

function captureLineageStats(
	params: DetachedChildSessionParams,
	startMs: number,
): SessionRecord["stats"] | undefined {
	if (!params.planSlug || !params.sessionFilePath) {
		return undefined;
	}

	const sessionStats = params.session.getSessionStats();
	return {
		tokens: {
			input: sessionStats.tokens.input,
			output: sessionStats.tokens.output,
			total: sessionStats.tokens.total,
		},
		cost: sessionStats.cost,
		durationMs: Date.now() - startMs,
		turns: sessionStats.userMessages,
		toolCalls: sessionStats.toolCalls,
	};
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
			thinkingLevel: thinkingLevelSchema(
				"Thinking/reasoning level override (off, minimal, low, medium, high, xhigh)",
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
				.then(({ session, sessionFilePath }) =>
					runDetachedChildSession({
						session,
						sessionFilePath,
						spawnId,
						parentSessionId,
						childDepth,
						role: params.role,
						prompt: params.prompt,
						planSlug,
						tracker,
						pi,
						taskId: params.runtimeContext?.taskId,
					}),
				)
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
