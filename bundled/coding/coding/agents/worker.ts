import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "worker",
	description:
		"Implements a single task test-first. Loads relevant skills, writes code, checks off acceptance criteria.",
	capabilities: ["engineering-discipline", "coding-readwrite", "tasks"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["tasks"],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
