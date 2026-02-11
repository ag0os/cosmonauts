/**
 * Type definitions for the workflow system.
 */

export interface WorkflowDefinition {
	/** Workflow name (used as --workflow argument) */
	name: string;
	/** Human-readable description */
	description: string;
	/** Chain DSL expression (e.g. "planner -> task-manager -> coordinator") */
	chain: string;
}
