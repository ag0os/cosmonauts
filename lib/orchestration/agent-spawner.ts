/**
 * Agent spawner for chain orchestration.
 * Creates and runs Pi agent sessions for chain stages.
 *
 * Agent identity is loaded from prompt files via DefaultResourceLoader's
 * appendSystemPrompt, keeping identity in the system prompt and operational
 * content in the user message.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
	createAgentSession,
	createCodingTools,
	createReadOnlyTools,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentToolSet } from "../agents/index.ts";
import {
	type AgentRegistry,
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "../agents/index.ts";
import { roleToConfigKey } from "../agents/qualified-role.ts";
import { buildSkillsOverride } from "../agents/skills.ts";
import { assemblePrompts } from "../domains/prompt-assembly.ts";
import type {
	AgentSpawner,
	ModelConfig,
	SpawnConfig,
	SpawnEvent,
	SpawnResult,
	SpawnStats,
	ThinkingConfig,
} from "./types.ts";

// ============================================================================
// Model Resolution
// ============================================================================

const FALLBACK_MODEL = "anthropic/claude-opus-4-6";

/**
 * Return the model ID string for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `models` config (matched by role key)
 *  2. Agent definition model (from registry)
 *  3. `models.default` if provided
 *  4. Sonnet fallback
 */
export function getModelForRole(
	role: string,
	models?: ModelConfig,
	registry?: AgentRegistry,
	domainContext?: string,
): string {
	// Check explicit override from ModelConfig
	if (models) {
		const configKey = roleToConfigKey(role);
		if (configKey) {
			const override = models[configKey];
			if (override) return override;
		}
	}

	// Check agent definition for model
	const def = registry?.get(role, domainContext);
	if (def?.model) {
		return def.model;
	}

	// Fallback: models.default or sonnet
	return models?.default ?? FALLBACK_MODEL;
}

// ============================================================================
// Thinking Resolution
// ============================================================================

/**
 * Return the thinking level for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `thinking` config (matched by role key)
 *  2. Agent definition thinkingLevel (from registry)
 *  3. `thinking.default` if provided
 *  4. `undefined` (no thinking — Pi default)
 */
export function getThinkingForRole(
	role: string,
	thinking?: ThinkingConfig,
	registry?: AgentRegistry,
	domainContext?: string,
): ThinkingLevel | undefined {
	// Check explicit override from ThinkingConfig
	if (thinking) {
		const configKey = roleToConfigKey(role);
		if (configKey) {
			const override = thinking[configKey];
			if (override) return override;
		}
	}

	// Check agent definition for thinkingLevel
	const def = registry?.get(role, domainContext);
	if (def?.thinkingLevel) {
		return def.thinkingLevel;
	}

	// Fallback: thinking.default or undefined
	return thinking?.default ?? undefined;
}

// ============================================================================
// Definition Resolution Helpers
// ============================================================================

/**
 * Resolve a tool set name to the appropriate Pi tools for a given cwd.
 * Uses factory functions so tools resolve paths relative to the agent's cwd.
 */
export function resolveTools(toolSet: AgentToolSet, cwd: string) {
	switch (toolSet) {
		case "coding":
			return createCodingTools(cwd);
		case "readonly":
			return createReadOnlyTools(cwd);
		case "none":
			return [];
	}
}

/** Options for domain-aware extension resolution. */
export interface ResolveExtensionOptions {
	/** Domain the agent belongs to (e.g. "coding", "shared"). */
	readonly domain: string;
	/** Absolute path to the root domains directory. */
	readonly domainsDir: string;
}

/**
 * Resolve extension names to absolute paths with domain-aware lookup.
 *
 * Resolution order per extension name:
 *  1. `domains/<domain>/extensions/<name>` (if domain is not "shared")
 *  2. `domains/shared/extensions/<name>` (fallback)
 *
 * Throws if an extension name cannot be found in either location.
 */
export function resolveExtensionPaths(
	extensions: readonly string[],
	options: ResolveExtensionOptions,
): string[] {
	const { domain, domainsDir } = options;
	return extensions.map((name) => {
		// Try domain-specific path first (skip if already "shared")
		if (domain !== "shared") {
			const domainPath = join(domainsDir, domain, "extensions", name);
			if (isDirectory(domainPath)) return domainPath;
		}

		// Fall back to shared
		const sharedPath = join(domainsDir, "shared", "extensions", name);
		if (isDirectory(sharedPath)) return sharedPath;

		// Not found anywhere — fail loud
		const searched =
			domain !== "shared"
				? `domains/${domain}/extensions/${name}, domains/shared/extensions/${name}`
				: `domains/shared/extensions/${name}`;
		throw new Error(
			`Unknown extension "${name}" in agent definition. Searched: ${searched}`,
		);
	});
}

/** Check if a path is an existing directory. */
function isDirectory(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

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
				const modelId =
					config.model ??
					getModelForRole(
						config.role,
						undefined,
						registry,
						config.domainContext,
					);
				const model = resolveModel(modelId);
				const thinkingLevel =
					config.thinkingLevel ??
					getThinkingForRole(
						config.role,
						undefined,
						registry,
						config.domainContext,
					);

				// Resolve full agent definition (unknown roles are rejected).
				const def = registry.get(config.role, config.domainContext);
				if (!def) {
					throw new Error(
						`Unknown agent role "${config.role}". Available agents: ${registry.listIds().join(", ")}`,
					);
				}

				// Tools are fully determined by the agent definition.
				const tools = resolveTools(def.tools, config.cwd);

				// System prompt via domain-aware four-layer assembly.
				let promptContent: string | undefined = await assemblePrompts({
					agentId: def.id,
					domain: def.domain ?? "coding",
					capabilities: def.capabilities,
					domainsDir,
					runtimeContext:
						config.runtimeContext?.mode === "sub-agent"
							? {
									mode: "sub-agent",
									parentRole: config.runtimeContext.parentRole,
									objective: config.runtimeContext.objective,
									taskId: config.runtimeContext.taskId,
								}
							: undefined,
				});

				// Embed caller identity marker for extension-level authorization checks.
				promptContent = appendAgentIdentityMarker(
					promptContent,
					qualifyAgentId(def.id, def.domain),
				);

				// Extensions: domain-aware resolution with shared fallback
				const extensionPaths = resolveExtensionPaths(def.extensions, {
					domain: def.domain ?? "coding",
					domainsDir,
				});

				// Build resource loader with all definition fields
				const skillsOverride = buildSkillsOverride(
					def.skills,
					config.projectSkills,
				);
				const loader = new DefaultResourceLoader({
					cwd: config.cwd,
					...(promptContent && { appendSystemPrompt: promptContent }),
					noExtensions: true,
					...(extensionPaths.length > 0 && {
						additionalExtensionPaths: extensionPaths,
					}),
					...(skillsOverride && { skillsOverride }),
					...(!def.projectContext && {
						agentsFilesOverride: () => ({ agentsFiles: [] }),
					}),
				});
				await loader.reload();

				// Build session options, conditionally adding settingsManager for compaction
				const sessionOptions: Parameters<typeof createAgentSession>[0] = {
					cwd: config.cwd,
					model,
					tools,
					sessionManager: SessionManager.inMemory(),
					resourceLoader: loader,
					thinkingLevel,
				};

				if (config.compaction) {
					sessionOptions.settingsManager = SettingsManager.inMemory({
						compaction: {
							enabled: config.compaction.enabled,
							...(config.compaction.keepRecentTokens !== undefined && {
								keepRecentTokens: config.compaction.keepRecentTokens,
							}),
						},
					});
				}

				const { session } = await createAgentSession(sessionOptions);

				// Subscribe to session events before prompt for progress streaming
				const unsubscribe = config.onEvent
					? session.subscribe((event) => {
							const mapped = mapSessionEvent(event);
							if (mapped) {
								try {
									config.onEvent?.(attachSessionId(mapped, session.sessionId));
								} catch {
									// Listeners must not break the spawner.
								}
							}
						})
					: undefined;

				try {
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

/**
 * Resolve a "provider/model-id" string into a Pi Model object.
 * Throws if the model is not found in the registry.
 */
export function resolveModel(modelId: string) {
	const slashIndex = modelId.indexOf("/");
	if (slashIndex === -1) {
		throw new Error(
			`Invalid model ID "${modelId}": expected "provider/model" format`,
		);
	}

	const provider = modelId.slice(0, slashIndex);
	const id = modelId.slice(slashIndex + 1);

	const model = getModel(
		provider as Parameters<typeof getModel>[0],
		id as never,
	);
	if (!model) {
		throw new Error(`Model not found: provider="${provider}", id="${id}"`);
	}

	return model;
}
