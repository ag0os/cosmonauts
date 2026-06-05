/**
 * Type definitions for named chains.
 */

export interface NamedChain {
	/** Chain name used by CLI and project config. */
	name: string;
	/** Human-readable description */
	description: string;
	/** Chain DSL expression (e.g. "planner -> task-manager -> coordinator") */
	chain: string;
}
