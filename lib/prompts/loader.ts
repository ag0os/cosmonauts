/**
 * Prompt file loader — reads and concatenates system prompt layers from disk.
 *
 * Prompt references like "cosmonauts" or "capabilities/core" resolve to
 * `{promptsDir}/cosmonauts.md` or `{promptsDir}/capabilities/core.md`.
 * If a file contains YAML frontmatter, it is stripped automatically.
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

// ============================================================================
// Constants
// ============================================================================

/** Default prompts directory, resolved relative to the package root. */
export const PROMPTS_DIR: string = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"prompts",
);

// ============================================================================
// Public API
// ============================================================================

/**
 * Load a single prompt file by reference.
 *
 * @param promptRef - Prompt reference (e.g. "cosmonauts" → reads cosmonauts.md)
 * @param promptsDir - Base directory to resolve from (defaults to PROMPTS_DIR)
 * @returns The prompt file content with any YAML frontmatter stripped
 * @throws If the file does not exist or cannot be read
 */
export async function loadPrompt(
	promptRef: string,
	promptsDir: string = PROMPTS_DIR,
): Promise<string> {
	const filePath = join(promptsDir, `${promptRef}.md`);

	let raw: string;
	try {
		raw = await readFile(filePath, "utf-8");
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT") {
			throw new Error(
				`Prompt file not found: ${filePath} (ref: "${promptRef}")`,
			);
		}
		throw err;
	}

	return stripFrontmatter(raw);
}

/**
 * Load and concatenate multiple prompt files in order.
 *
 * @param promptRefs - Array of prompt references to load
 * @param promptsDir - Base directory to resolve from (defaults to PROMPTS_DIR)
 * @returns Concatenated prompt content separated by double newlines
 */
export async function loadPrompts(
	promptRefs: readonly string[],
	promptsDir: string = PROMPTS_DIR,
): Promise<string> {
	if (promptRefs.length === 0) return "";

	const contents = await Promise.all(
		promptRefs.map((ref) => loadPrompt(ref, promptsDir)),
	);

	return contents.join("\n\n");
}

// ============================================================================
// Runtime Template Rendering
// ============================================================================

/** Context values for rendering the runtime sub-agent prompt template. */
export interface RuntimeTemplateContext {
	parentRole?: string;
	objective?: string;
	taskId?: string;
}

/**
 * Render a runtime prompt template by replacing known placeholders.
 *
 * Handles:
 * - `{{parentRole}}` — defaults to "unknown"
 * - `{{objective}}` — defaults to "Complete the assigned work"
 * - `{{taskId}}` — no default; omitted sections are removed entirely
 * - `{{#taskId}}...{{/taskId}}` — conditional block, included only when taskId is provided
 *
 * After replacement, any remaining `{{...}}` tokens are stripped to prevent
 * unresolved placeholders from leaking into the system prompt.
 */
export function renderRuntimeTemplate(
	template: string,
	context: RuntimeTemplateContext,
): string {
	let result = template;

	// Handle conditional blocks: {{#taskId}}...{{/taskId}}
	if (context.taskId) {
		// Keep block content, remove delimiters
		result = result.replace(/\{\{#taskId\}\}([\s\S]*?)\{\{\/taskId\}\}/g, "$1");
	} else {
		// Remove entire block including delimiters
		result = result.replace(/\{\{#taskId\}\}[\s\S]*?\{\{\/taskId\}\}/g, "");
	}

	// Replace simple tokens with values or defaults
	result = result.replace(
		/\{\{parentRole\}\}/g,
		context.parentRole ?? "unknown",
	);
	result = result.replace(
		/\{\{objective\}\}/g,
		context.objective ?? "Complete the assigned work",
	);
	result = result.replace(/\{\{taskId\}\}/g, context.taskId ?? "");

	// Strip any remaining unresolved template tokens
	result = result.replace(/\{\{[^}]*\}\}/g, "");

	// Clean up blank lines left by removed blocks
	result = result.replace(/\n{3,}/g, "\n\n");

	return result.trim();
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip YAML frontmatter from content if present.
 * Returns the content portion, trimmed of leading whitespace left by frontmatter removal.
 */
function stripFrontmatter(raw: string): string {
	const { content } = matter(raw);
	return content.trimStart();
}
