/**
 * Type definitions for project-level configuration.
 *
 * Projects declare their configuration in `.cosmonauts/config.json`.
 */

/** Workflow entry in project config. */
export interface ProjectWorkflowConfig {
	readonly description: string;
	readonly chain: string;
}

/** Project-level configuration loaded from `.cosmonauts/config.json`. */
export interface ProjectConfig {
	/** Skills relevant to this project. Filters agent skill indices to this set. */
	readonly skills?: readonly string[];
	/** Custom workflow definitions (name → config). */
	readonly workflows?: Readonly<Record<string, ProjectWorkflowConfig>>;
}
