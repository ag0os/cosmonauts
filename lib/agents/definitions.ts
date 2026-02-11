/**
 * Built-in agent definitions matching the DESIGN.md spec table.
 *
 * Each definition uses `as const satisfies AgentDefinition` so TypeScript
 * narrows the literal types while enforcing the interface contract.
 */

import type { AgentDefinition } from "./types.ts";

export const COSMO_DEFINITION = {
	id: "cosmo",
	description:
		"Main coding assistant with orchestration capabilities. Delegates to sub-agents for complex workflows.",
	prompts: ["base/coding"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "coding",
	extensions: ["tasks", "orchestration", "todo", "init", "skills"],
	skills: undefined,
	subagents: ["planner", "task-manager", "coordinator", "worker"],
	projectContext: true,
	session: "persistent",
	loop: false,
} as const satisfies AgentDefinition;

export const PLANNER_DEFINITION = {
	id: "planner",
	description:
		"Designs solutions by exploring the codebase and proposing approaches. Never writes code or creates tasks.",
	prompts: ["base/coding", "roles/planner"],
	model: "anthropic/claude-opus-4-0",
	tools: "readonly",
	extensions: ["skills"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const TASK_MANAGER_DEFINITION = {
	id: "task-manager",
	description:
		"Breaks approved plans into atomic, implementable tasks with acceptance criteria.",
	prompts: ["roles/task-manager"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "readonly",
	extensions: ["tasks"],
	skills: [],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const COORDINATOR_DEFINITION = {
	id: "coordinator",
	description:
		"Delegates tasks to workers, monitors progress, and verifies completion. Loops until all tasks are done.",
	prompts: ["roles/coordinator"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "none",
	extensions: ["tasks", "orchestration"],
	skills: [],
	subagents: ["worker"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
} as const satisfies AgentDefinition;

export const WORKER_DEFINITION = {
	id: "worker",
	description:
		"Implements a single task. Loads relevant skills, writes code, checks off acceptance criteria.",
	prompts: ["base/coding", "roles/worker"],
	model: "anthropic/claude-sonnet-4-5",
	tools: "coding",
	extensions: ["tasks", "todo", "skills"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

/** All built-in agent definitions. */
export const BUILTIN_DEFINITIONS: readonly AgentDefinition[] = [
	COSMO_DEFINITION,
	PLANNER_DEFINITION,
	TASK_MANAGER_DEFINITION,
	COORDINATOR_DEFINITION,
	WORKER_DEFINITION,
];
