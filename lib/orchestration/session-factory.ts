/**
 * Factory for creating Pi agent sessions from agent definitions.
 * Encapsulates all session setup logic: prompt assembly, tool resolution,
 * extension loading, skill overrides, and compaction configuration.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	type AgentSession,
	type CreateAgentSessionOptions,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { buildSessionParams } from "../agents/session-assembly.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { sessionsDirForPlan } from "../sessions/session-store.ts";
import {
	assertEnabledRecallOwner,
	buildToolAllowlist,
} from "./definition-resolution.ts";
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
	resolvedModel: { provider: string; id: string };
	/** Absolute path to the JSONL session file, or undefined for in-memory sessions. */
	sessionFilePath: string | undefined;
}

async function createSessionManager(config: SpawnConfig): Promise<{
	sessionManager: SessionManager;
	sessionFilePath: string | undefined;
}> {
	let sessionFilePath: string | undefined;
	if (config.sessionPolicy?.transcriptPath) {
		sessionFilePath = await config.sessionPolicy.transcriptPath();
	} else if (config.planSlug) {
		validateSlug(config.planSlug);
		const sessionsDir = sessionsDirForPlan(config.cwd, config.planSlug);
		const uuid = crypto.randomUUID();
		sessionFilePath = join(sessionsDir, `${config.role}-${uuid}.jsonl`);
		await mkdir(sessionsDir, { recursive: true });
	}
	return {
		sessionManager: sessionFilePath
			? SessionManager.open(sessionFilePath)
			: SessionManager.inMemory(),
		sessionFilePath,
	};
}

async function createResourceLoader(
	config: SpawnConfig,
	domainsDir: string,
	params: Awaited<ReturnType<typeof buildSessionParams>>,
): Promise<{
	loader: DefaultResourceLoader;
	policySettings: SettingsManager | undefined;
}> {
	const policyOptions = (await config.sessionPolicy?.resourceOptions?.(
		params,
		domainsDir,
	)) as
		| Partial<
				NonNullable<ConstructorParameters<typeof DefaultResourceLoader>[0]>
		  >
		| undefined;
	const policySettings = config.sessionPolicy?.settingsManager?.() as
		| SettingsManager
		| undefined;
	const loader = new DefaultResourceLoader({
		cwd: config.cwd,
		agentDir: getAgentDir(),
		...(policySettings && { settingsManager: policySettings }),
		...(params.promptContent && { systemPrompt: params.promptContent }),
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: params.extensionPaths,
		extensionFactories: params.extensionFactories,
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...(!params.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
		...policyOptions,
	});
	await loader.reload();
	if (params.knowledgeSurfaceEnabled)
		assertEnabledRecallOwner(loader, params.recallEnabled);
	return { loader, policySettings };
}

export async function createAgentSessionFromDefinition(
	def: AgentDefinition,
	config: SpawnConfig,
	domainsDir: string,
	resolver?: DomainResolver,
): Promise<SessionCreateResult> {
	const modelRuntime = await ModelRuntime.create();
	const modelRegistry = new ModelRegistry(modelRuntime);
	const skillPaths = config.sessionPolicy?.prepareSkills
		? await config.sessionPolicy.prepareSkills(config.skillPaths, domainsDir)
		: config.skillPaths;
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
		skillPaths,
		modelOverride: config.model,
		modelRegistry,
		thinkingLevelOverride: config.thinkingLevel,
		sessionPolicy: config.sessionPolicy,
		loadConfig: config.sessionPolicy?.loadConfig,
	});

	const { loader, policySettings } = await createResourceLoader(
		config,
		domainsDir,
		params,
	);

	const resolvedTools = buildToolAllowlist(
		params.tools,
		loader,
		params.exactTools,
	);
	const toolAllowlist = config.sessionPolicy?.filterTools
		? config.sessionPolicy.filterTools(resolvedTools)
		: resolvedTools;

	// Determine session manager: file-backed when planSlug is set, in-memory otherwise.
	const { sessionManager, sessionFilePath } =
		await createSessionManager(config);

	// Build session options, conditionally adding settingsManager for compaction.
	const sessionOptions: CreateAgentSessionOptions = {
		cwd: config.cwd,
		model: params.model,
		modelRuntime,
		tools: toolAllowlist,
		sessionManager,
		resourceLoader: loader,
		thinkingLevel: params.thinkingLevel,
	};

	if (policySettings) {
		sessionOptions.settingsManager = policySettings;
	} else if (config.compaction) {
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
	const resolvedModel = session.model;
	if (!resolvedModel?.provider || !resolvedModel.id)
		throw new Error("Pi session did not expose a resolved model");
	return {
		session,
		sessionFilePath,
		resolvedModel: { provider: resolvedModel.provider, id: resolvedModel.id },
	};
}
