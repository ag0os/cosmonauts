import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "reviewer",
	description:
		"Performs clean-context code review against main and writes structured findings for remediation.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite"],
	model: "openai-codex/gpt-5.4",
	tools: "coding",
	extensions: [],
	skills: undefined,
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
