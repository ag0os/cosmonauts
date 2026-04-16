/**
 * Model and thinking resolution for chain orchestration.
 * Determines the model ID and thinking level for each agent role
 * based on explicit overrides, agent definitions, and fallbacks.
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { AgentRegistry } from "../agents/index.ts";
import { roleToConfigKey } from "../agents/qualified-role.ts";
import type { ModelConfig, ThinkingConfig } from "./types.ts";

// ============================================================================
// Model Resolution
// ============================================================================

export const FALLBACK_MODEL = "anthropic/claude-opus-4-7";

/**
 * Return the model ID string for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `models` config (matched by role key)
 *  2. Agent definition model (from registry)
 *  3. `models.default` if provided
 *  4. Sonnet fallback
 */
export function getModelForRole(
	role: string,
	models?: ModelConfig,
	registry?: AgentRegistry,
	domainContext?: string,
): string {
	// Check explicit override from ModelConfig
	if (models) {
		const configKey = roleToConfigKey(role);
		if (configKey) {
			const override = models[configKey];
			if (override) return override;
		}
	}

	// Check agent definition for model
	const def = registry?.get(role, domainContext);
	if (def?.model) {
		return def.model;
	}

	// Fallback: models.default or sonnet
	return models?.default ?? FALLBACK_MODEL;
}

// ============================================================================
// Thinking Resolution
// ============================================================================

/**
 * Return the thinking level for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `thinking` config (matched by role key)
 *  2. Agent definition thinkingLevel (from registry)
 *  3. `thinking.default` if provided
 *  4. `undefined` (no thinking — Pi default)
 */
export function getThinkingForRole(
	role: string,
	thinking?: ThinkingConfig,
	registry?: AgentRegistry,
	domainContext?: string,
): ThinkingLevel | undefined {
	// Check explicit override from ThinkingConfig
	if (thinking) {
		const configKey = roleToConfigKey(role);
		if (configKey) {
			const override = thinking[configKey];
			if (override) return override;
		}
	}

	// Check agent definition for thinkingLevel
	const def = registry?.get(role, domainContext);
	if (def?.thinkingLevel) {
		return def.thinkingLevel;
	}

	// Fallback: thinking.default or undefined
	return thinking?.default ?? undefined;
}

// ============================================================================
// Model Object Resolution
// ============================================================================

/**
 * Resolve a "provider/model-id" string into a Pi Model object.
 * Throws if the model is not found in the registry.
 */
export function resolveModel(modelId: string) {
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
