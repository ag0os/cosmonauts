/**
 * Convention-based four-layer prompt assembly for agents.
 *
 * Assembles a full system prompt from domain directories using a strict
 * four-layer order:
 *
 *   Layer 0: domains/shared/prompts/base.md              (always)
 *   Layer 1: domains/{domain}/capabilities/{cap}.md       (per capability, domain-first)
 *            → fallback: domains/shared/capabilities/{cap}.md
 *   Layer 2: domains/{domain}/prompts/{agent-id}.md       (auto-loaded persona)
 *   Layer 3: domains/shared/prompts/runtime/sub-agent.md  (if sub-agent mode)
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { renderRuntimeTemplate } from "../prompts/loader.ts";
import type { RuntimeTemplateContext } from "../prompts/loader.ts";

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
	/** The agent's unqualified ID (e.g. "worker"). */
	agentId: string;
	/** The agent's domain (e.g. "coding"). */
	domain: string;
	/** Capability pack names (e.g. ["core", "tasks", "coding-readwrite"]). */
	capabilities: readonly string[];
	/** Absolute path to the domains/ directory. */
	domainsDir: string;
	/** Optional runtime context for sub-agent mode. */
	runtimeContext?: RuntimeContext;
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
	const { agentId, domain, capabilities, domainsDir, runtimeContext } =
		options;
	const parts: string[] = [];

	// Layer 0: Base prompt (always from shared)
	parts.push(
		await loadPromptFile(
			join(domainsDir, "shared", "prompts", "base.md"),
		),
	);

	// Layer 1: Capabilities (domain-first, fallback to shared)
	for (const cap of capabilities) {
		const domainPath = join(
			domainsDir,
			domain,
			"capabilities",
			`${cap}.md`,
		);
		const sharedPath = join(
			domainsDir,
			"shared",
			"capabilities",
			`${cap}.md`,
		);
		const content = await loadWithFallback(domainPath, sharedPath);
		if (content === null) {
			throw new Error(
				`Capability "${cap}" not found in domain "${domain}" or shared`,
			);
		}
		parts.push(content);
	}

	// Layer 2: Agent persona prompt
	parts.push(
		await loadPromptFile(
			join(domainsDir, domain, "prompts", `${agentId}.md`),
		),
	);

	// Layer 3: Runtime context (sub-agent mode only)
	if (runtimeContext?.mode === "sub-agent") {
		const templatePath = join(
			domainsDir,
			"shared",
			"prompts",
			"runtime",
			"sub-agent.md",
		);
		const template = await loadPromptFile(templatePath);
		const ctx: RuntimeTemplateContext = {
			parentRole: runtimeContext.parentRole,
			objective: runtimeContext.objective,
			taskId: runtimeContext.taskId,
		};
		parts.push(renderRuntimeTemplate(template, ctx));
	}

	return parts.join("\n\n");
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
	primaryPath: string,
	fallbackPath: string,
): Promise<string | null> {
	try {
		return await loadPromptFile(primaryPath);
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}

	try {
		return await loadPromptFile(fallbackPath);
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}

	return null;
}

/** Strip YAML frontmatter from content if present. */
function stripFrontmatter(raw: string): string {
	const { content } = matter(raw);
	return content.trimStart();
}
