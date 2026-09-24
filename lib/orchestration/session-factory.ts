/**
 * Factory for creating Pi agent sessions from agent definitions.
 * Encapsulates all session setup logic: prompt assembly, tool resolution,
 * extension loading, skill overrides, and compaction configuration.
 */

import { mkdir, readFile, realpath, stat } from "node:fs/promises";
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
import { loadProjectConfig } from "../config/loader.ts";
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

function isInside(root: string, path: string): boolean {
	const suffix = relative(root, path);
	return (
		suffix === "" ||
		(suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
	);
}

function qualitySkillCandidate(
	path: string,
	canonicalPath: string,
	baseProjectRoot: string | undefined,
	canonicalSourceRoot: string | undefined,
	domainsDir: string,
): string | undefined {
	if (!isAbsolute(path))
		return baseProjectRoot ? resolve(baseProjectRoot, path) : undefined;
	if (
		canonicalSourceRoot &&
		baseProjectRoot &&
		isInside(canonicalSourceRoot, canonicalPath)
	)
		return resolve(
			baseProjectRoot,
			relative(canonicalSourceRoot, canonicalPath),
		);
	if (baseProjectRoot && isInside(baseProjectRoot, canonicalPath))
		return canonicalPath;
	return isInside(resolve(domainsDir, ".."), canonicalPath)
		? canonicalPath
		: undefined;
}

async function resolveQualitySkillPaths(
	config: SpawnConfig,
	domainsDir: string,
): Promise<string[] | undefined> {
	const sourceRoot = config.qualityReviewContext?.sourceRoot;
	const canonicalSourceRoot = sourceRoot
		? await realpath(sourceRoot).catch(() => sourceRoot)
		: undefined;
	if (!config.qualityReviewContext || !config.skillPaths)
		return config.skillPaths;
	const baseProjectRoot = config.qualityReviewContext.baseProjectRoot;
	const paths = await Promise.all(
		config.skillPaths.map(async (path) => {
			const canonicalPath = await realpath(path).catch(() => path);
			const candidate = qualitySkillCandidate(
				path,
				canonicalPath,
				baseProjectRoot,
				canonicalSourceRoot,
				domainsDir,
			);
			if (
				candidate &&
				(await stat(candidate).catch(() => undefined))?.isDirectory()
			)
				return candidate;
			config.qualityReviewContext?.omittedSkillPaths?.push(path);
			return undefined;
		}),
	);
	return paths.filter((path): path is string => path !== undefined);
}

async function baseAgentFiles(
	baseProjectRoot: string | undefined,
	projectContext: boolean,
) {
	if (!baseProjectRoot || !projectContext) return [];
	const files = await Promise.all(
		["AGENTS.md", "CLAUDE.md"].map(async (name) => {
			const path = join(baseProjectRoot, name);
			const content = await readFile(path, "utf8").catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return undefined;
					throw error;
				},
			);
			return content === undefined ? undefined : { path, content };
		}),
	);
	return files.filter(
		(file): file is { path: string; content: string } => file !== undefined,
	);
}

async function createSessionManager(config: SpawnConfig): Promise<{
	sessionManager: SessionManager;
	sessionFilePath: string | undefined;
}> {
	let sessionFilePath: string | undefined;
	if (config.qualityReviewContext) {
		const sessionsDir = join(
			config.qualityReviewContext.hostRunStoreRoot,
			"transcripts",
		);
		const uuid = crypto.randomUUID();
		sessionFilePath = join(sessionsDir, `quality-session-${uuid}.jsonl`);
		await mkdir(sessionsDir, { recursive: true });
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
	qualitySettings: SettingsManager | undefined;
}> {
	const baseProjectRoot = config.qualityReviewContext?.baseProjectRoot;
	const baseAgentsFiles = await baseAgentFiles(
		baseProjectRoot,
		params.projectContext,
	);
	const qualitySettings = config.qualityReviewContext
		? SettingsManager.inMemory()
		: undefined;
	qualitySettings?.setProjectTrusted(false);
	const loader = new DefaultResourceLoader({
		cwd: config.cwd,
		agentDir: getAgentDir(),
		...(qualitySettings && { settingsManager: qualitySettings }),
		...(params.promptContent && { systemPrompt: params.promptContent }),
		...(config.qualityReviewContext && { appendSystemPrompt: [] }),
		noExtensions: true,
		noSkills: true,
		...resourceExtensionOptions(config, domainsDir, params),
		...resourceSkillOptions(params, baseProjectRoot, baseAgentsFiles),
	});
	await loader.reload();
	if (params.knowledgeSurfaceEnabled) assertEnabledRecallOwner(loader);
	return { loader, qualitySettings };
}

function resourceExtensionOptions(
	config: SpawnConfig,
	domainsDir: string,
	params: Awaited<ReturnType<typeof buildSessionParams>>,
) {
	const qualityAnalysis = config.qualityReviewContext?.analysisConsent;
	const projectToolsPath = join(
		domainsDir,
		"shared",
		"extensions",
		"project-tools",
	);
	const extensionPaths = qualityAnalysis
		? params.extensionPaths.filter((path) => path !== projectToolsPath)
		: params.extensionPaths;
	return {
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
	};
}

function resourceSkillOptions(
	params: Awaited<ReturnType<typeof buildSessionParams>>,
	baseProjectRoot: string | undefined,
	baseAgentsFiles: Awaited<ReturnType<typeof baseAgentFiles>>,
) {
	return {
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...((!params.projectContext || baseProjectRoot) && {
			agentsFilesOverride: () => ({ agentsFiles: baseAgentsFiles }),
		}),
	};
}

export async function createAgentSessionFromDefinition(
	def: AgentDefinition,
	config: SpawnConfig,
	domainsDir: string,
	resolver?: DomainResolver,
): Promise<SessionCreateResult> {
	const authStorage = AuthStorage.create();
	const modelRegistry = ModelRegistry.create(authStorage);
	const skillPaths = await resolveQualitySkillPaths(config, domainsDir);
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
		...(config.qualityReviewContext?.baseProjectRoot
			? {
					loadConfig: () =>
						loadProjectConfig(
							config.qualityReviewContext?.baseProjectRoot ?? "",
						),
				}
			: {}),
	});

	const { loader, qualitySettings } = await createResourceLoader(
		config,
		domainsDir,
		params,
	);

	const resolvedTools = buildToolAllowlist(params.tools, loader);
	const toolAllowlist = params.qualityReviewProfile
		? enforceQualityReviewProfile(resolvedTools, params.qualityReviewProfile)
		: resolvedTools;

	// Determine session manager: file-backed when planSlug is set, in-memory otherwise.
	const { sessionManager, sessionFilePath } =
		await createSessionManager(config);

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

	if (qualitySettings) {
		sessionOptions.settingsManager = qualitySettings;
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
