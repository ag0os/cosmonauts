import { splitRole } from "./qualified-role.ts";
/**
 * Shared session parameter builder for all agent session creation paths.
 *
 * Encapsulates the assembly logic that was previously duplicated between
 * cli/session.ts and lib/orchestration/session-factory.ts.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	type DefaultResourceLoader,
	type InlineExtension,
	isToolCallEventType,
	type ModelRegistry,
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
import { resolveTools } from "../orchestration/definition-resolution.ts";
import {
	requireModelId,
	resolveModel,
} from "../orchestration/model-resolution.ts";
import { resolveMemoryGrants, validateAgentDefinition } from "./declaration.ts";
import {
	isDestructiveGitCommand,
	latestDriveSnapshot,
} from "./drive-worker-tool-guard.ts";
import { bindSessionExtensions } from "./extension-assembly.ts";
import { buildMemoryExtensions } from "./memory-assembly.ts";
import {
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "./runtime-identity.ts";
import type { SessionPolicy } from "./session-policy.ts";
import {
	buildSkillsOverride,
	resolveEffectiveProjectSkills,
	resolveHiddenSkillNames,
} from "./skills.ts";
import type { AgentDefinition } from "./types.ts";

// ============================================================================
// Interfaces
// ============================================================================

type PiResourceLoaderOptions = NonNullable<
	ConstructorParameters<typeof DefaultResourceLoader>[0]
>;

export interface BuildSessionParamsOptions {
	runtime?: import("../runtime.ts").CosmonautsRuntime;
	/** Agent definition. */
	def: AgentDefinition;
	/** Working directory. */
	cwd: string;
	/** Absolute path to the root domains directory (required when no resolver). */
	domainsDir?: string;
	/** Explicit directory fallback resource providers. */
	fallbackDomains?: readonly string[];
	/** Explicit default for directory-only resource lookup. */
	defaultDomain?: string;
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
	/** Consumer model policy, used only when the definition omits a model. */
	defaultModel?: string;
	/** Pi model registry, including custom models from models.json. */
	modelRegistry?: ModelRegistry;
	/** Thinking level override. Falls back to def.thinkingLevel. */
	thinkingLevelOverride?: ThinkingLevel;
	/** Additional extension paths to append after resolved def.extensions paths. */
	extraExtensionPaths?: readonly string[];
	/** Injectable project config loader for frozen gate tests. */
	loadConfig?: (projectRoot: string) => Promise<ProjectConfig>;
	/** Set only by the host when launching a panel child. */
	sessionPolicy?: SessionPolicy;
}

export interface SessionParams {
	exactTools?: boolean;
	recallEnabled?: boolean;
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
	/**
	 * Skill filter callback for DefaultResourceLoader, or undefined for
	 * unrestricted access. Typed as Pi's, so a Pi bump the local
	 * `SkillsOverrideFn` no longer fits fails typecheck here.
	 */
	skillsOverride: PiResourceLoaderOptions["skillsOverride"];
	/** Additional skill directory paths, or undefined if none. */
	additionalSkillPaths: string[] | undefined;
	/** Whether to load project context (AGENTS.md / CLAUDE.md). */
	projectContext: boolean;
	/** Resolved Pi Model object. */
	model: Model<Api>;
	/**
	 * Thinking level, or undefined to use Pi's default. Typed as Pi's, so a Pi
	 * bump the local `AgentDefinition.thinkingLevel` no longer fits fails
	 * typecheck here.
	 */
	thinkingLevel: ThinkingLevel | undefined;
	sessionPolicy?: SessionPolicy;
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
		modelRegistry,
		thinkingLevelOverride,
		extraExtensionPaths,
		loadConfig = loadProjectConfig,
		sessionPolicy,
	} = options;
	validateAgentDefinition(def);
	sessionPolicy?.validateDefinition?.(def);

	const identity = splitRole(qualifyAgentId(def.id, def.domain));

	// Tool resolution
	const tools = resolveTools(
		sessionPolicy?.toolPreset && typeof def.tools === "string"
			? sessionPolicy.toolPreset
			: def.tools,
		cwd,
	);
	const resourceDomain =
		def.instructions && !identity.domain && !def.resourceDomain
			? undefined
			: resolveDefaultDomain({
					explicitDomain: def.resourceDomain ?? identity.domain,
					defaultDomain: options.defaultDomain,
					resolver,
					purpose: `session parameters for agent "${qualifyAgentId(def.id, def.domain)}"`,
				});

	// Four-layer prompt assembly
	let promptContent: string | undefined = await assemblePrompts({
		agentId: identity.id,
		domain: resourceDomain,
		fallbackDomains: options.fallbackDomains,
		capabilities: def.capabilities,
		domainsDir,
		frameworkPromptsDir,
		resolver,
		runtimeContext,
		instructions: def.instructions,
		cwd,
	});

	// Embed runtime identity marker for extension-level authorization checks
	promptContent = appendAgentIdentityMarker(
		promptContent,
		qualifyAgentId(def.id, def.domain),
	);

	const knowledgeSurfaceEnabled = resolveKnowledgeSurfaceConfig(
		await loadConfig(cwd),
	).enabled;
	const memoryExtensions = buildMemoryExtensions(def, knowledgeSurfaceEnabled);
	const selected = await bindSessionExtensions({
		names: def.extensions,
		domain: resourceDomain,
		fallbackDomains: options.fallbackDomains,
		domainsDir,
		resolver,
		context: {
			runtime: options.runtime,
			agentId: qualifyAgentId(def.id, def.domain),
			memory: resolveMemoryGrants(def.memory),
		},
	});
	const extensionPaths = [...selected.paths, ...(extraExtensionPaths ?? [])];
	const extensionFactories: InlineExtension[] = [
		...memoryExtensions.factories,
		...selected.factories,
	];

	if (runtimeContext?.parentRole === "driver") {
		extensionFactories.push((pi) => {
			pi.on("tool_call", (event) => {
				if (
					!isToolCallEventType("bash", event) ||
					!isDestructiveGitCommand(event.input.command)
				)
					return;
				const ref = latestDriveSnapshot(cwd, runtimeContext.taskId);
				return {
					block: true,
					reason: `Drive safety rule: destructive Git is blocked to protect uncommitted work. ${ref ? `Recover the previous attempt from ${ref}.` : "There is no snapshot available for this task."} Use git status/diff and targeted edits instead.`,
				};
			});
		});
	}
	if (typeof def.tools !== "string") {
		const granted = new Set(tools);
		extensionFactories.push((pi) => {
			pi.on("tool_call", (event) => {
				if (!granted.has(event.toolName)) {
					return {
						block: true,
						reason: `Tool is outside the declared grant: ${event.toolName}`,
					};
				}
			});
		});
	}

	// Skill override construction
	const effectiveProjectSkills = ignoreProjectSkills
		? undefined
		: await resolveEffectiveProjectSkills({
				fallbackDomains: options.fallbackDomains,
				projectSkills,
				domainsDir,
				resolver,
				agent: { skills: def.skills, domain: identity.domain },
			});
	const hiddenSkillNames = resolveHiddenSkillNames({
		requesterDomain: identity.domain,
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
	const modelId = resolveSessionModelId(options);
	const model = resolveModel(modelId, modelRegistry);

	// Thinking level resolution: override → definition → undefined (Pi default)
	const thinkingLevel = thinkingLevelOverride ?? def.thinkingLevel;

	return {
		exactTools: typeof def.tools !== "string",
		recallEnabled: memoryExtensions.recallEnabled,
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
		sessionPolicy,
	};
}

function resolveSessionModelId(options: BuildSessionParamsOptions): string {
	return requireModelId(
		options.modelOverride ??
			options.def.model ??
			options.defaultModel ??
			options.runtime?.defaultModel,
	);
}
