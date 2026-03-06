/**
 * Workflow loader — resolves named workflows from project-level config
 * (`.cosmonauts/config.json`).
 */

import { loadProjectConfig } from "../config/index.ts";
import type { WorkflowDefinition } from "./types.ts";

/**
 * Load all available workflows from project config.
 */
export async function loadWorkflows(
	projectRoot: string,
): Promise<WorkflowDefinition[]> {
	const config = await loadProjectConfig(projectRoot);
	const workflows: WorkflowDefinition[] = [];

	if (config.workflows) {
		for (const [name, def] of Object.entries(config.workflows)) {
			if (def && typeof def.chain === "string") {
				workflows.push({
					name,
					description: def.description ?? "",
					chain: def.chain,
				});
			}
		}
	}

	return workflows;
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
