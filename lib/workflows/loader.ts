/**
 * Workflow loader — resolves named workflows from built-in defaults
 * and optional project-level config (.cosmonauts/workflows.json).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_WORKFLOWS } from "./defaults.ts";
import type { WorkflowDefinition } from "./types.ts";

const CONFIG_DIR = ".cosmonauts";
const CONFIG_FILE = "workflows.json";

interface WorkflowConfigFile {
	workflows: Record<
		string,
		{
			description: string;
			chain: string;
		}
	>;
}

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
	const projectWorkflows = await loadProjectWorkflows(projectRoot);
	for (const wf of projectWorkflows) {
		byName.set(wf.name, wf);
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

/**
 * Load project-level workflow definitions from .cosmonauts/workflows.json.
 * Returns empty array if file doesn't exist or is invalid.
 */
async function loadProjectWorkflows(
	projectRoot: string,
): Promise<WorkflowDefinition[]> {
	const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);

	let raw: string;
	try {
		raw = await readFile(configPath, "utf-8");
	} catch {
		return []; // File doesn't exist — that's fine
	}

	let parsed: WorkflowConfigFile;
	try {
		parsed = JSON.parse(raw) as WorkflowConfigFile;
	} catch {
		throw new Error(
			`Invalid JSON in ${configPath}. Expected { "workflows": { ... } }`,
		);
	}

	if (!parsed.workflows || typeof parsed.workflows !== "object") {
		return [];
	}

	const results: WorkflowDefinition[] = [];
	for (const [name, def] of Object.entries(parsed.workflows)) {
		if (def && typeof def.chain === "string") {
			results.push({
				name,
				description: def.description ?? "",
				chain: def.chain,
			});
		}
	}

	return results;
}
