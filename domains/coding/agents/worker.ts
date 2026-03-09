import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "worker",
	description:
		"Implements a single task. Loads relevant skills, writes code, checks off acceptance criteria.",
	capabilities: ["core", "coding-readwrite", "tasks", "todo"],
	model: "anthropic/claude-opus-4-6",
	tools: "coding",
	extensions: ["tasks", "todo"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
