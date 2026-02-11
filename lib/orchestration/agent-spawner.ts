/**
 * Agent spawner for chain orchestration.
 * Creates and runs Pi agent sessions for chain stages.
 *
 * Agent identity is loaded from prompt files via DefaultResourceLoader's
 * appendSystemPrompt, keeping identity in the system prompt and operational
 * content in the user message.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getModel } from "@mariozechner/pi-ai";
import {
	createAgentSession,
	createCodingTools,
	createReadOnlyTools,
	DefaultResourceLoader,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentToolSet } from "../agents/index.ts";
import { createDefaultRegistry } from "../agents/index.ts";
import { loadPrompts } from "../prompts/index.ts";
import type {
	AgentSpawner,
	ModelConfig,
	SpawnConfig,
	SpawnResult,
} from "./types.ts";

const DEFAULT_REGISTRY = createDefaultRegistry();

const EXTENSIONS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"extensions",
);

/** Extensions that exist on disk and can be loaded by the agent spawner. */
const KNOWN_EXTENSIONS = new Set([
	"tasks",
	"orchestration",
	"todo",
	"init",
	"skills",
]);

// ============================================================================
// Model Resolution
// ============================================================================

const FALLBACK_MODEL = "anthropic/claude-sonnet-4-5";

/**
 * Return the model ID string for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `models` config (matched by role key)
 *  2. Agent definition model (from registry)
 *  3. `models.default` if provided
 *  4. Sonnet fallback
 */
export function getModelForRole(role: string, models?: ModelConfig): string {
	// Check explicit override from ModelConfig
	if (models) {
		const configKey = roleToConfigKey(role);
		if (configKey) {
			const override = models[configKey];
			if (override) return override;
		}
	}

	// Check agent definition for model
	const def = DEFAULT_REGISTRY.get(role);
	if (def?.model) {
		return def.model;
	}

	// Fallback: models.default or sonnet
	return models?.default ?? FALLBACK_MODEL;
}

// ============================================================================
// Definition Resolution Helpers
// ============================================================================

/**
 * Resolve a tool set name to the appropriate Pi tools for a given cwd.
 * Uses factory functions so tools resolve paths relative to the agent's cwd.
 */
export function resolveTools(toolSet: AgentToolSet, cwd: string) {
	switch (toolSet) {
		case "coding":
			return createCodingTools(cwd);
		case "readonly":
			return createReadOnlyTools(cwd);
		case "none":
			return [];
	}
}

/**
 * Resolve extension names to absolute paths, filtering to known extensions.
 * Unknown names are silently skipped.
 */
export function resolveExtensionPaths(extensions: readonly string[]): string[] {
	return extensions
		.filter((name) => KNOWN_EXTENSIONS.has(name))
		.map((name) => join(EXTENSIONS_DIR, name));
}

// ============================================================================
// Agent Spawner Factory
// ============================================================================

/**
 * Create an AgentSpawner backed by the Pi coding agent SDK.
 *
 * Each `spawn()` call creates an ephemeral in-memory session, sends the
 * user prompt, waits for completion, then disposes the session.
 *
 * Agent identity is injected via the system prompt using prompt files
 * loaded from the agent definition's `prompts` array.
 */
export function createPiSpawner(): AgentSpawner {
	return {
		async spawn(config: SpawnConfig): Promise<SpawnResult> {
			// Respect abort signal before doing any work
			if (config.signal?.aborted) {
				return {
					success: false,
					sessionId: "",
					messages: [],
					error: "Aborted before spawn",
				};
			}

			try {
				const modelId = config.model ?? getModelForRole(config.role);
				const model = resolveModel(modelId);

				// Resolve full agent definition
				const def = DEFAULT_REGISTRY.get(config.role);

				// Tools: use definition or fall back to coding tools
				const tools = def
					? resolveTools(def.tools, config.cwd)
					: createCodingTools(config.cwd);

				// System prompt from definition's prompt layers
				const promptContent = def?.prompts.length
					? await loadPrompts(def.prompts)
					: undefined;

				// Extensions: selective loading via additionalExtensionPaths
				const extensionPaths = def ? resolveExtensionPaths(def.extensions) : [];

				// Build resource loader with all definition fields
				const loader = new DefaultResourceLoader({
					cwd: config.cwd,
					...(promptContent && { appendSystemPrompt: promptContent }),
					noExtensions: true,
					...(extensionPaths.length > 0 && {
						additionalExtensionPaths: extensionPaths,
					}),
					noSkills: Array.isArray(def?.skills) && def.skills.length === 0,
					...(!def?.projectContext && {
						agentsFilesOverride: () => ({ agentsFiles: [] }),
					}),
				});
				await loader.reload();

				const { session } = await createAgentSession({
					cwd: config.cwd,
					model,
					tools,
					sessionManager: SessionManager.inMemory(),
					resourceLoader: loader,
				});

				try {
					// Send the user prompt clean — identity is in the system prompt
					await session.prompt(config.prompt);

					return {
						success: true,
						sessionId: session.sessionId,
						messages: [...session.messages],
					};
				} finally {
					session.dispose();
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					success: false,
					sessionId: "",
					messages: [],
					error: message,
				};
			}
		},

		dispose(): void {
			// No-op for now; interface-required placeholder.
		},
	};
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map a role string to its corresponding ModelConfig key.
 * Returns undefined for unknown roles.
 */
function roleToConfigKey(
	role: string,
): keyof Omit<ModelConfig, "default"> | undefined {
	switch (role) {
		case "planner":
			return "planner";
		case "task-manager":
			return "taskManager";
		case "coordinator":
			return "coordinator";
		case "worker":
			return "worker";
		default:
			return undefined;
	}
}

/**
 * Resolve a "provider/model-id" string into a Pi Model object.
 * Throws if the model is not found in the registry.
 */
function resolveModel(modelId: string) {
	const slashIndex = modelId.indexOf("/");
	if (slashIndex === -1) {
		throw new Error(
			`Invalid model ID "${modelId}": expected "provider/model" format`,
		);
	}

	const provider = modelId.slice(0, slashIndex);
	const id = modelId.slice(slashIndex + 1);

	const model = getModel(
		provider as Parameters<typeof getModel>[0],
		id as never,
	);
	if (!model) {
		throw new Error(`Model not found: provider="${provider}", id="${id}"`);
	}

	return model;
}
