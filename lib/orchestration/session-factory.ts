/**
 * Factory for creating Pi agent sessions from agent definitions.
 * Encapsulates all session setup logic: prompt assembly, tool resolution,
 * extension loading, skill overrides, and compaction configuration.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { buildSessionParams } from "../agents/session-assembly.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { sessionsDirForPlan } from "../sessions/session-store.ts";
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
export interface SessionCreateResult {
	session: AgentSession;
	/** Absolute path to the JSONL session file, or undefined for in-memory sessions. */
	sessionFilePath: string | undefined;
}

export async function createAgentSessionFromDefinition(
	def: AgentDefinition,
	config: SpawnConfig,
	domainsDir: string,
	resolver?: DomainResolver,
): Promise<SessionCreateResult> {
	const params = await buildSessionParams({
		def,
		cwd: config.cwd,
		domainsDir,
		resolver,
		runtimeContext:
			config.runtimeContext?.mode === "sub-agent"
				? {
						mode: "sub-agent",
						parentRole: config.runtimeContext.parentRole,
						objective: config.runtimeContext.objective,
						taskId: config.runtimeContext.taskId,
					}
				: undefined,
		projectSkills: config.projectSkills,
		skillPaths: config.skillPaths,
		modelOverride: config.model,
		thinkingLevelOverride: config.thinkingLevel,
	});

	// Build resource loader with all definition fields.
	const loader = new DefaultResourceLoader({
		cwd: config.cwd,
		...(params.promptContent && { systemPrompt: params.promptContent }),
		noExtensions: true,
		noSkills: true,
		...(params.extensionPaths.length > 0 && {
			additionalExtensionPaths: params.extensionPaths,
		}),
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...(!params.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	});
	await loader.reload();

	// Determine session manager: file-backed when planSlug is set, in-memory otherwise.
	let sessionFilePath: string | undefined;
	let sessionManager: SessionManager;
	if (config.planSlug) {
		validateSlug(config.planSlug);
		const sessionsDir = sessionsDirForPlan(config.cwd, config.planSlug);
		const uuid = crypto.randomUUID();
		sessionFilePath = join(sessionsDir, `${config.role}-${uuid}.jsonl`);
		await mkdir(sessionsDir, { recursive: true });
		sessionManager = SessionManager.open(sessionFilePath);
	} else {
		sessionManager = SessionManager.inMemory();
	}

	// Build session options, conditionally adding settingsManager for compaction.
	const sessionOptions: Parameters<typeof createAgentSession>[0] = {
		cwd: config.cwd,
		model: params.model,
		tools: params.tools,
		sessionManager,
		resourceLoader: loader,
		thinkingLevel: params.thinkingLevel,
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
	return { session, sessionFilePath };
}
