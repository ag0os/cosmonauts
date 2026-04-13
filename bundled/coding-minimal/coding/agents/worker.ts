import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "worker",
	description:
		"Implements a single task. Loads relevant skills, writes code, checks off acceptance criteria.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite", "tasks"],
	model: "openai-codex/gpt-5.4",
	tools: "coding",
	extensions: ["tasks"],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
