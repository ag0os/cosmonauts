import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "fixer",
	description:
		"Applies targeted fixes from quality or review findings and commits remediation changes.",
	capabilities: ["engineering-discipline", "coding-readwrite"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
