/**
 * Built-in agent definitions matching the AGENTS.md agent definitions table.
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
	model: "anthropic/claude-opus-4-6",
	tools: "coding",
	extensions: ["tasks", "plans", "orchestration", "todo", "init"],
	skills: undefined,
	subagents: [
		"planner",
		"task-manager",
		"coordinator",
		"worker",
		"quality-manager",
		"reviewer",
		"fixer",
	],
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
		"capabilities/spawning",
		"agents/coding/planner",
	],
	model: "anthropic/claude-opus-4-6",
	tools: "readonly",
	extensions: ["plans", "orchestration"],
	skills: undefined,
	subagents: ["task-manager", "coordinator", "worker"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
} as const satisfies AgentDefinition;

export const TASK_MANAGER_DEFINITION = {
	id: "task-manager",
	namespace: "coding",
	description:
		"Breaks approved plans into atomic, implementable tasks with acceptance criteria.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readonly",
		"capabilities/tasks",
		"agents/coding/task-manager",
	],
	model: "anthropic/claude-opus-4-6",
	tools: "readonly",
	extensions: ["tasks", "plans"],
	skills: [],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
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
	model: "anthropic/claude-opus-4-6",
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
	model: "anthropic/claude-opus-4-6",
	tools: "coding",
	extensions: ["tasks", "todo"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const QUALITY_MANAGER_DEFINITION = {
	id: "quality-manager",
	namespace: "coding",
	description:
		"Runs quality gates and clean-context review, then orchestrates fixes until changes are merge-ready.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readwrite",
		"capabilities/tasks",
		"capabilities/spawning",
		"agents/coding/quality-manager",
	],
	model: "openai-codex/gpt-5.3-codex",
	tools: "coding",
	extensions: ["tasks", "orchestration"],
	skills: undefined,
	subagents: ["reviewer", "fixer", "coordinator"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const REVIEWER_DEFINITION = {
	id: "reviewer",
	namespace: "coding",
	description:
		"Performs clean-context code review against main and writes structured findings for remediation.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readwrite",
		"agents/coding/reviewer",
	],
	model: "openai-codex/gpt-5.3-codex",
	tools: "coding",
	extensions: [],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
} as const satisfies AgentDefinition;

export const FIXER_DEFINITION = {
	id: "fixer",
	namespace: "coding",
	description:
		"Applies targeted fixes from quality or review findings and commits remediation changes.",
	prompts: [
		"cosmonauts",
		"capabilities/core",
		"capabilities/coding-readwrite",
		"agents/coding/fixer",
	],
	model: "openai-codex/gpt-5.3-codex",
	tools: "coding",
	extensions: [],
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
	QUALITY_MANAGER_DEFINITION,
	REVIEWER_DEFINITION,
	FIXER_DEFINITION,
];
