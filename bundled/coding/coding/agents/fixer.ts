import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "fixer",
	description:
		"Applies targeted fixes from quality or review findings and commits remediation changes.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite"],
	model: "openai-codex/gpt-5.3-codex",
	tools: "coding",
	extensions: [],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
