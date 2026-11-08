import { unqualifyRole } from "../agents/qualified-role.ts";
/**
 * Model and thinking resolution for chain orchestration.
 * Determines the model ID and thinking level for each agent role
 * based on explicit overrides, agent definitions, and fallbacks.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AgentRegistry } from "../agents/index.ts";
import type { ModelConfig, ThinkingConfig } from "./types.ts";

const builtinModelCatalog = builtinModels();

// ============================================================================
// Model Resolution
// ============================================================================

/** A model is supplied by the declaration or its consumer; the library has no model policy. */
export function requireModelId(modelId: string | undefined): string {
	if (!modelId)
		throw new Error(
			"No model configured. Supply an agent model or a consumer defaultModel.",
		);
	return modelId;
}

/**
 * Return the model ID string for a given agent role.
 *
 * Resolution order:
 *  1. Explicit override from `models` config (matched by role key)
 *  2. Agent definition model (from registry)
 *  3. `models.default` if provided
 *  4. Error when no consumer default was supplied
 */
export function getModelForRole(
	role: string,
	models?: ModelConfig,
	registry?: AgentRegistry,
	domainContext?: string,
): string {
	const override = models?.[role] ?? models?.[unqualifyRole(role)];
	if (override) return override;

	// Check agent definition for model
	const def = registry?.get(role, domainContext);
	if (def?.model) {
		return def.model;
	}

	// Consumer default, otherwise fail before requesting a model.
	return requireModelId(models?.default);
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
	const override = thinking?.[role] ?? thinking?.[unqualifyRole(role)];
	if (override) return override;

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
export function resolveModel(modelId: string, modelRegistry?: ModelRegistry) {
	const slashIndex = modelId.indexOf("/");
	if (slashIndex === -1) {
		throw new Error(
			`Invalid model ID "${modelId}": expected "provider/model" format`,
		);
	}

	const provider = modelId.slice(0, slashIndex);
	const id = modelId.slice(slashIndex + 1);

	const model =
		modelRegistry?.find(provider, id) ??
		builtinModelCatalog.getModel(provider, id);
	if (!model) {
		throw new Error(`Model not found: provider="${provider}", id="${id}"`);
	}

	return model;
}
