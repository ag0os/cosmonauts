import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	memory: {},
	id: "fixer",
	description:
		"Applies targeted fixes from quality or review findings and commits remediation changes.",
	capabilities: [
		"framework-base",
		"healthy-codebase-harness",
		"engineering-discipline",
		"coding-readwrite",
	],
	model: "openai-codex/gpt-5.6-sol",
	tools: "coding",
	extensions: ["project-tools"],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "medium",
};

export default definition;
