/**
 * Factory for creating Pi agent sessions from agent definitions.
 * Encapsulates all session setup logic: prompt assembly, tool resolution,
 * extension loading, skill overrides, and compaction configuration.
 */

import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { appendAgentIdentityMarker, qualifyAgentId } from "../agents/index.ts";
import { buildSkillsOverride } from "../agents/skills.ts";
import type { AgentDefinition } from "../agents/types.ts";
import { assemblePrompts } from "../domains/prompt-assembly.ts";
import {
	resolveExtensionPaths,
	resolveTools,
} from "./definition-resolution.ts";
import { FALLBACK_MODEL, resolveModel } from "./model-resolution.ts";
import type { SpawnConfig } from "./types.ts";

// ============================================================================
// Session Factory
// ============================================================================

/**
 * Create a configured Pi AgentSession from an agent definition and spawn config.
 *
 * Handles: model resolution, tool selection, prompt assembly, identity marking,
 * extension loading, skill overrides, resource loader setup, and compaction.
 *
 * Does NOT prompt the session — caller is responsible for session lifecycle.
 */
export async function createAgentSessionFromDefinition(
	def: AgentDefinition,
	config: SpawnConfig,
	domainsDir: string,
): Promise<AgentSession> {
	const modelId = config.model ?? def.model ?? FALLBACK_MODEL;
	const model = resolveModel(modelId);
	const thinkingLevel = config.thinkingLevel ?? def.thinkingLevel;

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

	// Extensions: domain-aware resolution with shared fallback.
	const extensionPaths = resolveExtensionPaths(def.extensions, {
		domain: def.domain ?? "coding",
		domainsDir,
	});

	// Build resource loader with all definition fields.
	const skillsOverride = buildSkillsOverride(def.skills, config.projectSkills);
	const additionalSkillPaths = config.skillPaths?.length
		? [...config.skillPaths]
		: undefined;
	const loader = new DefaultResourceLoader({
		cwd: config.cwd,
		...(promptContent && { systemPrompt: promptContent }),
		noExtensions: true,
		noSkills: true,
		...(extensionPaths.length > 0 && {
			additionalExtensionPaths: extensionPaths,
		}),
		...(skillsOverride && { skillsOverride }),
		...(additionalSkillPaths && { additionalSkillPaths }),
		...(!def.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	});
	await loader.reload();

	// Build session options, conditionally adding settingsManager for compaction.
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
	return session;
}
