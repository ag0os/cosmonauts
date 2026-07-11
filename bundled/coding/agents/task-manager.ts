import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "task-manager",
	description:
		"Breaks approved plans into atomic, implementable tasks with acceptance criteria.",
	capabilities: ["healthy-codebase-harness", "coding-readonly", "tasks"],
	model: "openai-codex/gpt-5.6-sol",
	tools: "readonly",
	extensions: ["tasks", "plans"],
	skills: ["task", "work-artifacts"],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
