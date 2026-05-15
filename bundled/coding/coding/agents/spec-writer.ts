import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "spec-writer",
	description:
		"Captures the WHAT and WHY of a feature through brainstorming conversation with the human — what it does, who uses it, how they benefit. Produces a spec document the planner designs against. Never designs architecture or writes code.",
	capabilities: ["healthy-codebase-harness", "coding-readonly"],
	model: "anthropic/claude-opus-4-7",
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
