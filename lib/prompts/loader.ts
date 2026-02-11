/**
 * Prompt file loader — reads and concatenates system prompt layers from disk.
 *
 * Prompt references like "base/coding" resolve to `{promptsDir}/base/coding.md`.
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
 * @param promptRef - Prompt reference (e.g. "base/coding" → reads base/coding.md)
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
