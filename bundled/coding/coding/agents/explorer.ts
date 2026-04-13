import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "explorer",
	description:
		"Performs readonly codebase exploration and fact-finding. Reports discoveries without writing code or creating tasks.",
	capabilities: ["core", "coding-readonly"],
	model: "openai-codex/gpt-5.4",
	tools: "readonly",
	extensions: [],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
