import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "refactorer",
	description:
		"REFACTOR phase: improves code structure without changing behavior. All tests must stay green throughout.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite", "tasks"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["tasks"],
	skills: ["tdd", "refactoring", "engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
