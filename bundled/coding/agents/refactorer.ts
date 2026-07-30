import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "refactorer",
	description:
		"Dedicated refactoring agent: restructures existing code without changing observable behavior. All tests must stay green throughout.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
	],
	model: "openai-codex/gpt-5.6-sol",
	tools: "coding",
	extensions: ["tasks", "project-tools"],
	skills: ["tdd", "refactoring", "engineering-principles", "analysis"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
