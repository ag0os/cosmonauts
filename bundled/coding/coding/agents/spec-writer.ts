import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "spec-writer",
	description:
		"Captures product requirements through interactive conversation. Explores the codebase for context, asks clarifying questions, and produces a structured spec document.",
	capabilities: ["core", "coding-readonly"],
	model: "anthropic/claude-opus-4-6",
	tools: "readonly",
	extensions: ["plans"],
	skills: ["pi", "plan"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
