/**
 * Shared session parameter builder for all agent session creation paths.
 *
 * Encapsulates the assembly logic that was previously duplicated between
 * cli/session.ts and lib/orchestration/session-factory.ts.
 */

import { join, resolve } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	InlineExtension,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
	loadProjectConfig,
	resolveKnowledgeSurfaceConfig,
} from "../config/index.ts";
import type { ProjectConfig } from "../config/types.ts";
import { resolveDefaultDomain } from "../domains/default-domain.ts";
import type { RuntimeContext } from "../domains/prompt-assembly.ts";
import { assemblePrompts } from "../domains/prompt-assembly.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import { createKnowledgeSurfaceSessionExtension } from "../extensions/knowledge-surface/session-extension.ts";
import {
	resolveExtensionPaths,
	resolveTools,
} from "../orchestration/definition-resolution.ts";
import {
	FALLBACK_MODEL,
	resolveModel,
} from "../orchestration/model-resolution.ts";
import {
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "./runtime-identity.ts";
import {
	buildSkillsOverride,
	resolveEffectiveProjectSkills,
	resolveHiddenSkillNames,
	type SkillsOverrideFn,
} from "./skills.ts";
import type { AgentDefinition } from "./types.ts";

const ARCHITECTURE_MEMORY_CONSUMERS = new Set([
	"coding/planner",
	"coding/plan-reviewer",
	"coding/coordinator",
	"coding/worker",
	"coding/quality-manager",
]);

// ============================================================================
// Interfaces
// ============================================================================

export interface BuildSessionParamsOptions {
	/** Agent definition. */
	def: AgentDefinition;
	/** Working directory. */
	cwd: string;
	/** Absolute path to the root domains directory (required when no resolver). */
	domainsDir?: string;
	/** Absolute path to framework prompt templates. Defaults to lib/prompts/framework. */
	frameworkPromptsDir?: string;
	/** Domain resolver for multi-source path resolution. Takes precedence over domainsDir. */
	resolver?: DomainResolver;
	/** Runtime context for sub-agent prompt layer injection. */
	runtimeContext?: RuntimeContext;
	/** Project-level skill filter list (from .cosmonauts/config.json). */
	projectSkills?: readonly string[];
	/** Explicit skill directories (domain dirs + config skillPaths). */
	skillPaths?: readonly string[];
	/** Ignore project-level skill filtering and expose the full discovered catalogue. */
	ignoreProjectSkills?: boolean;
	/** Model ID string override (e.g. "anthropic/claude-sonnet-4-5"). Falls back to def.model. */
	modelOverride?: string;
	/** Pi model registry, including custom models from models.json. */
	modelRegistry?: ModelRegistry;
	/** Thinking level override. Falls back to def.thinkingLevel. */
	thinkingLevelOverride?: ThinkingLevel;
	/** Additional extension paths to append after resolved def.extensions paths. */
	extraExtensionPaths?: readonly string[];
	/** Injectable project config loader for frozen gate tests. */
	loadConfig?: (projectRoot: string) => Promise<ProjectConfig>;
}

export interface SessionParams {
	/** Assembled and identity-marked system prompt content. */
	promptContent: string;
	/** Resolved Pi tool instances. */
	tools: ReturnType<typeof resolveTools>;
	/** Absolute paths to Pi extension directories. */
	extensionPaths: string[];
	/** Gate-selected inline factories supplied only by Cosmonauts assembly. */
	extensionFactories: InlineExtension[];
	/** Frozen gate selection for this assembled session. */
	knowledgeSurfaceEnabled: boolean;
	/** Skill filter callback for DefaultResourceLoader, or undefined for unrestricted access. */
	skillsOverride: SkillsOverrideFn | undefined;
	/** Additional skill directory paths, or undefined if none. */
	additionalSkillPaths: string[] | undefined;
	/** Whether to load project context (AGENTS.md / CLAUDE.md). */
	projectContext: boolean;
	/** Resolved Pi Model object. */
	model: Model<Api>;
	/** Thinking level, or undefined to use Pi's default. */
	thinkingLevel: ThinkingLevel | undefined;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build all Pi session parameters from an agent definition and options.
 *
 * Handles: prompt assembly, identity marking, tool resolution,
 * extension path resolution, skill overrides, model resolution,
 * and thinking level resolution.
 */
export async function buildSessionParams(
	options: BuildSessionParamsOptions,
): Promise<SessionParams> {
	const {
		def,
		cwd,
		domainsDir,
		frameworkPromptsDir,
		resolver,
		runtimeContext,
		projectSkills,
		skillPaths,
		ignoreProjectSkills,
		modelOverride,
		modelRegistry,
		thinkingLevelOverride,
		extraExtensionPaths,
		loadConfig = loadProjectConfig,
	} = options;

	// Tool resolution
	const tools = resolveTools(def.tools, cwd);
	const resourceDomain = resolveDefaultDomain({
		explicitDomain: def.domain,
		resolver,
		purpose: `session parameters for agent "${qualifyAgentId(def.id, def.domain)}"`,
	});

	// Four-layer prompt assembly
	let promptContent: string | undefined = await assemblePrompts({
		agentId: def.id,
		domain: resourceDomain,
		capabilities: def.capabilities,
		domainsDir,
		frameworkPromptsDir,
		resolver,
		runtimeContext,
	});

	// Embed runtime identity marker for extension-level authorization checks
	promptContent = appendAgentIdentityMarker(
		promptContent,
		qualifyAgentId(def.id, def.domain),
	);

	// Extension path resolution, with optional extra paths appended
	const resolvedExtensionPaths = resolveExtensionPaths(def.extensions, {
		domain: resourceDomain,
		domainsDir,
		resolver,
	});
	const knowledgeSurfaceEnabled = resolveKnowledgeSurfaceConfig(
		await loadConfig(cwd),
	).enabled;
	const sharedExtensionsDir = resolve(
		domainsDir ?? join(import.meta.dirname, "..", "..", "domains"),
		"shared",
		"extensions",
	);
	const exactAgentMemoryPath = join(sharedExtensionsDir, "agent-memory");
	const exactArchitectureMemoryPath = join(
		sharedExtensionsDir,
		"architecture-memory",
	);
	const registerAgentMemoryTools = resolvedExtensionPaths.some(
		(path) => resolve(path) === exactAgentMemoryPath,
	);
	const registerArchitectureTool = resolvedExtensionPaths.some(
		(path) => resolve(path) === exactArchitectureMemoryPath,
	);
	const retainedResolvedPaths = knowledgeSurfaceEnabled
		? resolvedExtensionPaths.filter((path) => {
				const normalized = resolve(path);
				return (
					normalized !== exactAgentMemoryPath &&
					normalized !== exactArchitectureMemoryPath
				);
			})
		: resolvedExtensionPaths;
	const extensionPaths = extraExtensionPaths?.length
		? [...retainedResolvedPaths, ...extraExtensionPaths]
		: retainedResolvedPaths;
	const agentId = qualifyAgentId(def.id, def.domain);
	const extensionFactories: InlineExtension[] = knowledgeSurfaceEnabled
		? [
				createKnowledgeSurfaceSessionExtension({
					agentId,
					registerAgentMemoryTools,
					authorizeAuthoredMemory:
						registerAgentMemoryTools && agentId === "main/cosmo",
					registerArchitectureTool,
					authorizeArchitecture:
						registerArchitectureTool &&
						ARCHITECTURE_MEMORY_CONSUMERS.has(agentId),
					recallOwner: registerAgentMemoryTools ? "agent-memory" : "knowledge",
					canPropose: agentId === "coding/distiller",
				}),
			]
		: [];

	// Skill override construction
	const effectiveProjectSkills = ignoreProjectSkills
		? undefined
		: await resolveEffectiveProjectSkills({
				projectSkills,
				domainsDir,
				resolver,
			});
	const hiddenSkillNames = resolveHiddenSkillNames({
		requesterDomain: resourceDomain,
		resolver,
	});
	const skillsOverride = buildSkillsOverride(
		def.skills,
		effectiveProjectSkills,
		{
			hiddenSkillNames,
		},
	);
	const additionalSkillPaths = skillPaths?.length ? [...skillPaths] : undefined;

	// Model resolution: override → definition → fallback
	const modelId = modelOverride ?? def.model ?? FALLBACK_MODEL;
	const model = resolveModel(modelId, modelRegistry);

	// Thinking level resolution: override → definition → undefined (Pi default)
	const thinkingLevel = thinkingLevelOverride ?? def.thinkingLevel;

	return {
		promptContent,
		tools,
		extensionPaths,
		extensionFactories,
		knowledgeSurfaceEnabled,
		skillsOverride,
		additionalSkillPaths,
		projectContext: def.projectContext,
		model,
		thinkingLevel,
	};
}
