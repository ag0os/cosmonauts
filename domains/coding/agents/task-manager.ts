import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "task-manager",
	description:
		"Breaks approved plans into atomic, implementable tasks with acceptance criteria.",
	capabilities: ["core", "coding-readonly", "tasks"],
	model: "anthropic/claude-opus-4-6",
	tools: "readonly",
	extensions: ["tasks", "plans"],
	skills: [],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
