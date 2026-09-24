/**
 * Factory for creating Pi agent sessions from agent definitions.
 * Encapsulates all session setup logic: prompt assembly, tool resolution,
 * extension loading, skill overrides, and compaction configuration.
 */

import { mkdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	type AgentSession,
	AuthStorage,
	type CreateAgentSessionOptions,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createProjectToolsExtension } from "../../domains/shared/extensions/project-tools/index.ts";
import { buildSessionParams } from "../agents/session-assembly.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { sessionsDirForPlan } from "../sessions/session-store.ts";
import {
	assertEnabledRecallOwner,
	buildToolAllowlist,
} from "./definition-resolution.ts";
import { enforceQualityReviewProfile } from "./quality-review-profile.ts";
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

export async function createAgentSessionFromDefinition(
	def: AgentDefinition,
	config: SpawnConfig,
	domainsDir: string,
	resolver?: DomainResolver,
): Promise<SessionCreateResult> {
	const authStorage = AuthStorage.create();
	const modelRegistry = ModelRegistry.create(authStorage);
	const sourceRoot = config.qualityReviewContext?.sourceRoot;
	const canonicalSourceRoot = sourceRoot
		? await realpath(sourceRoot).catch(() => sourceRoot)
		: undefined;
	const skillPaths =
		canonicalSourceRoot && config.skillPaths
			? (
					await Promise.all(
						config.skillPaths.map(async (path) => {
							const canonicalPath = await realpath(path).catch(() => path);
							const suffix = relative(canonicalSourceRoot, canonicalPath);
							if (
								suffix === "" ||
								(suffix !== ".." &&
									!suffix.startsWith(`..${sep}`) &&
									!isAbsolute(suffix))
							) {
								const clonePath = resolve(config.cwd, suffix);
								try {
									if ((await stat(clonePath)).isDirectory()) return clonePath;
								} catch {
									/* absent from clone */
								}
								config.qualityReviewContext?.omittedSkillPaths?.push(path);
								return undefined;
							}
							return path;
						}),
					)
				).filter((path): path is string => path !== undefined)
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
		qualityReviewChild: config.qualityReviewChild,
	});

	// Build resource loader with all definition fields.
	const projectToolsPath = join(
		domainsDir,
		"shared",
		"extensions",
		"project-tools",
	);
	const qualityAnalysis = config.qualityReviewContext?.analysisConsent;
	const extensionPaths = qualityAnalysis
		? params.extensionPaths.filter((path) => path !== projectToolsPath)
		: params.extensionPaths;
	const loader = new DefaultResourceLoader({
		cwd: config.cwd,
		agentDir: getAgentDir(),
		...(params.promptContent && { systemPrompt: params.promptContent }),
		noExtensions: true,
		noSkills: true,
		...(extensionPaths.length > 0 && {
			additionalExtensionPaths: extensionPaths,
		}),
		...(params.extensionFactories.length > 0 || qualityAnalysis
			? {
					extensionFactories: [
						...params.extensionFactories,
						...(qualityAnalysis
							? [
									createProjectToolsExtension({
										snapshotAuthorization: qualityAnalysis,
									}),
								]
							: []),
					],
				}
			: {}),
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...(!params.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	});
	await loader.reload();
	if (params.knowledgeSurfaceEnabled) {
		assertEnabledRecallOwner(loader);
	}

	const resolvedTools = buildToolAllowlist(params.tools, loader);
	const toolAllowlist = params.qualityReviewProfile
		? enforceQualityReviewProfile(resolvedTools, params.qualityReviewProfile)
		: resolvedTools;

	// Determine session manager: file-backed when planSlug is set, in-memory otherwise.
	let sessionFilePath: string | undefined;
	let sessionManager: SessionManager;
	if (config.qualityReviewContext) {
		const sessionsDir = join(
			config.qualityReviewContext.hostRunStoreRoot,
			"transcripts",
		);
		const uuid = crypto.randomUUID();
		sessionFilePath = join(sessionsDir, `quality-session-${uuid}.jsonl`);
		await mkdir(sessionsDir, { recursive: true });
		sessionManager = SessionManager.open(sessionFilePath);
	} else if (config.planSlug) {
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
	const sessionOptions: CreateAgentSessionOptions = {
		cwd: config.cwd,
		model: params.model,
		authStorage,
		modelRegistry,
		tools: toolAllowlist,
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
	const resolvedModel = session.model;
	if (!resolvedModel?.provider || !resolvedModel.id)
		throw new Error("Pi session did not expose a resolved model");
	return {
		session,
		sessionFilePath,
		resolvedModel: { provider: resolvedModel.provider, id: resolvedModel.id },
	};
}
