/**
 * Built-in agent definitions matching the DESIGN.md spec table.
 *
 * Each definition uses `as const satisfies AgentDefinition` so TypeScript
 * narrows the literal types while enforcing the interface contract.
 */

import type { AgentDefinition } from "./types.ts";

export const COSMO_DEFINITION = {
	id: "cosmo",
	namespace: "coding",
	description:
		"Main coding assistant with orchestration capabilities. Delegates to sub-agents for complex workflows.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readwrite",
		"capabilities/tasks",
		"capabilities/spawning",
		"capabilities/todo",
		"agents/coding/cosmo",
	],
	model: "anthropic/claude-sonnet-4-5",
	tools: "coding",
	extensions: ["tasks", "plans", "orchestration", "todo", "init"],
	skills: undefined,
	subagents: ["planner", "task-manager", "coordinator", "worker"],
	projectContext: true,
	session: "persistent",
	loop: false,
} as const satisfies AgentDefinition;

export const PLANNER_DEFINITION = {
	id: "planner",
	namespace: "coding",
	description:
		"Designs solutions by exploring the codebase and proposing approaches. Never writes code or creates tasks.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readonly",
		"agents/coding/planner",
	],
	model: "anthropic/claude-opus-4-0",
	tools: "readonly",
	extensions: ["plans"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const TASK_MANAGER_DEFINITION = {
	id: "task-manager",
	namespace: "coding",
	description:
		"Breaks approved plans into atomic, implementable tasks with acceptance criteria.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/tasks",
		"agents/coding/task-manager",
	],
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
	namespace: "coding",
	description:
		"Delegates tasks to workers, monitors progress, and verifies completion. Loops until all tasks are done.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/tasks",
		"capabilities/spawning",
		"agents/coding/coordinator",
	],
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
	namespace: "coding",
	description:
		"Implements a single task. Loads relevant skills, writes code, checks off acceptance criteria.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readwrite",
		"capabilities/tasks",
		"capabilities/todo",
		"agents/coding/worker",
	],
	model: "anthropic/claude-sonnet-4-5",
	tools: "coding",
	extensions: ["tasks", "todo"],
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
