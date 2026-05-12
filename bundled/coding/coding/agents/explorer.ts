import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "explorer",
	description:
		"Performs readonly codebase exploration and fact-finding. Reports discoveries without writing code or creating tasks.",
	capabilities: ["coding-readonly"],
	model: "openai-codex/gpt-5.5",
	tools: "readonly",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "low",
};

export default definition;
