import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "reviewer",
	description:
		"Performs clean-context code review against main and writes structured findings for remediation.",
	capabilities: ["engineering-discipline", "coding-readwrite"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
