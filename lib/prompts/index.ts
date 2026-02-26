/**
 * Prompt loading — reads system prompt layers from disk.
 *
 * Re-exports the loader's public API.
 */

export type { RuntimeTemplateContext } from "./loader.ts";
export {
	loadPrompt,
	loadPrompts,
	PROMPTS_DIR,
	renderRuntimeTemplate,
} from "./loader.ts";
