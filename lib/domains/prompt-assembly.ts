import { directoryResourcePaths } from "./resource-paths.ts";
/**
 * Convention-based four-layer prompt assembly for agents.
 *
 * Assembles a full system prompt from domain directories using a strict
 * four-layer order:
 *
 *   Layer 0: consumer base.md (only with explicit frameworkPromptsDir)
 *   Layer 1: domains/{domain}/capabilities/{cap}.md       (per capability)
 *            → three-tier resolution via resolver (domain → portable → declared fallback)
 *              OR declared directory fallback when no resolver is provided
 *   Layer 2: explicit instructions, or domain persona convention
 *   Layer 3: consumer-supplied sub-agent template          (sub-agent mode only)
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { stripAgentIdentityMarkers } from "../agents/runtime-identity.ts";
import type { AgentInstructions } from "../agents/types.ts";
import type { RuntimeTemplateContext } from "../prompts/loader.ts";
import { renderRuntimeTemplate } from "../prompts/loader.ts";
import type { DomainResolver } from "./resolver.ts";

// ============================================================================
// Public Types
// ============================================================================

export interface RuntimeContext {
	mode: "top-level" | "sub-agent";
	parentRole?: string;
	objective?: string;
	taskId?: string;
}

export interface AssemblePromptsOptions {
	instructions?: AgentInstructions;
	cwd?: string;
	/** The agent's unqualified ID (e.g. "worker"). */
	agentId: string;
	/** The agent's domain (e.g. "coding"). */
	domain?: string;
	/** Explicit fallback identities for directory-only resource lookup. */
	fallbackDomains?: readonly string[];
	/** Capability pack names (e.g. ["tasks", "coding-readwrite", "spawning"]). */
	capabilities: readonly string[];
	/** Absolute path to the domains/ directory. Required when no resolver is provided. */
	domainsDir?: string;
	/** Consumer prompt directory whose base.md becomes layer 0; no default. */
	frameworkPromptsDir?: string;
	/** Optional runtime context for sub-agent mode. */
	runtimeContext?: RuntimeContext;
	/** Sub-agent runtime template text; without it no layer 3 is added. */
	subAgentTemplate?: string;
	/**
	 * Optional domain resolver for three-tier capability lookup
	 * (agent domain → portable domains → shared). When omitted,
	 * falls back to declared directory-based resolution (domain → declared fallback)
	 * using domainsDir (which must be provided in that case).
	 */
	resolver?: DomainResolver;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Assemble the full system prompt for an agent using four-layer convention.
 *
 * @returns Concatenated system prompt string
 */
export async function assemblePrompts(
	options: AssemblePromptsOptions,
): Promise<string> {
	const {
		domain,
		capabilities,
		domainsDir,
		runtimeContext,
		subAgentTemplate,
		resolver,
	} = options;
	const parts: string[] = [];

	// domainsDir is required when resolver is absent (or when resolver returns
	// undefined for a path). Validate once and narrow to string for all uses below.
	if (
		domainsDir === undefined &&
		!resolver &&
		(!options.instructions || capabilities.length > 0)
	) {
		throw new Error("domainsDir is required when no resolver is provided");
	}

	// Layer 0: An explicitly supplied consumer base
	if (options.frameworkPromptsDir) {
		const basePath = join(options.frameworkPromptsDir, "base.md");
		parts.push(await loadPromptFile(basePath));
	}

	// Layer 1: Capabilities
	// With resolver: three-tier (agent domain → portable domains → shared).
	// Without resolver: declared directory-based (domain → declared fallback).
	for (const cap of capabilities) {
		const content = await loadCapability(cap, options);
		if (content === null) {
			throw new Error(
				`Capability "${cap}" not found in domain "${domain}" or declared fallback providers`,
			);
		}
		parts.push(content);
	}

	parts.push(await loadPersona(options));

	// Layer 3: Runtime context (sub-agent mode with a consumer template only)
	if (runtimeContext?.mode === "sub-agent" && subAgentTemplate !== undefined) {
		const ctx: RuntimeTemplateContext = {
			parentRole: runtimeContext.parentRole,
			objective: runtimeContext.objective,
			taskId: runtimeContext.taskId,
		};
		parts.push(renderRuntimeTemplate(subAgentTemplate, ctx));
	}

	return parts.join("\n\n");
}

async function loadCapability(
	cap: string,
	options: AssemblePromptsOptions,
): Promise<string | null> {
	if (options.resolver) {
		const path = options.resolver.resolveCapabilityPath(cap, options.domain);
		return path ? loadPromptFile(path) : null;
	}
	return loadWithFallback(
		directoryResourcePaths({
			...options,
			kind: "capabilities",
			filename: `${cap}.md`,
		}),
	);
}

async function loadPersona(options: AssemblePromptsOptions): Promise<string> {
	if (options.instructions) {
		const source = options.instructions;
		const content =
			source.kind === "inline"
				? source.content
				: await loadPromptFile(
						resolve(options.cwd ?? process.cwd(), source.path),
					);
		return stripAgentIdentityMarkers(content);
	}
	const resolved = options.resolver?.resolvePersonaPath(
		options.agentId,
		options.domain,
	);
	if (resolved) return loadPromptFile(resolved);
	const content = await loadWithFallback(
		directoryResourcePaths({
			...options,
			kind: "prompts",
			filename: `${options.agentId}.md`,
		}),
	);
	if (content === null)
		throw new Error(
			`Persona prompt for agent "${options.agentId}" not found in declared resource providers.`,
		);
	return content;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load a prompt file, stripping YAML frontmatter if present.
 *
 * @throws If the file does not exist or cannot be read
 */
async function loadPromptFile(filePath: string): Promise<string> {
	const raw = await readFile(filePath, "utf-8");
	return stripFrontmatter(raw);
}

/**
 * Try loading from the primary path, falling back to the secondary path.
 *
 * @returns File content (frontmatter-stripped), or null if neither exists
 */
async function loadWithFallback(
	paths: readonly string[],
): Promise<string | null> {
	for (const path of paths) {
		try {
			return await loadPromptFile(path);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return null;
}

/** Strip YAML frontmatter from content if present. */
function stripFrontmatter(raw: string): string {
	const { content } = matter(raw);
	return content.trimStart();
}
