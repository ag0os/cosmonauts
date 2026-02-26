/**
 * CLI option types for the cosmonauts entry point.
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

/** Parsed CLI options from Commander. */
export interface CliOptions {
	/** User prompt (positional args joined) */
	prompt?: string;
	/** Non-interactive print mode */
	print: boolean;
	/** Agent ID to use instead of cosmo (e.g. "planner", "worker") */
	agent?: string;
	/** Named workflow to run */
	workflow?: string;
	/** Raw chain DSL expression */
	chain?: string;
	/** Model override in "provider/model-id" format */
	model?: string;
	/** Thinking level override */
	thinking?: ThinkingLevel;
	/** Run the init subcommand */
	init: boolean;
	/** List available workflows and exit */
	listWorkflows: boolean;
	/** List available agent IDs and exit */
	listAgents: boolean;
}
