/**
 * Workflow loader — resolves named workflows from domain-provided defaults
 * and project-level config (`.cosmonauts/config.json`).
 *
 * Domain workflows provide baseline definitions. Project config workflows
 * take precedence on name collision, allowing per-project customization.
 */

import { loadProjectConfig } from "../config/index.ts";
import type { LoadedDomain } from "../domains/types.ts";
import type { WorkflowDefinition } from "./types.ts";

export function selectDomainWorkflows(
	domains: readonly LoadedDomain[],
	domainContext?: string,
): WorkflowDefinition[] {
	return domains
		.filter(
			(domain) =>
				domainContext === undefined ||
				domain.manifest.id === "shared" ||
				domain.manifest.id === domainContext,
		)
		.flatMap((domain) => domain.workflows);
}

/**
 * Load all available workflows by merging domain-provided workflows with
 * project config. Project config takes precedence on name collision.
 */
export async function loadWorkflows(
	projectRoot: string,
	domainWorkflows?: readonly WorkflowDefinition[],
): Promise<WorkflowDefinition[]> {
	const config = await loadProjectConfig(projectRoot);

	// Start with domain-provided workflows
	const workflowMap = new Map<string, WorkflowDefinition>();
	if (domainWorkflows) {
		for (const wf of domainWorkflows) {
			workflowMap.set(wf.name, wf);
		}
	}

	// Project config workflows take precedence (overwrite)
	if (config.workflows) {
		for (const [name, def] of Object.entries(config.workflows)) {
			if (def && typeof def.chain === "string") {
				workflowMap.set(name, {
					name,
					description: def.description ?? "",
					chain: def.chain,
				});
			}
		}
	}

	return [...workflowMap.values()];
}

/**
 * Resolve a workflow by name. Throws if not found.
 */
export async function resolveWorkflow(
	name: string,
	projectRoot: string,
	domainWorkflows?: readonly WorkflowDefinition[],
): Promise<WorkflowDefinition> {
	const workflows = await loadWorkflows(projectRoot, domainWorkflows);
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
	domainWorkflows?: readonly WorkflowDefinition[],
): Promise<WorkflowDefinition[]> {
	return loadWorkflows(projectRoot, domainWorkflows);
}
