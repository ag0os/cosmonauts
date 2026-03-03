/**
 * Workflow loader — resolves named workflows from built-in defaults
 * and optional project-level config (.cosmonauts/config.json).
 */

import { loadProjectConfig } from "../config/index.ts";
import { DEFAULT_WORKFLOWS } from "./defaults.ts";
import type { WorkflowDefinition } from "./types.ts";

/**
 * Load all available workflows: built-in defaults merged with project config.
 * Project-level definitions override built-in defaults on name collision.
 */
export async function loadWorkflows(
	projectRoot: string,
): Promise<WorkflowDefinition[]> {
	const byName = new Map<string, WorkflowDefinition>();

	// Start with defaults
	for (const wf of DEFAULT_WORKFLOWS) {
		byName.set(wf.name, wf);
	}

	// Merge project config (overrides on collision)
	const config = await loadProjectConfig(projectRoot);
	if (config.workflows) {
		for (const [name, def] of Object.entries(config.workflows)) {
			if (def && typeof def.chain === "string") {
				byName.set(name, {
					name,
					description: def.description ?? "",
					chain: def.chain,
				});
			}
		}
	}

	return [...byName.values()];
}

/**
 * Resolve a workflow by name. Throws if not found.
 */
export async function resolveWorkflow(
	name: string,
	projectRoot: string,
): Promise<WorkflowDefinition> {
	const workflows = await loadWorkflows(projectRoot);
	const found = workflows.find((wf) => wf.name === name);
	if (!found) {
		const available = workflows.map((wf) => wf.name).join(", ");
		throw new Error(`Unknown workflow "${name}". Available: ${available}`);
	}
	return found;
}

/**
 * List all available workflows with descriptions.
 */
export async function listWorkflows(
	projectRoot: string,
): Promise<WorkflowDefinition[]> {
	return loadWorkflows(projectRoot);
}
