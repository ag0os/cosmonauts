/**
 * Shared session parameter builder for all agent session creation paths.
 *
 * Encapsulates the assembly logic that was previously duplicated between
 * cli/session.ts and lib/orchestration/session-factory.ts.
 */

import { join } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { RuntimeContext } from "../domains/prompt-assembly.ts";
import { assemblePrompts } from "../domains/prompt-assembly.ts";
import type { DomainResolver } from "../domains/resolver.ts";
import type { LoadedDomain } from "../domains/types.ts";
import {
	resolveExtensionPaths,
	resolveTools,
} from "../orchestration/definition-resolution.ts";
import {
	FALLBACK_MODEL,
	resolveModel,
} from "../orchestration/model-resolution.ts";
import { discoverSkills } from "../skills/discovery.ts";
import {
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "./runtime-identity.ts";
import { buildSkillsOverride, type SkillsOverrideFn } from "./skills.ts";
import type { AgentDefinition } from "./types.ts";

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
	/** Thinking level override. Falls back to def.thinkingLevel. */
	thinkingLevelOverride?: ThinkingLevel;
	/** Additional extension paths to append after resolved def.extensions paths. */
	extraExtensionPaths?: readonly string[];
}

export interface SessionParams {
	/** Assembled and identity-marked system prompt content. */
	promptContent: string;
	/** Resolved Pi tool instances. */
	tools: ReturnType<typeof resolveTools>;
	/** Absolute paths to Pi extension directories. */
	extensionPaths: string[];
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
// Helpers
// ============================================================================

function buildSyntheticSharedDomain(domainsDir: string): LoadedDomain {
	return {
		manifest: {
			id: "shared",
			description: "shared",
		},
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: [join(domainsDir, "shared")],
	};
}

async function listSharedSkillNames(options: {
	domainsDir?: string;
	resolver?: DomainResolver;
}): Promise<readonly string[]> {
	const sharedDomain =
		options.resolver?.registry.get("shared") ??
		(options.domainsDir
			? buildSyntheticSharedDomain(options.domainsDir)
			: undefined);
	if (!sharedDomain) return [];

	const skills = await discoverSkills([sharedDomain]);
	return [...new Set(skills.map((skill) => skill.name))];
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
		resolver,
		runtimeContext,
		projectSkills,
		skillPaths,
		ignoreProjectSkills,
		modelOverride,
		thinkingLevelOverride,
		extraExtensionPaths,
	} = options;

	// Tool resolution
	const tools = resolveTools(def.tools, cwd);

	// Four-layer prompt assembly
	let promptContent: string | undefined = await assemblePrompts({
		agentId: def.id,
		domain: def.domain ?? "coding",
		capabilities: def.capabilities,
		domainsDir,
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
		domain: def.domain ?? "coding",
		domainsDir,
		resolver,
	});
	const extensionPaths = extraExtensionPaths?.length
		? [...resolvedExtensionPaths, ...extraExtensionPaths]
		: resolvedExtensionPaths;

	// Skill override construction
	const effectiveProjectSkills =
		ignoreProjectSkills || projectSkills === undefined
			? undefined
			: [
					...(await listSharedSkillNames({ domainsDir, resolver })),
					...projectSkills,
				];
	const skillsOverride = buildSkillsOverride(
		def.skills,
		effectiveProjectSkills,
	);
	const additionalSkillPaths = skillPaths?.length ? [...skillPaths] : undefined;

	// Model resolution: override → definition → fallback
	const modelId = modelOverride ?? def.model ?? FALLBACK_MODEL;
	const model = resolveModel(modelId);

	// Thinking level resolution: override → definition → undefined (Pi default)
	const thinkingLevel = thinkingLevelOverride ?? def.thinkingLevel;

	return {
		promptContent,
		tools,
		extensionPaths,
		skillsOverride,
		additionalSkillPaths,
		projectContext: def.projectContext,
		model,
		thinkingLevel,
	};
}
